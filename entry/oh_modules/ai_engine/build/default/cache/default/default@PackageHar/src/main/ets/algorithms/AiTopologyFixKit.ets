/**
 * AI 自检修复工具箱 — 真改拓扑（非仅 reroute 空转）
 *
 * 覆盖：仪器重建、标号降级、引脚重挂、电源短接拆分、浮空脚补 stub、
 * 脏 pinId 清洗。供 AiPipelineOrchestrator.applyOneAiFix 调用。
 */
import {
  SchTopology, NetInfo, NetLabelInfo, NetNodeRef, DeviceInst, Point2D,
  IdUtil, makeRouteLine, Logger, INSTR_TRACE_TAG, traceAiDiag,
  DeviceHitGeometry, WorldHitRect, SELECTION_HIT_PAD
} from 'common';
import { IComponentLibrary } from 'component_library';
import { PinWorldResolver } from './PinWorldResolver';
import { ConstrainedWiringEngine } from './ConstrainedWiringEngine';
import { NetPlanExecutor } from './NetPlanExecutor';

export interface TopologyFixResult {
  fixed: number;
  needReroute: boolean;
  notes: string[];
}

/** finalizeForGate 意图开关（由编排器传入，避免 FixKit 依赖 CircuitIntent） */
export interface FinalizeGateOpts {
  seriesRcCharge?: boolean;
  mutualLedIndicator?: boolean;
  /** 模块边界脚键（RefDes.Pin 大写），单脚网不得 prune */
  preserveBoundaryKeys?: string[];
}

/** stripInstrSenseFromPowerNets 暂存项 */
interface MovedSensePin {
  node: NetNodeRef;
  from: string;
}

export class AiTopologyFixKit {
  private static library: IComponentLibrary | null = null;

  static setComponentLibrary(library: IComponentLibrary): void {
    AiTopologyFixKit.library = library;
  }

  static emptyResult(): TopologyFixResult {
    return { fixed: 0, needReroute: false, notes: [] };
  }

  // ─── 入口：按 fixAction 分发 ─────────────────────────────────────────

  /**
   * 仪器/密集区拓扑重建：
   * 1) 清洗脏 pinId  2) 拆电源短接  3) 仪器测量脚离电源网
   * 4) 全网（或仪器相关网）改标号 stub  5) 浮空脚补 stub
   */
  static rebuildInstrument(topo: SchTopology, wiring: ConstrainedWiringEngine,
    targetRef?: string): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    fixed += AiTopologyFixKit.sanitizeTopoPinIds(topo);
    const split = AiTopologyFixKit.splitMergedPowerRails(topo);
    fixed += split.fixed;
    notes.push(...split.notes);
    const strip = AiTopologyFixKit.stripInstrSenseFromPowerNets(topo);
    fixed += strip.fixed;
    notes.push(...strip.notes);

    // 仅 demote 仪器相关网（禁止无目标时全网 demote 破坏电源拓扑）
    const demoteUuids = AiTopologyFixKit.collectInstrumentRelatedNetUuids(topo, targetRef);
    if (demoteUuids.size > 0) {
      const n = wiring.demoteNetsToLabelStubs(topo, demoteUuids);
      if (n > 0) {
        fixed += n;
        notes.push(`demote→labels stubs=${n} nets=${demoteUuids.size}`);
      }
    } else {
      notes.push('no instrument nets — skip demote, heal only');
    }
    const heal = AiTopologyFixKit.ensureStubsForAllNetNodes(topo, wiring);
    fixed += heal.fixed;
    notes.push(...heal.notes);
    const floatHeal = AiTopologyFixKit.healFloatingPins(topo, wiring);
    fixed += floatHeal.fixed;
    notes.push(...floatHeal.notes);

    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] rebuild_instrument fixed=${fixed} target=${targetRef ?? '*'}` +
      ` | ${notes.slice(0, 4).join('; ')}`);
    if (notes.length > 0) {
      traceAiDiag('AI_FIX', 'rebuild_instrument', notes, 12);
    }
    return { fixed, needReroute: true, notes };
  }

  /** 指定网改标号 stub */
  static demoteNetByName(topo: SchTopology, wiring: ConstrainedWiringEngine,
    netName: string): TopologyFixResult {
    const want = (netName ?? '').toUpperCase();
    if (want.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const uuids = new Set<string>();
    for (let i = 0; i < topo.netList.length; i++) {
      if ((topo.netList[i].netName ?? '').toUpperCase() === want) {
        uuids.add(topo.netList[i].netUuid);
      }
    }
    if (uuids.size === 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_FIX] demote_to_label miss net="${netName}"`);
      return AiTopologyFixKit.emptyResult();
    }
    const n = wiring.demoteNetsToLabelStubs(topo, uuids);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] demote_to_label net=${netName} stubs=${n}`);
    return { fixed: n > 0 ? 1 : 0, needReroute: true, notes: [`demote ${netName} stubs=${n}`] };
  }

  /** 全部网络改标号（nuclear，保留 node 绑定） */
  static demoteAllToLabels(topo: SchTopology, wiring: ConstrainedWiringEngine): TopologyFixResult {
    AiTopologyFixKit.sanitizeTopoPinIds(topo);
    const uuids = new Set<string>();
    for (let i = 0; i < topo.netList.length; i++) {
      uuids.add(topo.netList[i].netUuid);
    }
    const n = wiring.demoteNetsToLabelStubs(topo, uuids);
    const heal = AiTopologyFixKit.ensureStubsForAllNetNodes(topo, wiring);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] demote_all_labels stubs=${n} heal=${heal.fixed}`);
    return {
      fixed: (n > 0 ? 1 : 0) + heal.fixed,
      needReroute: false,
      notes: [`demote_all stubs=${n}`, ...heal.notes]
    };
  }

  /**
   * 将器件引脚改挂到目标网（不存在则创建），并补标号 stub。
   * pinId 支持 "1(VCC)" 脏写法。
   */
  static reconnectPin(topo: SchTopology, wiring: ConstrainedWiringEngine,
    refName: string, pinIdRaw: string, netName: string): TopologyFixResult {
    const ref = (refName ?? '').trim();
    const netWant = (netName ?? '').trim();
    if (ref.length === 0 || netWant.length === 0 || !(pinIdRaw ?? '').trim()) {
      return AiTopologyFixKit.emptyResult();
    }
    const tok = NetPlanExecutor.sanitizePinToken(pinIdRaw, pinIdRaw);
    const pinId = tok.pinId;
    const pinName = tok.pinName;
    const dev = topo.deviceList.find(d =>
      (d.refName ?? '').toUpperCase() === ref.toUpperCase());
    if (!dev) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_FIX] reconnect_pin miss device=${ref}`);
      return AiTopologyFixKit.emptyResult();
    }
    // 禁止挂库外假脚（UA741 无 V+/V-，挂上后 stub 从器件中心引出 → pin_proximity 死循环）
    if (!AiTopologyFixKit.deviceHasPin(dev, pinId)) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_FIX] reconnect_pin skip unknown pin ${ref}.${pinId} lib=${dev.libDevId}`);
      return AiTopologyFixKit.emptyResult();
    }

    // 已在目标网且未挂其它网 → 幂等跳过（避免 clear-loop 假进度）
    let onTarget = false;
    let onOther = false;
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const hit = net.nodeList.some(n =>
        n.devUuid === dev.instUuid &&
        (n.pinId ?? '').toUpperCase() === pinId.toUpperCase());
      if (!hit) {
        continue;
      }
      if ((net.netName ?? '').toUpperCase() === netWant.toUpperCase()) {
        onTarget = true;
      } else {
        onOther = true;
      }
    }
    if (onTarget && !onOther) {
      return AiTopologyFixKit.emptyResult();
    }

    // 从旧网摘掉
    let removed = 0;
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const before = net.nodeList.length;
      net.nodeList = net.nodeList.filter(n =>
        !(n.devUuid === dev.instUuid &&
          (n.pinId ?? '').toUpperCase() === pinId.toUpperCase()));
      removed += before - net.nodeList.length;
    }

    let target = topo.netList.find(n =>
      (n.netName ?? '').toUpperCase() === netWant.toUpperCase());
    if (!target) {
      const nameUp = netWant.toUpperCase();
      const isPower = nameUp === 'VCC' || nameUp === 'VDD' || nameUp === '+5V';
      const isGnd = nameUp === 'GND' || nameUp === 'VSS';
      target = {
        netUuid: IdUtil.generate('net'),
        netName: netWant,
        displayName: netWant,
        nodeList: [],
        isPower: isPower || isGnd,
        isAnalog: false,
        isBusMember: false,
        busParentUuid: '',
        defaultVoltage: isPower ? 5.0 : 0.0,
        ercWarning: false,
        connectedProbeIds: []
      };
      topo.netList.push(target);
    }
    const exists = target.nodeList.some(n =>
      n.devUuid === dev.instUuid &&
      (n.pinId ?? '').toUpperCase() === pinId.toUpperCase());
    if (!exists) {
      const node: NetNodeRef = { devUuid: dev.instUuid, pinId, pinName };
      target.nodeList.push(node);
    }

    // 清该脚旧 stub 导线（按几何近邻粗清）后补新 stub
    AiTopologyFixKit.removeWiresNearPin(topo, dev, pinId, pinName);
    AiTopologyFixKit.addLabelStubForPin(topo, wiring, target, dev, pinId, pinName);

    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] reconnect_pin ${ref}.${pinId} → ${netWant} (removedOld=${removed})`);
    return {
      fixed: 1,
      needReroute: true,
      notes: [`${ref}.${pinId}→${netWant}`]
    };
  }

  /**
   * RELAY_SPDT 互斥双色触点接线（SchTopology 版）：
   * COM→GND；NC←LED_GREEN.K；NO←LED_RED.K；线圈 1←SW.2 / 2→GND（有 SW 时）。
   * 限流支路 VCC→R→LED.A 尽量挂网。
   */
  static wireRelaySpdtDualLed(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const relay = topo.deviceList.find(d =>
      d.libDevId === 'RELAY_SPDT' || (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);
    if (!relay) {
      return AiTopologyFixKit.emptyResult();
    }
    const gnd = topo.deviceList.find(d =>
      (d.libDevId ?? '').toUpperCase() === 'GND' || (d.libDevId ?? '').toUpperCase() === 'VSS');
    const vcc = topo.deviceList.find(d =>
      (d.libDevId ?? '').toUpperCase() === 'VCC' || (d.libDevId ?? '').toUpperCase() === 'VDD');
    const sw = topo.deviceList.find(d => (d.libDevId ?? '').toUpperCase().startsWith('SW_'));
    const leds = topo.deviceList.filter(d => (d.libDevId ?? '').toUpperCase().startsWith('LED_'));
    const resistors = topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('R_'));
    let ledGreen = leds.find(l => (l.libDevId ?? '').toUpperCase().indexOf('GREEN') >= 0) ?? leds[0];
    let ledRed = leds.find(l => (l.libDevId ?? '').toUpperCase().indexOf('RED') >= 0) ??
      (leds.length > 1 ? leds[1] : leds[0]);
    if (!ledGreen || !gnd) {
      Logger.warn(INSTR_TRACE_TAG,
        '[AI_FIX] wireRelay: missing LED/GND — skip contact wiring');
      return AiTopologyFixKit.emptyResult();
    }
    if (!ledRed) {
      ledRed = ledGreen;
    }

    const rc = (ref: string, pin: string, net: string): void => {
      const r = AiTopologyFixKit.reconnectPin(topo, wiring, ref, pin, net);
      fixed += r.fixed;
      notes.push(...r.notes);
    };

    rc(relay.refName, 'COM', 'GND');
    if (gnd) {
      rc(gnd.refName, '1', 'GND');
    }

    // NC / NO 触点支路
    rc(ledGreen.refName, 'K', 'REL_NC');
    rc(relay.refName, 'NC', 'REL_NC');
    if (ledRed && ledRed.instUuid !== ledGreen.instUuid) {
      rc(ledRed.refName, 'K', 'REL_NO');
      rc(relay.refName, 'NO', 'REL_NO');
    } else {
      rc(relay.refName, 'NO', 'REL_NO');
    }

    // 限流：每颗 LED 必须独立 R（VCC→R.1，R.2→LED.A）
    const dualLed = ledRed && ledRed.instUuid !== ledGreen.instUuid;
    if (vcc && resistors.length > 0) {
      const rG = resistors[0];
      rc(vcc.refName, '1', 'VCC');
      rc(rG.refName, '1', 'VCC');
      rc(rG.refName, '2', 'REL_NC_A');
      rc(ledGreen.refName, 'A', 'REL_NC_A');
      if (dualLed) {
        if (resistors.length > 1) {
          const rR = resistors[1];
          rc(rR.refName, '1', 'VCC');
          rc(rR.refName, '2', 'REL_NO_A');
          rc(ledRed.refName, 'A', 'REL_NO_A');
        } else {
          // 仅 1 颗 R：禁止两 LED 共阳短路 — 红灯支路暂不挂 VCC，记 warning
          notes.push('NEED_SECOND_R for LED_RED anode — skip shared R');
          Logger.warn(INSTR_TRACE_TAG,
            '[AI_FIX] wireRelay: dual LED but only 1 resistor — red anode unwired');
        }
      }
    } else if (dualLed) {
      notes.push('NEED_RESISTORS for dual LED anodes');
    }

    // 线圈
    if (sw && vcc) {
      rc(vcc.refName, '1', 'VCC');
      rc(sw.refName, '1', 'VCC');
      rc(sw.refName, '2', 'REL_COIL');
      rc(relay.refName, '1', 'REL_COIL');
      rc(relay.refName, '2', 'GND');
      notes.push(`coil via ${sw.refName}`);
    } else {
      notes.push('coil undriven (no SW)');
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] wireRelaySpdtDualLed fixed=${fixed} relay=${relay.refName}` +
      ` | ${notes.slice(0, 6).join('; ')}`);
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 串联 RC 充放电拓扑：VCC→(SW?)→R.1 → R.2/C.1=RC_MID → C.2→GND；
   * 示波器 CH1→RC_MID，GND→GND。用于 clear-loop / add_component 后确定性接线。
   */
  static wireSeriesRc(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const vcc = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'VCC' || u === 'VDD';
    });
    const gnd = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'GND' || u === 'VSS';
    });
    const resistors = topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('R_'));
    const caps = topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('C_'));
    if (!vcc || !gnd || resistors.length < 1 || caps.length < 1) {
      return AiTopologyFixKit.emptyResult();
    }
    // 已有互斥双色 RELAY+多 LED 时勿抢占 RC 配方；多余单继电器由编排器剥离
    const hasRelay = topo.deviceList.some(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0);
    const ledN = topo.deviceList.filter(d =>
      (d.libDevId ?? '').toUpperCase().startsWith('LED_')).length;
    if (hasRelay && ledN >= 2) {
      return AiTopologyFixKit.emptyResult();
    }
    if (hasRelay) {
      Logger.info(INSTR_TRACE_TAG,
        '[AI_FIX] wireSeriesRc: stray RELAY present — skip (orchestrator should strip first)');
      return AiTopologyFixKit.emptyResult();
    }

    const r0 = resistors[0];
    const c0 = caps[0];
    const sw = topo.deviceList.find(d => (d.libDevId ?? '').toUpperCase().startsWith('SW_'));
    const osc = topo.deviceList.find(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('OSCILLOSCOPE') >= 0);
    const am = topo.deviceList.find(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('AMMETER') >= 0);

    const rc = (ref: string, pin: string, net: string): void => {
      const r = AiTopologyFixKit.reconnectPin(topo, wiring, ref, pin, net);
      fixed += r.fixed;
      notes.push(...r.notes);
    };

    rc(gnd.refName, '1', 'GND');
    rc(c0.refName, '2', 'GND');
    rc(c0.refName, '1', 'RC_MID');
    rc(r0.refName, '2', 'RC_MID');

    if (am) {
      // VCC→AM.I+ ; AM.I-→VCC_AM→R.1（或 SW）
      rc(vcc.refName, '1', 'VCC');
      rc(am.refName, 'I+', 'VCC');
      rc(am.refName, 'I-', 'VCC_AM');
      if (sw) {
        rc(sw.refName, '1', 'VCC_AM');
        rc(sw.refName, '2', 'RC_TOP');
        rc(r0.refName, '1', 'RC_TOP');
      } else {
        rc(r0.refName, '1', 'VCC_AM');
      }
    } else if (sw) {
      rc(vcc.refName, '1', 'VCC');
      rc(sw.refName, '1', 'VCC');
      rc(sw.refName, '2', 'RC_TOP');
      rc(r0.refName, '1', 'RC_TOP');
    } else {
      rc(vcc.refName, '1', 'VCC');
      rc(r0.refName, '1', 'VCC');
    }

    if (osc) {
      rc(osc.refName, 'CH1', 'RC_MID');
      rc(osc.refName, 'GND', 'GND');
    }
    const vm = topo.deviceList.find(d =>
      (d.libDevId ?? '').toUpperCase().indexOf('VOLTMETER') >= 0 ||
      (d.libDevId ?? '').toUpperCase() === 'VIRTUAL_METER');
    if (vm) {
      rc(vm.refName, 'V+', 'RC_MID');
      rc(vm.refName, 'COM', 'GND');
    }

    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] wireSeriesRc fixed=${fixed} R=${r0.refName} C=${c0.refName}` +
      ` | ${notes.slice(0, 6).join('; ')}`);
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 电位器分压：1→VCC、2→GND、W→POT_WIPER；示波器/电压表挂 WIPER。
   */
  static wirePotentiometer(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    const pots = topo.deviceList.filter(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u.indexOf('POT') >= 0 || u.indexOf('POTENTIOMETER') >= 0 || u.startsWith('RV_');
    });
    if (pots.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const vcc = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'VCC' || u === 'VDD';
    });
    const gnd = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'GND' || u === 'VSS';
    });
    if (!vcc || !gnd) {
      return AiTopologyFixKit.emptyResult();
    }
    let fixed = 0;
    const notes: string[] = [];
    const rc = (ref: string, pin: string, net: string): void => {
      const r = AiTopologyFixKit.reconnectPin(topo, wiring, ref, pin, net);
      fixed += r.fixed;
      notes.push(...r.notes);
    };
    rc(vcc.refName, '1', 'VCC');
    rc(gnd.refName, '1', 'GND');
    for (let i = 0; i < pots.length; i++) {
      const pot = pots[i];
      const wiper = pots.length === 1 ? 'POT_WIPER' : `POT_WIPER_${pot.refName}`;
      rc(pot.refName, '1', 'VCC');
      rc(pot.refName, '2', 'GND');
      rc(pot.refName, 'W', wiper);
      const osc = topo.deviceList.find(d =>
        (d.libDevId ?? '').toUpperCase().indexOf('OSCILLOSCOPE') >= 0);
      if (osc && i === 0) {
        rc(osc.refName, 'CH1', wiper);
        rc(osc.refName, 'GND', 'GND');
      }
      const vm = topo.deviceList.find(d => {
        const u = (d.libDevId ?? '').toUpperCase();
        return u.indexOf('VOLTMETER') >= 0 || u === 'VIRTUAL_METER';
      });
      if (vm && i === 0) {
        rc(vm.refName, 'V+', wiper);
        rc(vm.refName, 'COM', 'GND');
      }
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] wirePotentiometer fixed=${fixed} pots=${pots.length}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 根据 auditCriticalElectrical 结果做确定性拆短路（仅修复命中器件，禁止全图重接）。
   */
  static healCriticalElectricalShorts(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    let fixed = 0;
    const notes: string[] = [];
    const errs = AiTopologyFixKit.auditCriticalElectrical(topo);
    if (errs.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const hitRefs = new Set<string>();
    let hasPowerMerge = false;
    let hasInstrument = false;
    for (let ei = 0; ei < errs.length; ei++) {
      const e = errs[ei];
      const colon = e.indexOf(':');
      if (colon > 0) {
        hitRefs.add(e.substring(0, colon).trim());
      }
      if (e.indexOf('电源') >= 0 || e.indexOf('VCC') >= 0 && e.indexOf('GND') >= 0) {
        hasPowerMerge = true;
      }
      if (e.indexOf('电流表') >= 0 || e.indexOf('电压表') >= 0 || e.indexOf('示波器') >= 0) {
        hasInstrument = true;
      }
    }
    if (hasPowerMerge || errs.some(e => e.indexOf('同网') >= 0 && e.indexOf('电源') >= 0)) {
      const split = AiTopologyFixKit.splitMergedPowerRails(topo);
      fixed += split.fixed;
      notes.push(...split.notes);
    }

    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      if (!hitRefs.has(d.refName)) {
        continue;
      }
      const lib = (d.libDevId ?? '').toUpperCase();
      if (lib.indexOf('AMMETER') >= 0) {
        // 仅拆 I+/I- 同网：I- 改挂独立中间网，禁止误把好表硬接到 VCC
        const r2 = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, 'I-',
          `AM_MID_${(d.refName ?? 'AM').toUpperCase()}`);
        fixed += r2.fixed;
        notes.push(`${d.refName}: split I+/I-`);
      }
      if (lib.startsWith('LED_')) {
        const rA = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, 'A',
          `LED_A_${(d.refName ?? 'D').toUpperCase()}`);
        const rK = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, 'K', 'GND');
        fixed += rA.fixed + rK.fixed;
        notes.push(`${d.refName}: split A/K`);
      }
      if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
        lib.startsWith('RV_')) {
        const pot = AiTopologyFixKit.wirePotentiometer(topo, wiring);
        fixed += pot.fixed;
        notes.push(...pot.notes);
      }
    }
    // 仅当审计命中仪器类短路时才 rebuild，避免毁掉已正确串联测流/限流拓扑
    if (hasInstrument) {
      const reb = AiTopologyFixKit.rebuildInstrument(topo, wiring);
      fixed += reb.fixed;
      notes.push(...reb.notes);
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] healCriticalElectricalShorts fixed=${fixed} hitRefs=${hitRefs.size}` +
        ` errsWas=${errs.length}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 双电源：VCC/VEE 符号入各自网；运放 VCC/V+→VCC，VEE/V-→VEE；SIGNAL_GEN OUT 不强制。
   */
  static wireDualSupplyRails(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    const vee = topo.deviceList.find(d => (d.libDevId ?? '').toUpperCase() === 'VEE');
    const vcc = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'VCC' || u === 'VDD';
    });
    const gnd = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'GND' || u === 'VSS';
    });
    if (!vee || !vcc) {
      return AiTopologyFixKit.emptyResult();
    }
    let fixed = 0;
    const notes: string[] = [];
    const rc = (ref: string, pin: string, net: string): void => {
      const r = AiTopologyFixKit.reconnectPin(topo, wiring, ref, pin, net);
      fixed += r.fixed;
      notes.push(...r.notes);
    };
    rc(vcc.refName, '1', 'VCC');
    rc(vee.refName, '1', 'VEE');
    if (gnd) {
      rc(gnd.refName, '1', 'GND');
    }
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (lib.indexOf('741') < 0 && lib.indexOf('LM358') < 0 && lib.indexOf('LM324') < 0 &&
        lib.indexOf('TL08') < 0 && lib.indexOf('OPAMP') < 0 && lib.indexOf('OP_AMP') < 0) {
        continue;
      }
      // 仅挂库内真实电源脚：UA741=VCC/VEE；双运放常为 V+/V-。禁止同时挂别名假脚。
      if (AiTopologyFixKit.deviceHasPin(d, 'VCC')) {
        rc(d.refName, 'VCC', 'VCC');
      } else if (AiTopologyFixKit.deviceHasPin(d, 'V+')) {
        rc(d.refName, 'V+', 'VCC');
      }
      if (AiTopologyFixKit.deviceHasPin(d, 'VEE')) {
        rc(d.refName, 'VEE', 'VEE');
      } else if (AiTopologyFixKit.deviceHasPin(d, 'V-')) {
        rc(d.refName, 'V-', 'VEE');
      }
    }
    // SIGNAL_GEN：GND→GND
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      if ((d.libDevId ?? '').toUpperCase() !== 'SIGNAL_GEN') {
        continue;
      }
      if (gnd) {
        rc(d.refName, 'GND', 'GND');
      }
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] wireDualSupplyRails fixed=${fixed} | ${notes.slice(0, 6).join('; ')}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 运放闭环：无反馈且非「双输入已接的比较器」时，将 IN- 并入 OUT 网（电压跟随），消除开环门禁。
   * 迟滞/已有 R/C 反馈则跳过。
   */
  static wireOpAmpFeedback(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    let fixed = 0;
    const notes: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (lib !== 'UA741' && lib.indexOf('LM358') < 0 && lib.indexOf('TL08') < 0 &&
        lib.indexOf('LM324') < 0) {
        continue;
      }
      const channels: string[] = lib === 'UA741' ? [''] : ['1', '2', ''];
      for (let ci = 0; ci < channels.length; ci++) {
        const suf = channels[ci];
        const outPin = suf.length > 0 ? `OUT${suf}` : 'OUT';
        const innPin = suf.length > 0 ? `IN-${suf}` : 'IN-';
        const inpPin = suf.length > 0 ? `IN+${suf}` : 'IN+';
        const outNet = AiTopologyFixKit.findDevicePinNetName(topo, d.instUuid, outPin);
        const innNet = AiTopologyFixKit.findDevicePinNetName(topo, d.instUuid, innPin);
        const inpNet = AiTopologyFixKit.findDevicePinNetName(topo, d.instUuid, inpPin);
        if (outNet.length === 0) {
          continue;
        }
        // 已同网或经电阻桥接
        if (innNet.length > 0 && innNet.toUpperCase() === outNet.toUpperCase()) {
          continue;
        }
        if (inpNet.length > 0 && inpNet.toUpperCase() === outNet.toUpperCase()) {
          continue;
        }
        if (AiTopologyFixKit.passiveBridgesNetNames(topo, outNet, innNet) ||
          AiTopologyFixKit.passiveBridgesNetNames(topo, outNet, inpNet)) {
          continue;
        }
        // 任一输入已入网：可能是反相放大/比较器，禁止强行 IN-→OUT 跟随
        if (innNet.length > 0 || inpNet.length > 0) {
          continue;
        }
        const r = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, innPin, outNet);
        if (r.fixed > 0) {
          fixed += r.fixed;
          notes.push(`${d.refName} ${innPin}→${outNet}(follower)`);
        }
      }
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] wireOpAmpFeedback fixed=${fixed} | ${notes.join('; ')}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  private static findDevicePinNetName(topo: SchTopology, instUuid: string,
    pinId: string): string {
    const want = pinId.toUpperCase();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const n = net.nodeList[ki];
        if (n.devUuid === instUuid && (n.pinId ?? '').toUpperCase() === want) {
          return net.netName ?? '';
        }
      }
    }
    return '';
  }

  private static passiveBridgesNetNames(topo: SchTopology, netA: string,
    netB: string): boolean {
    if (netA.length === 0 || netB.length === 0) {
      return false;
    }
    const a = netA.toUpperCase();
    const b = netB.toUpperCase();
    if (a === b) {
      return true;
    }
    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (!lib.startsWith('R_') && !lib.startsWith('C_')) {
        continue;
      }
      let hitA = false;
      let hitB = false;
      for (let ni = 0; ni < topo.netList.length; ni++) {
        const net = topo.netList[ni];
        const name = (net.netName ?? '').toUpperCase();
        const onDev = net.nodeList.some(n => n.devUuid === d.instUuid);
        if (!onDev) {
          continue;
        }
        if (name === a) {
          hitA = true;
        }
        if (name === b) {
          hitB = true;
        }
      }
      if (hitA && hitB) {
        return true;
      }
    }
    return false;
  }

  /** 删除完全未入网的非电源器件（避免「无效器件」挡门禁） */
  static dropFullyFloatingDevices(topo: SchTopology): TopologyFixResult {
    const connected = new Set<string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      for (let ki = 0; ki < topo.netList[ni].nodeList.length; ki++) {
        connected.add(topo.netList[ni].nodeList[ki].devUuid);
      }
    }
    const keep: DeviceInst[] = [];
    let fixed = 0;
    const notes: string[] = [];
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (lib === 'VCC' || lib === 'GND' || lib === 'VEE' || lib === 'VAC' ||
        lib === 'SIGNAL_GEN') {
        keep.push(d);
        continue;
      }
      if (!connected.has(d.instUuid)) {
        fixed++;
        notes.push(d.refName);
        continue;
      }
      keep.push(d);
    }
    if (fixed > 0) {
      topo.deviceList = keep;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] dropFullyFloatingDevices n=${fixed} | ${notes.join(',')}`);
    }
    return { fixed, needReroute: false, notes };
  }

  /**
   * 门禁前最终加固：拆短路 → 意图拓扑 kit → 仪器重建 → heal → 剪单脚孤儿网。
   * 禁止模板；只做确定性拓扑修复。
   */
  static finalizeForGate(topo: SchTopology, wiring: ConstrainedWiringEngine,
    opts?: FinalizeGateOpts): TopologyFixResult {
    let fixed = 0;
    const notes: string[] = [];
    const intent = opts ?? {};
    AiTopologyFixKit.sanitizeTopoPinIds(topo);
    const phantoms = AiTopologyFixKit.stripUnknownDevicePinNodes(topo);
    fixed += phantoms.fixed;

    const split = AiTopologyFixKit.splitMergedPowerRails(topo);
    fixed += split.fixed;

    if (intent.seriesRcCharge) {
      // 剥离多余 RELAY 由编排器负责；此处只 wire RC
      const rc = AiTopologyFixKit.wireSeriesRc(topo, wiring);
      fixed += rc.fixed;
      notes.push(...rc.notes);
    }
    const hasPot = topo.deviceList.some(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u.indexOf('POT') >= 0 || u.startsWith('RV_');
    });
    if (hasPot) {
      const pot = AiTopologyFixKit.wirePotentiometer(topo, wiring);
      fixed += pot.fixed;
    }
    // 板上有 VEE → 运放负轨接到 VEE（双电源）
    const hasVee = topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase() === 'VEE');
    if (hasVee) {
      const dual = AiTopologyFixKit.wireDualSupplyRails(topo, wiring);
      fixed += dual.fixed;
      // 再次剥离：防止历史拓扑里残留 V+/V- 假脚
      const phantoms2 = AiTopologyFixKit.stripUnknownDevicePinNodes(topo);
      fixed += phantoms2.fixed;
    }
    // 运放开环 → 跟随闭环（比较器双输入已接则跳过）
    const opa = AiTopologyFixKit.wireOpAmpFeedback(topo, wiring);
    fixed += opa.fixed;

    if (!intent.seriesRcCharge &&
      (intent.mutualLedIndicator ||
        (topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('LED_')).length >= 2 &&
          topo.deviceList.some(d => (d.libDevId ?? '').toUpperCase().indexOf('RELAY') >= 0)))) {
      const wr = AiTopologyFixKit.wireRelaySpdtDualLed(topo, wiring);
      fixed += wr.fixed;
    }

    const elec = AiTopologyFixKit.healCriticalElectricalShorts(topo, wiring);
    fixed += elec.fixed;

    const reb = AiTopologyFixKit.rebuildInstrument(topo, wiring);
    fixed += reb.fixed;

    const heal = AiTopologyFixKit.healFloatingPins(topo, wiring);
    fixed += heal.fixed;

    const drop = AiTopologyFixKit.dropFullyFloatingDevices(topo);
    fixed += drop.fixed;

    const prune = AiTopologyFixKit.pruneSingletonOrphanNets(topo);
    fixed += prune.fixed;

    const oscNc = AiTopologyFixKit.pruneUnusedOscChannelNets(topo);
    fixed += oscNc.fixed;

    // 二次剪：任意仅 1 节点且非电源的网（开路 ERC）；保留模块边界单脚
    const prune2 = AiTopologyFixKit.pruneAllSingletonSignalNets(topo,
      intent.preserveBoundaryKeys);
    fixed += prune2.fixed;

    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] finalizeForGate fixed=${fixed}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 修剪所有单脚信号网（保留 VCC/GND/VDD/VSS/VEE 与模块边界脚），消除开路 ERC。
   * preserveBoundaryKeys: RefDes.Pin 大写，如 R1.1 / OSC1.CH1
   */
  static pruneAllSingletonSignalNets(topo: SchTopology,
    preserveBoundaryKeys?: string[]): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const drop = new Set<string>();
    const preserve = new Set<string>();
    if (preserveBoundaryKeys) {
      for (let i = 0; i < preserveBoundaryKeys.length; i++) {
        const k = (preserveBoundaryKeys[i] ?? '').toUpperCase();
        if (k.length > 0) {
          preserve.add(k);
        }
      }
    }
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      if ((net.nodeList?.length ?? 0) !== 1) {
        continue;
      }
      const name = (net.netName ?? '').toUpperCase();
      if (name === 'VCC' || name === 'GND' || name === 'VDD' || name === 'VSS' ||
        name === 'VEE' || net.isPower) {
        // 电源符号单脚合法；若节点是信号脚误挂电源名则另案处理
        const node = net.nodeList[0];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        const lib = (dev?.libDevId ?? '').toUpperCase();
        if (lib === 'VCC' || lib === 'GND' || lib === 'VDD' || lib === 'VSS' ||
          lib === 'VEE') {
          continue;
        }
      }
      // 模块边界单脚 / 已有同名标号 stub：合并阶段依赖，禁止剪
      const node0 = net.nodeList[0];
      const bdev = topo.deviceList.find(d => d.instUuid === node0.devUuid);
      if (bdev) {
        const pinU = (node0.pinId ?? node0.pinName ?? '').toUpperCase();
        const key = `${(bdev.refName ?? '').toUpperCase()}.${pinU}`;
        if (preserve.has(key)) {
          continue;
        }
      }
      const hasLabel = topo.netLabelList.some(l => l.netUuid === net.netUuid);
      if (hasLabel) {
        // 带标号的单脚网多为 joinByLabel stub（含非 modular 路径），禁止剪
        continue;
      }
      drop.add(net.netUuid);
      notes.push(net.netName ?? net.netUuid);
      fixed++;
    }
    if (drop.size === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    topo.netList = topo.netList.filter(n => !drop.has(n.netUuid));
    topo.wireList = topo.wireList.filter(w => !drop.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !drop.has(l.netUuid));
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] pruneAllSingletonSignalNets fixed=${fixed} preserve=${preserve.size}` +
      ` | ${notes.slice(0, 8).join('; ')}`);
    return { fixed, needReroute: false, notes };
  }

  /**
   * 关键电气审计：电流表同网短路、LED 阴阳同网、电位器三脚同网、电源符号同网。
   * 返回需作为 ERC blocking 注入的描述列表。
   */
  static auditCriticalElectrical(topo: SchTopology): string[] {
    const errs: string[] = [];
    const pinNet = new Map<string, string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const nName = net.netName ?? '';
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const n = net.nodeList[ki];
        pinNet.set(`${n.devUuid}|${(n.pinId ?? '').toUpperCase()}`, nName);
      }
    }
    const netOf = (dev: DeviceInst, pin: string): string =>
      pinNet.get(`${dev.instUuid}|${pin.toUpperCase()}`) ?? '';

    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      const lib = (d.libDevId ?? '').toUpperCase();
      if (lib.indexOf('AMMETER') >= 0) {
        const ip = netOf(d, 'I+');
        const im = netOf(d, 'I-');
        if (ip.length > 0 && im.length > 0 && ip.toUpperCase() === im.toUpperCase()) {
          errs.push(`${d.refName}: I+/I- 同网 ${ip}（电流表短路）`);
        }
      }
      if (lib.startsWith('LED_')) {
        const a = netOf(d, 'A');
        const k = netOf(d, 'K');
        if (a.length > 0 && k.length > 0 && a.toUpperCase() === k.toUpperCase()) {
          errs.push(`${d.refName}: A/K 同网 ${a}（LED 短路）`);
        }
      }
      if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
        lib.startsWith('RV_')) {
        const p1 = netOf(d, '1');
        const p2 = netOf(d, '2');
        const w = netOf(d, 'W');
        if (p1.length > 0 && p2.length > 0 && w.length > 0 &&
          p1.toUpperCase() === p2.toUpperCase() && p1.toUpperCase() === w.toUpperCase()) {
          errs.push(`${d.refName}: 电位器 1/2/W 同网 ${p1}`);
        }
      }
    }
    // VCC 符号与 GND 符号同网
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      let hasV = false;
      let hasG = false;
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(x => x.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const lib = (dev.libDevId ?? '').toUpperCase();
        if (lib === 'VCC' || lib === 'VDD') {
          hasV = true;
        }
        if (lib === 'GND' || lib === 'VSS') {
          hasG = true;
        }
      }
      if (hasV && hasG) {
        errs.push(`电源短路: VCC 与 GND 符号同网 ${net.netName}`);
      }
    }
    return errs;
  }

  /**
   * 将 fromNet 的全部节点并入 toNet（同名标号并网），并补 stub。
   */
  static joinNetsByLabel(topo: SchTopology, wiring: ConstrainedWiringEngine,
    toNetName: string, fromNetName?: string): TopologyFixResult {
    const toWant = (toNetName ?? '').trim();
    if (toWant.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    if (!fromNetName || fromNetName.length === 0 ||
      fromNetName.toUpperCase() === toWant.toUpperCase()) {
      return AiTopologyFixKit.demoteNetByName(topo, wiring, toWant);
    }
    const fromWant = fromNetName.trim();
    let toNet = topo.netList.find(n =>
      (n.netName ?? '').toUpperCase() === toWant.toUpperCase());
    const fromNet = topo.netList.find(n =>
      (n.netName ?? '').toUpperCase() === fromWant.toUpperCase());
    if (!fromNet) {
      return AiTopologyFixKit.demoteNetByName(topo, wiring, toWant);
    }
    if (!toNet) {
      toNet = fromNet;
      toNet.netName = toWant;
      toNet.displayName = toWant;
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] join_by_label rename ${fromWant}→${toWant}`);
      const n = wiring.demoteNetsToLabelStubs(topo, new Set([toNet.netUuid]));
      return { fixed: 1, needReroute: true, notes: [`rename+demote ${toWant} stubs=${n}`] };
    }
    let moved = 0;
    for (let i = 0; i < fromNet.nodeList.length; i++) {
      const node = fromNet.nodeList[i];
      const exists = toNet.nodeList.some(n =>
        n.devUuid === node.devUuid &&
        (n.pinId ?? '').toUpperCase() === (node.pinId ?? '').toUpperCase());
      if (!exists) {
        toNet.nodeList.push(node);
        moved++;
      }
    }
    topo.netList = topo.netList.filter(n => n.netUuid !== fromNet.netUuid);
    // 旧网导线改挂新网
    for (let wi = 0; wi < topo.wireList.length; wi++) {
      if (topo.wireList[wi].netUuid === fromNet.netUuid) {
        topo.wireList[wi].netUuid = toNet.netUuid;
      }
    }
    const uuids = new Set<string>();
    uuids.add(toNet.netUuid);
    const stubs = wiring.demoteNetsToLabelStubs(topo, uuids);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] join_by_label ${fromWant}→${toWant} moved=${moved} stubs=${stubs}`);
    return {
      fixed: moved > 0 ? moved : 1,
      needReroute: true,
      notes: [`join ${fromWant}→${toWant} moved=${moved}`]
    };
  }

  /** 浮空/未入网关键脚：按启发式挂网并标号 */
  static healFloatingPins(topo: SchTopology, wiring: ConstrainedWiringEngine): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    AiTopologyFixKit.sanitizeTopoPinIds(topo);

    const connected = new Set<string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const n = net.nodeList[ki];
        connected.add(`${n.devUuid}|${(n.pinId ?? '').toUpperCase()}`);
      }
    }

    for (let di = 0; di < topo.deviceList.length; di++) {
      const dev = topo.deviceList[di];
      const lib = (dev.libDevId ?? '').toUpperCase();
      const pins = AiTopologyFixKit.expectedPinsForLib(lib, dev.libDevId);
      for (let pi = 0; pi < pins.length; pi++) {
        const pinId = pins[pi];
        const key = `${dev.instUuid}|${pinId.toUpperCase()}`;
        if (connected.has(key)) {
          continue;
        }
        const netName = AiTopologyFixKit.heuristicNetForPin(dev, pinId, topo);
        if (netName.length === 0) {
          continue;
        }
        const r = AiTopologyFixKit.reconnectPin(topo, wiring, dev.refName, pinId, netName);
        fixed += r.fixed;
        notes.push(...r.notes);
      }
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] heal_floating fixed=${fixed}`);
      traceAiDiag('AI_FIX', 'heal_floating', notes, 12);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  // ─── 内部：清洗 / 拆短接 / 仪器 ─────────────────────────────────────

  /** 清洗拓扑内脏 pinId（1(VCC)→1） */
  static sanitizeTopoPinIds(topo: SchTopology): number {
    let fixes = 0;
    const samples: string[] = [];
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const before = node.pinId ?? '';
        const tok = NetPlanExecutor.sanitizePinToken(before, node.pinName ?? before);
        if (tok.pinId !== before) {
          node.pinId = tok.pinId;
          node.pinName = tok.pinName;
          fixes++;
          if (samples.length < 8) {
            samples.push(`${net.netName} "${before}"→"${tok.pinId}"`);
          }
        }
      }
    }
    if (fixes > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] sanitizeTopoPinIds fixes=${fixes}`);
      traceAiDiag('AI_FIX', 'topo_pin_sanitize', samples, 8);
    }
    return fixes;
  }

  /**
   * 器件是否具备该引脚（优先组件库；否则 TemplateSchematicKit 已知表）。
   * 未知脚不得 reconnect —— pinOffset 默认 (0,0) 会在器件中心造 stub。
   */
  private static deviceHasPin(dev: DeviceInst, pinId: string): boolean {
    const want = (pinId ?? '').toUpperCase();
    if (want.length === 0) {
      return false;
    }
    const fromLib = AiTopologyFixKit.libraryPinIds(dev.libDevId);
    if (fromLib.length > 0) {
      return fromLib.indexOf(want) >= 0;
    }
    const known = AiTopologyFixKit.templateKnownPinIds(dev.libDevId);
    if (known.length > 0) {
      return known.indexOf(want) >= 0;
    }
    // 无清单时拒绝（未知 IC 不得假连通）；被动双端由 templateKnownPinIds 覆盖
    return false;
  }

  private static templateKnownPinIds(libDevId: string): string[] {
    const lib = (libDevId ?? '').toUpperCase();
    if (lib === 'UA741') {
      return ['IN+', 'IN-', 'OUT', 'VCC', 'VEE'];
    }
    if (lib.indexOf('LM358') >= 0 || lib.indexOf('TL08') >= 0 || lib.indexOf('LM324') >= 0) {
      return ['OUT1', 'IN-1', 'IN+1', 'V-', 'IN+2', 'IN-2', 'OUT2', 'V+',
        'OUT', 'IN-', 'IN+', 'VCC', 'VEE'];
    }
    if (lib === 'SIGNAL_GEN') {
      return ['OUT', 'GND'];
    }
    if (lib.indexOf('OSCILLOSCOPE') >= 0) {
      return ['CH1', 'CH2', 'CH3', 'CH4', 'GND'];
    }
    if (lib === 'VCC' || lib === 'GND' || lib === 'VEE' || lib === 'VDD' || lib === 'VSS') {
      return ['1'];
    }
    // 常见被动双端
    if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
      lib.startsWith('POT_') || lib.startsWith('XTAL')) {
      return ['1', '2'];
    }
    if (lib.startsWith('LED_') || lib.indexOf('DIODE') >= 0 || lib.startsWith('1N')) {
      return ['A', 'K', '1', '2'];
    }
    return [];
  }

  /**
   * 剥离库外假脚节点（如 UA741 上的 V+/V-），避免中心 stub 触发 pin_proximity。
   */
  static stripUnknownDevicePinNodes(topo: SchTopology): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const keep: NetNodeRef[] = [];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          keep.push(node);
          continue;
        }
        const pinId = node.pinId ?? '';
        if (AiTopologyFixKit.deviceHasPin(dev, pinId)) {
          keep.push(node);
          continue;
        }
        fixed++;
        notes.push(`${dev.refName}.${pinId}@${net.netName ?? ''}`);
      }
      net.nodeList = keep;
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] stripUnknownDevicePinNodes n=${fixed} | ${notes.slice(0, 8).join('; ')}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 拆除「示波器未用通道互连」网（CH3↔CH4 / NC），保持通道悬空。
   * 避免 self-review 反复 rebuild_instrument。
   */
  static pruneUnusedOscChannelNets(topo: SchTopology): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const drop = new Set<string>();
    const isUnusedOscCh = (pinId: string): boolean => {
      const p = (pinId ?? '').toUpperCase();
      return /^CH[2-9]$/.test(p) || /^CH\d{2,}$/.test(p);
    };
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      if ((net.nodeList?.length ?? 0) < 1) {
        continue;
      }
      let ok = true;
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        if (!isUnusedOscCh(node.pinId ?? '')) {
          ok = false;
          break;
        }
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev || (dev.libDevId ?? '').toUpperCase().indexOf('OSCILLOSCOPE') < 0) {
          ok = false;
          break;
        }
      }
      if (!ok) {
        continue;
      }
      drop.add(net.netUuid);
      notes.push(`${net.netName ?? net.netUuid}#${net.nodeList.length}`);
      fixed++;
    }
    if (drop.size === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    topo.netList = topo.netList.filter(n => !drop.has(n.netUuid));
    topo.wireList = topo.wireList.filter(w => !drop.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !drop.has(l.netUuid));
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] pruneUnusedOscChannelNets fixed=${fixed} | ${notes.slice(0, 8).join('; ')}`);
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 将引脚从所有网络拆除并清除近邻 stub（用于未用示波器通道悬空、断错误连）。
   */
  static disconnectPin(topo: SchTopology, wiring: ConstrainedWiringEngine,
    refName: string, pinIdRaw: string): TopologyFixResult {
    const ref = (refName ?? '').trim();
    if (ref.length === 0 || !(pinIdRaw ?? '').trim()) {
      return AiTopologyFixKit.emptyResult();
    }
    const tok = NetPlanExecutor.sanitizePinToken(pinIdRaw, pinIdRaw);
    const pinId = tok.pinId;
    const pinName = tok.pinName;
    const dev = topo.deviceList.find(d =>
      (d.refName ?? '').toUpperCase() === ref.toUpperCase());
    if (!dev) {
      return AiTopologyFixKit.emptyResult();
    }
    let removed = 0;
    const emptyNets = new Set<string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const before = net.nodeList.length;
      net.nodeList = net.nodeList.filter(n =>
        !(n.devUuid === dev.instUuid &&
          (n.pinId ?? '').toUpperCase() === pinId.toUpperCase()));
      if (net.nodeList.length < before) {
        removed += before - net.nodeList.length;
        if (net.nodeList.length === 0) {
          emptyNets.add(net.netUuid);
        }
      }
    }
    AiTopologyFixKit.removeWiresNearPin(topo, dev, pinId, pinName);
    if (emptyNets.size > 0) {
      topo.netList = topo.netList.filter(n => !emptyNets.has(n.netUuid));
      topo.wireList = topo.wireList.filter(w => !emptyNets.has(w.netUuid));
      topo.netLabelList = topo.netLabelList.filter(l => !emptyNets.has(l.netUuid));
    }
    if (removed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] disconnect_pin ${ref}.${pinId} removed=${removed}`);
    }
    return { fixed: removed, needReroute: removed > 0, notes: [`${ref}.${pinId}`] };
  }

  /** VCC/VEE/GND/VDD/VSS 电源轨整网标号化（密集区电源 stub 贴脚时高效） */
  static demotePowerRails(topo: SchTopology, wiring: ConstrainedWiringEngine): TopologyFixResult {
    const names = ['VCC', 'VEE', 'GND', 'VDD', 'VSS', '+5V', '3V3'];
    const uuids = new Set<string>();
    for (let i = 0; i < topo.netList.length; i++) {
      const n = topo.netList[i];
      const u = (n.netName ?? '').toUpperCase();
      if (names.indexOf(u) >= 0 || n.isPower) {
        // 仅标准电源名，避免误伤 SIG_VCC 等
        if (names.indexOf(u) >= 0) {
          uuids.add(n.netUuid);
        }
      }
    }
    if (uuids.size === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const stubs = wiring.demoteNetsToLabelStubs(topo, uuids);
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] demote_power_rails nets=${uuids.size} stubs=${stubs}`);
    return { fixed: stubs > 0 ? uuids.size : 0, needReroute: true, notes: [`powerNets=${uuids.size}`] };
  }

  /** 移动器件（坐标 20mil 栅格）；用于拉开碰撞/贴脚 */
  static moveDevice(topo: SchTopology, refName: string,
    x?: number, y?: number, dx?: number, dy?: number): TopologyFixResult {
    const ref = (refName ?? '').trim();
    if (ref.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const dev = topo.deviceList.find(d =>
      (d.refName ?? '').toUpperCase() === ref.toUpperCase());
    if (!dev) {
      return AiTopologyFixKit.emptyResult();
    }
    const snap = (v: number): number => Math.round(v / 20) * 20;
    let nx = dev.x;
    let ny = dev.y;
    if (x !== undefined && !isNaN(x)) {
      nx = snap(x);
    } else if (dx !== undefined && !isNaN(dx)) {
      nx = snap(dev.x + dx);
    }
    if (y !== undefined && !isNaN(y)) {
      ny = snap(y);
    } else if (dy !== undefined && !isNaN(dy)) {
      ny = snap(dev.y + dy);
    }
    nx = Math.max(40, Math.min(1200, nx));
    ny = Math.max(40, Math.min(800, ny));
    if (nx === dev.x && ny === dev.y) {
      return AiTopologyFixKit.emptyResult();
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] move_device ${ref} (${dev.x},${dev.y})→(${nx},${ny})`);
    dev.x = nx;
    dev.y = ny;
    return { fixed: 1, needReroute: true, notes: [`${ref}@(${nx},${ny})`] };
  }

  /** 旋转器件 0/90/180/270（或相对 +90） */
  static rotateDevice(topo: SchTopology, refName: string, rotate?: number): TopologyFixResult {
    const ref = (refName ?? '').trim();
    if (ref.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const dev = topo.deviceList.find(d =>
      (d.refName ?? '').toUpperCase() === ref.toUpperCase());
    if (!dev) {
      return AiTopologyFixKit.emptyResult();
    }
    let next = 90;
    if (rotate !== undefined && !isNaN(rotate)) {
      next = ((Math.round(rotate / 90) * 90) % 360 + 360) % 360;
    } else {
      next = (dev.rotate + 90) % 360;
    }
    if (next === dev.rotate) {
      return AiTopologyFixKit.emptyResult();
    }
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] rotate_device ${ref} ${dev.rotate}→${next}`);
    dev.rotate = next;
    return { fixed: 1, needReroute: true, notes: [`${ref} rot=${next}`] };
  }

  /** SIGNAL_GEN：OUT 保持入网；GND→GND（缺则补） */
  static ensureSignalGenWired(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    let fixed = 0;
    const notes: string[] = [];
    const gnd = topo.deviceList.find(d => {
      const u = (d.libDevId ?? '').toUpperCase();
      return u === 'GND' || u === 'VSS';
    });
    for (let i = 0; i < topo.deviceList.length; i++) {
      const d = topo.deviceList[i];
      if ((d.libDevId ?? '').toUpperCase() !== 'SIGNAL_GEN') {
        continue;
      }
      if (gnd) {
        const r = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, 'GND', 'GND');
        fixed += r.fixed;
        notes.push(...r.notes);
        const rg = AiTopologyFixKit.reconnectPin(topo, wiring, gnd.refName, '1', 'GND');
        fixed += rg.fixed;
      }
      // OUT 若完全未入网：挂到已有信号网或新建 SIG_IN
      let outOnNet = false;
      for (let ni = 0; ni < topo.netList.length; ni++) {
        if (topo.netList[ni].nodeList.some(n =>
          n.devUuid === d.instUuid && (n.pinId ?? '').toUpperCase() === 'OUT')) {
          outOnNet = true;
          break;
        }
      }
      if (!outOnNet) {
        const r = AiTopologyFixKit.reconnectPin(topo, wiring, d.refName, 'OUT', 'SIG_IN');
        fixed += r.fixed;
        notes.push(...r.notes);
      }
    }
    if (fixed > 0) {
      Logger.info(INSTR_TRACE_TAG,
        `[AI_FIX] ensure_signal_gen fixed=${fixed}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /**
   * 检测并拆分「VCC 符号与 GND 符号同网」的灾难短接。
   * 按器件 lib 把节点搬回正确电源轨；其余节点留在原网（改名 SIG 若必要）。
   */
  static splitMergedPowerRails(topo: SchTopology): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    for (let ni = topo.netList.length - 1; ni >= 0; ni--) {
      const net = topo.netList[ni];
      let hasVccSym = false;
      let hasGndSym = false;
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const lib = (dev.libDevId ?? '').toUpperCase();
        if (lib === 'VCC' || lib === 'VDD') {
          hasVccSym = true;
        }
        if (lib === 'GND' || lib === 'VSS') {
          hasGndSym = true;
        }
      }
      if (!hasVccSym || !hasGndSym) {
        continue;
      }
      // 拆：VCC 脚 → VCC 网；GND 脚 → GND 网；其它留原网并改名避免叫 VCC
      const vccNet = AiTopologyFixKit.findOrCreateNamedNet(topo, 'VCC', true, 5.0);
      const gndNet = AiTopologyFixKit.findOrCreateNamedNet(topo, 'GND', true, 0.0);
      const remain: NetNodeRef[] = [];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          remain.push(node);
          continue;
        }
        const lib = (dev.libDevId ?? '').toUpperCase();
        if (lib === 'VCC' || lib === 'VDD') {
          AiTopologyFixKit.pushNodeUnique(vccNet, node);
          fixed++;
        } else if (lib === 'GND' || lib === 'VSS') {
          AiTopologyFixKit.pushNodeUnique(gndNet, node);
          fixed++;
        } else {
          const pinU = (node.pinId ?? '').toUpperCase();
          // 仪器 GND/COM → GND；其它先留信号
          if (pinU === 'GND' || pinU === 'COM') {
            AiTopologyFixKit.pushNodeUnique(gndNet, node);
            fixed++;
          } else {
            remain.push(node);
          }
        }
      }
      net.nodeList = remain;
      const nameUp = (net.netName ?? '').toUpperCase();
      if (nameUp === 'VCC' || nameUp === 'GND' || nameUp === 'VDD' || nameUp === 'VSS') {
        net.netName = 'SIG_NODE';
        net.displayName = 'SIG_NODE';
        net.isPower = false;
      }
      notes.push(`split power-short on former net uuid=${net.netUuid}`);
    }
    // 删空网
    topo.netList = topo.netList.filter(n => n.nodeList.length > 0);
    if (fixed > 0) {
      Logger.warn(INSTR_TRACE_TAG,
        `[AI_FIX] splitMergedPowerRails fixed=${fixed}`);
    }
    return { fixed, needReroute: fixed > 0, notes };
  }

  /** 仪器测量脚从 VCC/GND 电源网剥离到最大信号网 */
  static stripInstrSenseFromPowerNets(topo: SchTopology): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const moved: MovedSensePin[] = [];
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const nameUp = (net.netName ?? '').toUpperCase();
      const isPower = nameUp === 'VCC' || nameUp === 'VDD' || nameUp === '+5V' ||
        nameUp === 'VEE' || nameUp === 'GND' || nameUp === 'VSS' || net.isPower;
      if (!isPower) {
        continue;
      }
      const kept: NetNodeRef[] = [];
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev || !AiTopologyFixKit.isInstrumentLib(dev.libDevId)) {
          kept.push(node);
          continue;
        }
        const pinU = (node.pinName ?? node.pinId ?? '').toUpperCase();
        const isSense = /^CH\d+$/.test(pinU) || pinU === 'V+' || pinU === 'V' ||
          pinU === 'IN' || pinU === 'I+' || pinU === 'I-' || pinU === 'PROBE';
        // 仪器 GND/COM 应在 GND 网
        if (pinU === 'GND' || pinU === 'COM') {
          if (nameUp === 'GND' || nameUp === 'VSS') {
            kept.push(node);
          } else {
            const itemG: MovedSensePin = { node: node, from: net.netName };
            moved.push(itemG);
            // 稍后挂 GND
            fixed++;
            notes.push(`${dev.refName}.${pinU} off ${net.netName}→GND`);
          }
          continue;
        }
        if (isSense) {
          const itemS: MovedSensePin = { node: node, from: net.netName };
          moved.push(itemS);
          fixed++;
          notes.push(`${dev.refName}.${pinU} off ${net.netName}`);
          continue;
        }
        kept.push(node);
      }
      net.nodeList = kept;
    }
    if (moved.length === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    // GND 目标 / 信号目标
    const gndNet = AiTopologyFixKit.findOrCreateNamedNet(topo, 'GND', true, 0.0);
    let sigNet = topo.netList.find(n => {
      const u = (n.netName ?? '').toUpperCase();
      return u !== 'VCC' && u !== 'VDD' && u !== 'GND' && u !== 'VSS' && u !== '+5V' &&
        !n.isPower && n.nodeList.length > 0;
    });
    if (!sigNet) {
      sigNet = AiTopologyFixKit.findOrCreateNamedNet(topo, 'SIG_NODE', false, 0.0);
    }
    for (let i = 0; i < moved.length; i++) {
      const m = moved[i];
      const pinU = (m.node.pinName ?? m.node.pinId ?? '').toUpperCase();
      if (pinU === 'GND' || pinU === 'COM') {
        AiTopologyFixKit.pushNodeUnique(gndNet, m.node);
      } else {
        AiTopologyFixKit.pushNodeUnique(sigNet, m.node);
      }
    }
    topo.netList = topo.netList.filter(n => n.nodeList.length > 0);
    return { fixed, needReroute: true, notes };
  }

  /** 为所有 net.node 确保至少有 stub（缺则补） */
  static ensureStubsForAllNetNodes(topo: SchTopology,
    wiring: ConstrainedWiringEngine): TopologyFixResult {
    const uuids = new Set<string>();
    for (let i = 0; i < topo.netList.length; i++) {
      uuids.add(topo.netList[i].netUuid);
    }
    // demote 会重建 stub；若已有部分 stub，再跑一遍 demote 会重复。
    // 仅对「无任何本网导线」的网 demote。
    const need = new Set<string>();
    const list = Array.from(uuids);
    for (let i = 0; i < list.length; i++) {
      const uid = list[i];
      const hasWire = topo.wireList.some(w => w.netUuid === uid);
      if (!hasWire) {
        need.add(uid);
      }
    }
    if (need.size === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    const n = wiring.demoteNetsToLabelStubs(topo, need);
    return {
      fixed: n > 0 ? need.size : 0,
      needReroute: false,
      notes: [`ensure_stubs nets=${need.size} stubs=${n}`]
    };
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private static isInstrumentLib(lib: string): boolean {
    const u = (lib ?? '').toUpperCase();
    return u.indexOf('OSCILLOSCOPE') >= 0 || u.indexOf('VOLTMETER') >= 0 ||
      u.indexOf('AMMETER') >= 0 || u.indexOf('LOGIC_ANALYZER') >= 0 ||
      u.indexOf('UART') >= 0 || u.indexOf('FREQ') >= 0 || u.indexOf('POWER_METER') >= 0 ||
      u.indexOf('VIRTUAL_METER') >= 0;
  }

  private static collectInstrumentRelatedNetUuids(topo: SchTopology,
    targetRef?: string): Set<string> {
    const out = new Set<string>();
    const wantRef = (targetRef ?? '').toUpperCase();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      const nName = (net.netName ?? '').toUpperCase();
      // 无指定 target 时跳过纯电源轨，避免 demote 破坏 VCC/GND stub
      if (wantRef.length === 0 && (nName === 'VCC' || nName === 'GND' ||
        nName === 'VDD' || nName === 'VSS')) {
        continue;
      }
      let hit = false;
      for (let ki = 0; ki < net.nodeList.length; ki++) {
        const node = net.nodeList[ki];
        const dev = topo.deviceList.find(d => d.instUuid === node.devUuid);
        if (!dev) {
          continue;
        }
        const refMatch = wantRef.length > 0 &&
          (dev.refName ?? '').toUpperCase() === wantRef;
        const instr = AiTopologyFixKit.isInstrumentLib(dev.libDevId);
        if (wantRef.length > 0) {
          // 指定器件所在网 + 所有仪器网
          if (refMatch || instr) {
            hit = true;
            break;
          }
        } else if (instr) {
          hit = true;
          break;
        }
      }
      if (hit) {
        out.add(net.netUuid);
      }
    }
    return out;
  }

  private static findOrCreateNamedNet(topo: SchTopology, name: string,
    isPower: boolean, defaultVoltage: number): NetInfo {
    const found = topo.netList.find(n =>
      (n.netName ?? '').toUpperCase() === name.toUpperCase());
    if (found) {
      return found;
    }
    const net: NetInfo = {
      netUuid: IdUtil.generate('net'),
      netName: name,
      displayName: name,
      nodeList: [],
      isPower: isPower,
      isAnalog: false,
      isBusMember: false,
      busParentUuid: '',
      defaultVoltage: defaultVoltage,
      ercWarning: false,
      connectedProbeIds: []
    };
    topo.netList.push(net);
    return net;
  }

  private static pushNodeUnique(net: NetInfo, node: NetNodeRef): void {
    const pinU = (node.pinId ?? '').toUpperCase();
    const exists = net.nodeList.some(n =>
      n.devUuid === node.devUuid && (n.pinId ?? '').toUpperCase() === pinU);
    if (!exists) {
      net.nodeList.push({
        devUuid: node.devUuid,
        pinId: node.pinId,
        pinName: node.pinName ?? node.pinId
      });
    }
  }

  private static expectedPinsForLib(lib: string, libDevId?: string): string[] {
    // 优先器件库真实脚
    const id = libDevId ?? lib;
    const fromLib = AiTopologyFixKit.libraryPinIds(id);
    if (fromLib.length > 0) {
      // 仪器/被动件：只取关键脚子集避免 heal 全脚
      if (lib.indexOf('OSCILLOSCOPE') >= 0) {
        return fromLib.filter(p => p === 'CH1' || p === 'GND' || p === '1' || p === '5');
      }
      if (lib.indexOf('RELAY') >= 0) {
        return fromLib.filter(p =>
          p === '1' || p === '2' || p === 'COM' || p === 'NC' || p === 'NO');
      }
      if (fromLib.length <= 8) {
        return fromLib;
      }
    }
    if (lib === 'VCC' || lib === 'GND' || lib === 'VDD' || lib === 'VSS') {
      return ['1'];
    }
    if (lib.startsWith('R_') || lib.startsWith('C_') || lib.startsWith('L_') ||
      lib.startsWith('SW_')) {
      return ['1', '2'];
    }
    if (lib.indexOf('OSCILLOSCOPE') >= 0) {
      return ['CH1', 'GND'];
    }
    if (lib.indexOf('VOLTMETER') >= 0 || lib === 'VIRTUAL_METER') {
      return ['V+', 'COM'];
    }
    if (lib.indexOf('AMMETER') >= 0) {
      return ['I+', 'I-'];
    }
    if (lib.indexOf('RELAY') >= 0) {
      return ['1', '2', 'COM', 'NC', 'NO'];
    }
    if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
      lib.startsWith('RV_')) {
      return ['1', '2', 'W'];
    }
    if (lib.indexOf('UART') >= 0) {
      return ['TX', 'RX', 'GND'];
    }
    if (lib.indexOf('LOGIC_ANALYZER') >= 0) {
      return ['D0', 'GND'];
    }
    if (lib.indexOf('XTAL') >= 0 || lib.indexOf('CRYSTAL') >= 0) {
      return ['1', '2'];
    }
    if (lib.indexOf('LM555') >= 0 || lib.indexOf('NE555') >= 0) {
      return ['1', '2', '3', '4', '5', '6', '7', '8'];
    }
    if (lib.startsWith('LED_')) {
      return ['A', 'K'];
    }
    if (lib.indexOf('STM32') >= 0 || lib.indexOf('AT89') >= 0 || lib.indexOf('STC') >= 0) {
      return ['VDD', 'VSS', 'NRST'];
    }
    if (lib.indexOf('NPN') >= 0 || lib.indexOf('PNP') >= 0 ||
      lib.indexOf('BJT') >= 0 || lib.startsWith('Q_')) {
      return ['B', 'C', 'E'];
    }
    if (lib.indexOf('NMOS') >= 0 || lib.indexOf('PMOS') >= 0 || lib.indexOf('MOSFET') >= 0) {
      return ['G', 'D', 'S'];
    }
    return [];
  }

  private static libraryPinIds(libDevId: string): string[] {
    const ids: string[] = [];
    const lib = AiTopologyFixKit.library;
    if (!lib || !libDevId || libDevId.length === 0) {
      return ids;
    }
    try {
      const comp = lib.getComponent(libDevId);
      if (comp.success && comp.data && comp.data.pins) {
        for (let i = 0; i < comp.data.pins.length; i++) {
          const p = comp.data.pins[i];
          const pid = `${p.id ?? ''}`.toUpperCase();
          if (pid.length > 0 && ids.indexOf(pid) < 0) {
            ids.push(pid);
          }
        }
      }
    } catch (_e) {
      // ignore
    }
    return ids;
  }

  private static heuristicNetForPin(dev: DeviceInst, pinId: string,
    topo: SchTopology): string {
    const lib = (dev.libDevId ?? '').toUpperCase();
    const pinU = pinId.toUpperCase();
    if (lib === 'VCC' || lib === 'VDD') {
      return 'VCC';
    }
    if (lib === 'GND' || lib === 'VSS') {
      return 'GND';
    }
    if (pinU === 'GND' || pinU === 'COM') {
      return 'GND';
    }
    if (lib.indexOf('RELAY') >= 0) {
      if (pinU === '2') {
        return 'GND';
      }
      // NC/NO 未接负载时不要 heal 成单脚网（避免 REL_NC#1 ERC）
      if (pinU === 'NC' || pinU === 'NO') {
        return '';
      }
      if (pinU === '1') {
        return 'REL_COIL';
      }
    }
    if (lib.indexOf('UART') >= 0) {
      if (pinU === 'TX') {
        return 'UART_TX';
      }
      if (pinU === 'RX') {
        return 'UART_RX';
      }
    }
    const largestSignal = (): string => {
      let best = 'SIG_NODE';
      let bestLen = -1;
      for (let i = 0; i < topo.netList.length; i++) {
        const n = topo.netList[i];
        const u = (n.netName ?? '').toUpperCase();
        if (u === 'VCC' || u === 'GND' || u === 'VDD' || u === 'VSS' || n.isPower) {
          continue;
        }
        if (n.nodeList.length > bestLen) {
          bestLen = n.nodeList.length;
          best = n.netName.length > 0 ? n.netName : 'SIG_NODE';
        }
      }
      return best;
    };
    const hasNamedNet = (name: string): boolean =>
      topo.netList.some(n => (n.netName ?? '').toUpperCase() === name.toUpperCase());

    // LED：阴阳不可同网；有继电器触点网时优先挂触点
    if (lib.startsWith('LED_')) {
      if (pinU === 'K' || pinU === '2') {
        if (lib.indexOf('GREEN') >= 0 && hasNamedNet('REL_NC')) {
          return 'REL_NC';
        }
        if (lib.indexOf('RED') >= 0 && hasNamedNet('REL_NO')) {
          return 'REL_NO';
        }
        return 'GND';
      }
      if (pinU === 'A' || pinU === '1') {
        if (lib.indexOf('GREEN') >= 0 && hasNamedNet('REL_NC_A')) {
          return 'REL_NC_A';
        }
        if (lib.indexOf('RED') >= 0 && hasNamedNet('REL_NO_A')) {
          return 'REL_NO_A';
        }
        // 独立阳极网，避免与 K/GND 或另一 LED 短路
        return `LED_A_${(dev.refName ?? 'D').toUpperCase()}`;
      }
    }

    // 电位器分压：1=VCC 2=GND W=中点（禁止三脚同网）
    if (lib.indexOf('POT') >= 0 || lib.indexOf('POTENTIOMETER') >= 0 ||
      lib.startsWith('RV_')) {
      if (pinU === '1') {
        return 'VCC';
      }
      if (pinU === '2') {
        return 'GND';
      }
      if (pinU === 'W' || pinU === '3') {
        return 'POT_WIPER';
      }
    }

    // R/C：仅当恰好 1R+1C 时才假定串联 RC_MID；多被动件勿盲绑 VCC
    const resistors = topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('R_'));
    const caps = topo.deviceList.filter(d => (d.libDevId ?? '').startsWith('C_'));
    const seriesRc = resistors.length === 1 && caps.length === 1;
    if (lib.startsWith('R_')) {
      if (seriesRc) {
        return pinU === '1' ? 'VCC' : 'RC_MID';
      }
      return pinU === '1' ? 'VCC' : largestSignal();
    }
    if (lib.startsWith('C_')) {
      if (seriesRc) {
        return pinU === '2' ? 'GND' : 'RC_MID';
      }
      return pinU === '2' ? 'GND' : largestSignal();
    }
    if (lib === 'SW_PUSH' || lib.startsWith('SW_')) {
      return pinU === '2' ? largestSignal() : 'VCC';
    }

    // 仪器：I+/I- 必须异网；仅 CH1/V+ → 信号；未用 CH2+ 保持悬空
    if (AiTopologyFixKit.isInstrumentLib(lib)) {
      if (pinU === 'I+') {
        return 'VCC';
      }
      if (pinU === 'I-') {
        return 'VCC_AM';
      }
      if (/^CH[2-9]$/.test(pinU) || /^CH\d{2,}$/.test(pinU)) {
        return '';
      }
      if (pinU === 'CH1' || pinU === 'V+' || pinU === 'IN' || pinU === 'PROBE') {
        if (hasNamedNet('RC_MID')) {
          return 'RC_MID';
        }
        if (hasNamedNet('POT_WIPER')) {
          return 'POT_WIPER';
        }
        return largestSignal();
      }
    }
    return largestSignal();
  }

  /**
   * 修剪单脚孤儿网（REL_NC / OSC_CH*_SIG / NC 等），避免 ERC 开路阻断。
   * 同时拆掉该网的 stub 导线与标号。
   */
  static pruneSingletonOrphanNets(topo: SchTopology): TopologyFixResult {
    const notes: string[] = [];
    let fixed = 0;
    const drop = new Set<string>();
    for (let ni = 0; ni < topo.netList.length; ni++) {
      const net = topo.netList[ni];
      if ((net.nodeList?.length ?? 0) !== 1) {
        continue;
      }
      const name = (net.netName ?? '').toUpperCase();
      const isOrphanName =
        name === 'NC' || name === 'REL_NC' || name === 'REL_NO' || name === 'REL_COIL' ||
        name.indexOf('OSC_CH') >= 0 ||
        (name.endsWith('_SIG') && name.indexOf('OSC') >= 0) ||
        /^CH[2-9]_/.test(name);
      const node = net.nodeList[0];
      const pinU = (node.pinId ?? '').toUpperCase();
      const isUnusedOscCh = /^CH[2-9]$/.test(pinU) || /^CH\d{2,}$/.test(pinU);
      if (!isOrphanName && !isUnusedOscCh) {
        continue;
      }
      // 带标号的单脚网可能是 joinByLabel stub，禁止剪
      const hasLabel = topo.netLabelList.some(l => l.netUuid === net.netUuid);
      if (hasLabel) {
        continue;
      }
      drop.add(net.netUuid);
      notes.push(`${net.netName ?? net.netUuid}#1`);
      fixed++;
    }
    if (drop.size === 0) {
      return AiTopologyFixKit.emptyResult();
    }
    topo.netList = topo.netList.filter(n => !drop.has(n.netUuid));
    topo.wireList = topo.wireList.filter(w => !drop.has(w.netUuid));
    topo.netLabelList = topo.netLabelList.filter(l => !drop.has(l.netUuid));
    Logger.info(INSTR_TRACE_TAG,
      `[AI_FIX] pruneSingletonOrphanNets fixed=${fixed} | ${notes.slice(0, 8).join('; ')}`);
    return { fixed, needReroute: fixed > 0, notes };
  }

  private static removeWiresNearPin(topo: SchTopology, dev: DeviceInst,
    pinId: string, pinName: string): void {
    const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
    const TOL = 10;
    topo.wireList = topo.wireList.filter(w => {
      if (w.points.length === 0) {
        return true;
      }
      const a = w.points[0];
      const b = w.points[w.points.length - 1];
      const near = Math.hypot(a.x - pinPos.x, a.y - pinPos.y) <= TOL ||
        Math.hypot(b.x - pinPos.x, b.y - pinPos.y) <= TOL;
      return !near;
    });
  }

  private static addLabelStubForPin(topo: SchTopology, wiring: ConstrainedWiringEngine,
    net: NetInfo, dev: DeviceInst, pinId: string, pinName: string): void {
    const pinPos = PinWorldResolver.forDeviceInst(dev, pinId, pinName);
    // 尽量用引擎 demote 单网（会重建该网全部 stub，含真实 hitRects）
    const one = new Set<string>();
    one.add(net.netUuid);
    wiring.demoteNetsToLabelStubs(topo, one);
    // 若仍无近邻 stub，手动补一条（foreign 矩形 + 无关脚齐全）
    const TOL = 12;
    const has = topo.wireList.some(w => {
      if (w.netUuid !== net.netUuid || w.points.length === 0) {
        return false;
      }
      const a = w.points[0];
      const b = w.points[w.points.length - 1];
      return Math.hypot(a.x - pinPos.x, a.y - pinPos.y) <= TOL ||
        Math.hypot(b.x - pinPos.x, b.y - pinPos.y) <= TOL;
    });
    if (has) {
      return;
    }
    const hitRects: WorldHitRect[] = [];
    const foreignPins: Point2D[] = [];
    for (let di = 0; di < topo.deviceList.length; di++) {
      const d = topo.deviceList[di];
      let pinIds = AiTopologyFixKit.libraryPinIds(d.libDevId);
      if (pinIds.length === 0) {
        pinIds = ['1', '2', 'A', 'K', 'IN+', 'IN-', 'OUT', 'V+', 'V-', 'COM', 'NO', 'NC'];
      }
      const locals: Point2D[] = [];
      for (let pi = 0; pi < pinIds.length; pi++) {
        const pw = PinWorldResolver.forDeviceInst(d, pinIds[pi], pinIds[pi]);
        locals.push({ x: pw.x - d.x, y: pw.y - d.y });
        if (Math.hypot(pw.x - pinPos.x, pw.y - pinPos.y) >= 1) {
          foreignPins.push(pw);
        }
      }
      hitRects.push(DeviceHitGeometry.hitRectFromLocalPoints(
        locals, d.x, d.y, d.rotate, d.mirrorH, SELECTION_HIT_PAD,
        d.refName, d.instUuid, d.libDevId));
    }
    let own = hitRects.find(r => r.instUuid === dev.instUuid);
    if (!own) {
      own = {
        x: pinPos.x - 40, y: pinPos.y - 30, w: 80, h: 60,
        refName: dev.refName, instUuid: dev.instUuid, libDevId: dev.libDevId
      };
    }
    const labelPos = DeviceHitGeometry.stubLabelOutsidePinAvoidForeign(
      pinPos, own, hitRects, 20, foreignPins);
    const label: NetLabelInfo = {
      id: IdUtil.generate('lbl'),
      netUuid: net.netUuid,
      text: net.netName.length > 0 ? net.netName : 'NET',
      x: labelPos.x,
      y: labelPos.y,
      global: false
    };
    topo.netLabelList.push(label);
    topo.wireList.push(makeRouteLine(net.netUuid, [pinPos, labelPos], false));
  }
}
