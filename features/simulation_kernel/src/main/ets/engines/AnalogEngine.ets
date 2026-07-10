/**
 * Analog circuit simulation engine — MNA (Modified Nodal Analysis) with real netlist connectivity
 * Features: Newton-Raphson nonlinear iteration, trapezoidal companion models, LU decomposition
 */
import { SchematicDocument, SimulationConfig, paramMapGet, parseVoltageVolts, ComponentInstance,
  traceAnalogOpSummary, summarizeNetPins, traceAnalogDeviceStamp, traceSpiceNodeMap,
  traceAnalogNetlistSummary, AnalogResistorStamp, Logger, INSTR_TRACE_TAG, UnitParser } from 'common';

interface MnaStamp { row: number; col: number; value: number; }

interface ResistorEntry { id: string; nodeA: string; nodeB: string; resistance: number; }
interface CapacitorEntry { id: string; nodeA: string; nodeB: string; capacitance: number; voltage: number; prevVoltage: number; geq: number; ieq: number; }
interface InductorEntry { id: string; nodeA: string; nodeB: string; inductance: number; current: number; prevCurrent: number; prevVoltage: number; ieqStamp: number; }
interface DiodeModel { id: string; nodeA: string; nodeB: string; is: number; n: number; vt: number; rs: number; }
interface BjtModel { id: string; nodeC: string; nodeB: string; nodeE: string; type: 'npn' | 'pnp'; is: number; bf: number; nf: number; vaf: number; }
interface MosfetModel { id: string; nodeD: string; nodeG: string; nodeS: string; nodeB: string; type: 'nmos' | 'pmos'; kp: number; vto: number; lambda: number; w: number; l: number; }
interface OpAmpModel { id: string; nodeOut: string; nodeInP: string; nodeInN: string; nodeVcc: string; nodeVee: string; gain: number; bw: number; }
interface VoltageSourceEntry { id: string; nodeA: string; nodeB: string; voltage: number; waveform: string; freq: number; amplitude: number; phase: number; dutyCycle: number; riseTime: number; fallTime: number; }

// Pin info parsed from net connections
interface PinNetMapping {
  pinId: string;
  pinName: string;
  netId: string;
}

export class AnalogEngine {
  private netlist: string = '';
  private nodeVoltages: Map<string, number> = new Map();
  private branchCurrents: Map<string, number> = new Map();
  private nodeIndex: Map<string, number> = new Map();
  private resistors: ResistorEntry[] = [];
  private capacitors: CapacitorEntry[] = [];
  private inductors: InductorEntry[] = [];
  private diodes: DiodeModel[] = [];
  private bjts: BjtModel[] = [];
  private mosfets: MosfetModel[] = [];
  private opamps: OpAmpModel[] = [];
  private voltageSources: VoltageSourceEntry[] = [];
  private simTime: number = 0;
  private lastStepSize: number = 1e-6;
  private lastConverged: boolean = true;
  private matrixSize: number = 0;
  private mnaG: number[] = [];
  private mnaRhs: number[] = [];
  private newtonIterations: number = 0;
  private maxNewtonIter: number = 50;
  private gndRow: number = 0;
  private compPinNets: Map<string, PinNetMapping[]> = new Map();
  // Persist net UUID → node name mapping for instrument lookup
  private netUuidToNode: Map<string, string> = new Map();
  // Component instance UUID → internal device ID mapping (for current lookup)
  private compUuidToDevId: Map<string, string[]> = new Map();

  loadSchematic(doc: SchematicDocument, config: SimulationConfig): void {
    this.netUuidToNode.clear();
    this.compUuidToDevId.clear();
    this.compPinNets.clear();
    this.nodeVoltages.clear();
    this.branchCurrents.clear();
    this.netlist = this.generateNetlist(doc, config);
    this.buildDeviceModels(doc);
    traceSpiceNodeMap(this.netUuidToNode);
    this.buildNodeIndex(doc);
    // Ensure VCC/GND have baseline voltages before OP analysis
    this.nodeVoltages.set('0', 0);
    this.nodeVoltages.set('GND', 0);
    this.nodeVoltages.set('VCC', 5.0);
    this.simTime = config.startTime;
    this.runOpAnalysis();
    const nodeParts: string[] = [];
    let nodeCount = 0;
    this.nodeVoltages.forEach((v: number, name: string) => {
      if (nodeCount >= 6) {
        return;
      }
      if (Math.abs(v) > 1e-9 || name === 'VCC' || name === '0') {
        nodeParts.push(`${name}=${v.toFixed(3)}V`);
        nodeCount++;
      }
    });
    traceAnalogOpSummary(this.resistors.length, this.voltageSources.length,
      this.lastConverged, nodeParts.join(', '));
    if (this.resistors.length > 0) {
      const r0 = this.resistors[0];
      Logger.info(INSTR_TRACE_TAG,
        `analog R0 ${r0.id} ${r0.nodeA}->${r0.nodeB} ${r0.resistance}Ω nets=${summarizeNetPins(doc, 4)}`);
    }
  }

  /** Get the node name for a net UUID (for instrument lookups) */
  getNodeNameForNetUuid(netUuid: string): string {
    return this.netUuidToNode.get(netUuid) ?? '';
  }

  /** Get all net UUID → node name mappings */
  getNetUuidMapping(): Map<string, string> {
    return new Map(this.netUuidToNode);
  }

  /** Get voltage by either node name or net UUID */
  getVoltage(key: string): number {
    const direct = this.nodeVoltages.get(key);
    if (direct !== undefined) return direct;
    const nodeName = this.netUuidToNode.get(key);
    if (nodeName !== undefined) return this.nodeVoltages.get(nodeName) ?? 0;
    return 0;
  }

  /** Get current through a net (computed as sum of branch currents at that node) */
  getNetCurrent(netUuid: string): number {
    const nodeName = this.netUuidToNode.get(netUuid) ?? netUuid;
    let totalCurrent = 0;
    for (const r of this.resistors) {
      if (r.nodeA === nodeName || r.nodeB === nodeName) {
        const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
        const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
        totalCurrent += (vA - vB) / Math.max(r.resistance, 1e-12);
      }
    }
    for (const cap of this.capacitors) {
      if (cap.nodeA === nodeName || cap.nodeB === nodeName) {
        totalCurrent += this.branchCurrents.get(`I(${cap.id})`) ?? 0;
      }
    }
    return totalCurrent;
  }

  /** Get the resistance between two nets (for ammeter current calculation) */
  getResistanceBetweenNets(netUuid1: string, netUuid2: string): number {
    const node1 = this.netUuidToNode.get(netUuid1) ?? netUuid1;
    const node2 = this.netUuidToNode.get(netUuid2) ?? netUuid2;
    // Find resistors connecting these two nodes
    for (const r of this.resistors) {
      if ((r.nodeA === node1 && r.nodeB === node2) || (r.nodeA === node2 && r.nodeB === node1)) {
        return r.resistance;
      }
    }
    return Infinity;
  }

  generateNetlist(doc: SchematicDocument, config: SimulationConfig): string {
    let nl = `* ElecDraw MNA Netlist (circuit-connected)\n* ${doc.name}\n\n`;
    nl += `.temp ${config.temperature}\n\n`;

    const netNodeMap = this.buildNetNodeMap(doc);
    let rCount = 1; let cCount = 1; let dCount = 1; let qCount = 1; let xCount = 1;

    for (const comp of doc.components) {
      const libId = comp.libraryId.toUpperCase();
      const pinNets = this.getPinNetConnections(comp.id, doc);
      const passive = this.resolvePassiveTerminals(comp, pinNets, netNodeMap);
      const nA = passive[0];
      const nB = passive[1];

      if (libId.startsWith('R_') || libId.includes('RESISTOR')) {
        const val = paramMapGet(comp.parameters, 'value', libId.replace('R_', ''));
        nl += `R${rCount} ${nA} ${nB} ${this.toSpiceValue(val)}\n`;
        rCount++;
      } else if (libId.startsWith('C_') || libId.includes('CAP')) {
        const val = paramMapGet(comp.parameters, 'value', libId.replace('C_', ''));
        nl += `C${cCount} ${nA} ${nB} ${this.toSpiceValue(val)} IC=0\n`;
        cCount++;
      } else if (libId.includes('LED') || libId.startsWith('1N') || libId.includes('DIODE')) {
        nl += `D${dCount} ${nA} ${nB} DMOD\n`; dCount++;
      } else if (libId.includes('NPN') || libId.includes('PNP') || libId.includes('2N') || libId.includes('BC')) {
        const nC = this.resolveCompNode(comp, 'C', pinNets, netNodeMap);
        const nE = this.resolveCompNode(comp, 'E', pinNets, netNodeMap);
        nl += `Q${qCount} ${nC} ${nB} ${nE} ${libId.includes('PNP') ? 'PNP' : 'NPN'}\n`; qCount++;
      } else if (libId.includes('LM358') || libId.includes('LM324') || libId.includes('OP')) {
        const nO = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
        const nP = this.resolveCompNode(comp, '+', pinNets, netNodeMap);
        const nN = this.resolveCompNode(comp, '-', pinNets, netNodeMap);
        nl += `X${xCount} ${nP} ${nN} ${nO} VCC GND OPA\n`; xCount++;
      } else if (libId.includes('VCC') || libId.includes('POWER') || libId.includes('VDD')) {
        const supplyNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, 'VCC');
        const vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'voltage', '5V'), 5);
        nl += `V${rCount} ${supplyNode} GND DC ${vNum}\n`; rCount++;
      } else if (libId.includes('GND')) {
        const gndNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, '0');
        nl += `* GND reference at ${gndNode}\n`;
      }
    }
    nl += `.model DMOD D (IS=1e-14 RS=0.5 N=1.0)\n`;
    nl += `.subckt OPA IN+ IN- OUT VCC VEE\n`;
    nl += `E1 OUT 0 VCC VEE IN+ IN- 100k\n.ends\n`;
    nl += `.tran ${config.stepSize} ${config.stopTime}\n.op\n.end\n`;
    return nl;
  }

  private buildNetNodeMap(doc: SchematicDocument): Map<string, string> {
    const map = new Map<string, string>();
    map.set('GND', '0');
    let unnamedIdx = 1;
    for (const net of doc.nets) {
      const isGnd = net.name === 'GND' || net.name === '0';
      const isVcc = net.name === 'VCC' || net.name === 'VDD' || net.name === 'V+';
      let nodeName: string;
      if (isGnd) {
        nodeName = '0';
      } else if (isVcc) {
        nodeName = 'VCC';
      } else if (net.name.length > 0) {
        nodeName = net.name;
      } else {
        nodeName = `N${unnamedIdx++}`;
      }
      map.set(net.id, nodeName);
      this.netUuidToNode.set(net.id, nodeName);
    }
    // Also store reverse: node name → UUID for GND and VCC
    this.netUuidToNode.set('GND', '0');
    this.netUuidToNode.set('0', '0');
    return map;
  }

  private getPinNetConnections(compId: string, doc: SchematicDocument): PinNetMapping[] {
    const cached = this.compPinNets.get(compId);
    if (cached) return cached;

    const mappings: PinNetMapping[] = [];
    for (const net of doc.nets) {
      for (const pinRef of net.pinIds) {
        const parts = pinRef.split(':');
        if (parts.length >= 2 && parts[0] === compId) {
          mappings.push({ pinId: parts[1], pinName: parts[2] ?? parts[1], netId: net.id });
        }
      }
    }
    this.compPinNets.set(compId, mappings);
    return mappings;
  }

  private resolveCompNode(comp: ComponentInstance, pinHint: string,
    pinNets: PinNetMapping[], netNodeMap: Map<string, string>): string {
    const hintUpper = pinHint.toUpperCase();
    // First pass: exact match by pin name or ID
    for (const m of pinNets) {
      const pn = m.pinName.toUpperCase();
      const pi = m.pinId.toUpperCase();
      if (pn === hintUpper || pi === hintUpper) {
        return netNodeMap.get(m.netId) ?? `NC_${comp.id}_${pinHint}`;
      }
    }
    // Second pass: prefix match (e.g. hint 'V' matching 'V+')
    for (const m of pinNets) {
      const pn = m.pinName.toUpperCase();
      const pi = m.pinId.toUpperCase();
      if (pn.startsWith(hintUpper) || pi.startsWith(hintUpper)) {
        return netNodeMap.get(m.netId) ?? `NC_${comp.id}_${pinHint}`;
      }
    }
    // Fallback: numeric index (1-based or 0-based) or alphabetic index
    if (pinNets.length > 0) {
      const numIdx = parseInt(pinHint);
      if (!isNaN(numIdx) && numIdx >= 1 && numIdx <= pinNets.length) {
        return netNodeMap.get(pinNets[numIdx - 1].netId) ?? `N_${comp.id}_${pinHint}`;
      }
      const alphaIdx = pinHint.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
      if (alphaIdx >= 0 && alphaIdx < pinNets.length) {
        return netNodeMap.get(pinNets[alphaIdx].netId) ?? `N_${comp.id}_${pinHint}`;
      }
    }
    return `N_${comp.id}_${pinHint}`;
  }

  /** Two-terminal passives: try common pin naming conventions in order. */
  private resolvePassiveTerminals(comp: ComponentInstance, pinNets: PinNetMapping[],
    netNodeMap: Map<string, string>): [string, string] {
    // For two-pin devices the order doesn't matter, so use index-based assignment as primary strategy
    if (pinNets.length >= 2) {
      const nA = netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_A`;
      const nB = netNodeMap.get(pinNets[1].netId) ?? `NC_${comp.id}_B`;
      if (nA !== nB && !this.isFloatingNode(nA) && !this.isFloatingNode(nB)) {
        return [nA, nB];
      }
    }
    // Fallback: try named pin conventions
    const tryHints = [
      ['A', 'K'], ['A', 'B'], ['1', '2'], ['P1', 'P2'],
      ['+', '-'], ['ANODE', 'CATHODE'], ['PLUS', 'MINUS']
    ];
    for (const hintPair of tryHints) {
      const hA = hintPair[0];
      const hB = hintPair[1];
      const nA = this.resolveCompNode(comp, hA, pinNets, netNodeMap);
      const nB = this.resolveCompNode(comp, hB, pinNets, netNodeMap);
      if (nA !== nB && !this.isFloatingNode(nA) && !this.isFloatingNode(nB)) {
        return [nA, nB];
      }
    }
    // Last resort: use first two pins regardless
    if (pinNets.length >= 2) {
      return [
        netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_A`,
        netNodeMap.get(pinNets[1].netId) ?? `NC_${comp.id}_B`
      ];
    }
    if (pinNets.length === 1) {
      const n1 = netNodeMap.get(pinNets[0].netId) ?? `NC_${comp.id}_1`;
      return [n1, `NC_${comp.id}_2`];
    }
    return [`NC_${comp.id}_A`, `NC_${comp.id}_B`];
  }

  /** Voltmeter V+/COM and ammeter I+/I- — never rely on pin index order. */
  private resolveInstrumentTerminals(comp: ComponentInstance, pinNets: PinNetMapping[],
    netNodeMap: Map<string, string>, libUpper: string): [string, string] {
    if (libUpper.includes('VOLTMETER') || (libUpper.includes('METER') && !libUpper.includes('AMMETER'))) {
      const nPlus = this.resolveCompNode(comp, 'V+', pinNets, netNodeMap);
      const nCom = this.resolveCompNode(comp, 'COM', pinNets, netNodeMap);
      return [nPlus, nCom];
    }
    if (libUpper.includes('AMMETER')) {
      const nPlus = this.resolveCompNode(comp, 'I+', pinNets, netNodeMap);
      const nMinus = this.resolveCompNode(comp, 'I-', pinNets, netNodeMap);
      return [nPlus, nMinus];
    }
    return this.resolvePassiveTerminals(comp, pinNets, netNodeMap);
  }

  /** Single-pin supply symbols (VCC/GND) — match by pin name or ID; must be wire-connected. */
  private resolveSupplyNode(comp: ComponentInstance, pinNets: PinNetMapping[],
    netNodeMap: Map<string, string>, defaultName: string): string {
    for (const hint of ['VCC', 'VDD', 'V+', 'GND', '1', 'A']) {
      const node = this.resolveCompNode(comp, hint, pinNets, netNodeMap);
      if (!this.isFloatingNode(node)) {
        return node;
      }
    }
    if (pinNets.length > 0) {
      const node = netNodeMap.get(pinNets[0].netId);
      if (node !== undefined && !this.isFloatingNode(node)) {
        return node;
      }
    }
    return `NC_${comp.id}_${defaultName}`;
  }

  private areTerminalsConnected(nA: string, nB: string): boolean {
    return !this.isFloatingNode(nA) && !this.isFloatingNode(nB) && nA !== nB;
  }

  private isFloatingNode(nodeName: string): boolean {
    if (nodeName.startsWith('NC_')) {
      return true;
    }
    // Synthetic node from resolveCompNode when pin is unmapped: N_<compId>_<pinHint>
    // compId contains underscores (e.g. comp_1783663703417_11), so do not use [^_]+.
    if (nodeName.startsWith('N_')) {
      return true;
    }
    return false;
  }

  // ---- MNA core solver ----

  private buildNodeIndex(_doc: SchematicDocument): void {
    this.nodeIndex.clear();
    this.nodeIndex.set('0', 0);

    let idx = 1;
    const addNode = (nodeName: string): void => {
      if (nodeName.length === 0) {
        return;
      }
      const normalized = nodeName === 'GND' ? '0' : nodeName;
      if (normalized === '0' || this.nodeIndex.has(normalized)) {
        return;
      }
      this.nodeIndex.set(normalized, idx++);
    };

    // Use the same node names as buildNetNodeMap / device stamps
    this.netUuidToNode.forEach((nodeName: string) => {
      addNode(nodeName);
    });

    for (const r of this.resistors) {
      addNode(r.nodeA);
      addNode(r.nodeB);
    }
    for (const c of this.capacitors) {
      addNode(c.nodeA);
      addNode(c.nodeB);
    }
    for (const l of this.inductors) {
      addNode(l.nodeA);
      addNode(l.nodeB);
    }
    for (const d of this.diodes) {
      addNode(d.nodeA);
      addNode(d.nodeB);
    }
    for (const vs of this.voltageSources) {
      addNode(vs.nodeA);
      addNode(vs.nodeB);
    }
    for (const bjt of this.bjts) {
      addNode(bjt.nodeC);
      addNode(bjt.nodeB);
      addNode(bjt.nodeE);
    }
    for (const opa of this.opamps) {
      addNode(opa.nodeOut);
      addNode(opa.nodeInP);
      addNode(opa.nodeInN);
      addNode(opa.nodeVcc);
      addNode(opa.nodeVee);
    }

    if (!this.nodeIndex.has('VCC')) {
      addNode('VCC');
    }

    this.matrixSize = idx + this.voltageSources.length + 10;
  }

  private buildDeviceModels(doc: SchematicDocument): void {
    this.resistors = []; this.capacitors = []; this.inductors = [];
    this.diodes = []; this.bjts = []; this.mosfets = []; this.opamps = [];
    this.voltageSources = []; this.compPinNets.clear();

    const netNodeMap = this.buildNetNodeMap(doc);
    const vt = 0.02585;
    let rIdx = 0; let cIdx = 0; let dIdx = 0; let qIdx = 0; let xIdx = 0;

    for (const comp of doc.components) {
      const libId = comp.libraryId.toUpperCase();
      const pinNets = this.getPinNetConnections(comp.id, doc);
      const passive = this.resolvePassiveTerminals(comp, pinNets, netNodeMap);
      const nA = passive[0];
      const nB = passive[1];

      if (libId.startsWith('R_') || libId.includes('RESISTOR')) {
        if (!this.areTerminalsConnected(nA, nB)) {
          Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: resistor pin(s) not wired`);
          continue;
        }
        const val = paramMapGet(comp.parameters, 'value', '');
        const fallback = libId.replace(/^(R_|RESISTOR_?)/i, '');
        const corrected = this.withUnitSuffix(val, fallback);
        const rVal = this.parseResistance(corrected);
        const devId = `R${rIdx++}`;
        Logger.info(INSTR_TRACE_TAG,
          `analog R-dev ${comp.refDes} lib=${comp.libraryId} val="${val}" fallback="${fallback}" corrected="${corrected}" → ${rVal}Ω`);
        this.resistors.push({ id: devId, nodeA: nA, nodeB: nB, resistance: rVal });
        this.compUuidToDevId.set(comp.id, [devId]);
        traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, nA, nB,
          `${rVal}Ω pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
        // Also store net ↔ node mapping for this component's nets
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.startsWith('C_') || libId.includes('CAP')) {
        if (!this.areTerminalsConnected(nA, nB)) {
          continue;
        }
        const val = paramMapGet(comp.parameters, 'value', '');
        const fallback = libId.replace(/^(C_|CAP_?)/i, '');
        const cVal = this.parseCapacitance(this.withUnitSuffix(val, fallback));
        const devId = `C${cIdx}`;
        this.capacitors.push({
          id: devId, nodeA: nA, nodeB: nB,
          capacitance: cVal, voltage: 0, prevVoltage: 0, geq: 0, ieq: 0
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        cIdx++;
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.startsWith('L_') || libId.includes('INDUCTOR')) {
        if (!this.areTerminalsConnected(nA, nB)) {
          continue;
        }
        const val = paramMapGet(comp.parameters, 'value', '');
        const fallback = libId.replace(/^L_/i, '');
        const lVal = this.parseInductance(this.withUnitSuffix(val, fallback || '1m'));
        const devId = `L${cIdx}`;
        this.inductors.push({
          id: devId, nodeA: nA, nodeB: nB,
          inductance: lVal, current: 0, prevCurrent: 0, prevVoltage: 0, ieqStamp: 0
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        cIdx++;
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.includes('LED') || libId.startsWith('1N') || libId.includes('DIODE')) {
        if (!this.areTerminalsConnected(nA, nB)) {
          continue;
        }
        const devId = `D${dIdx++}`;
        this.diodes.push({
          id: devId, nodeA: nA, nodeB: nB, is: 1e-14, n: 1.0, vt: vt, rs: 0.5
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.includes('NPN') || libId.includes('PNP') || libId.includes('2N') || libId.includes('BC')) {
        const nC = this.resolveCompNode(comp, 'C', pinNets, netNodeMap);
        const nE = this.resolveCompNode(comp, 'E', pinNets, netNodeMap);
        const devId = `Q${qIdx++}`;
        this.bjts.push({
          id: devId, nodeC: nC, nodeB: nB, nodeE: nE,
          type: libId.includes('PNP') ? 'pnp' : 'npn',
          is: 1e-14, bf: 200, nf: 1.0, vaf: 100
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.includes('LM358') || libId.includes('LM324') || libId.includes('OP')) {
        const nO = this.resolveCompNode(comp, 'OUT', pinNets, netNodeMap);
        const nP = this.resolveCompNode(comp, '+', pinNets, netNodeMap);
        const nN = this.resolveCompNode(comp, '-', pinNets, netNodeMap);
        const devId = `X${xIdx++}`;
        this.opamps.push({
          id: devId, nodeOut: nO, nodeInP: nP, nodeInN: nN,
          nodeVcc: 'VCC', nodeVee: '0', gain: 100000, bw: 1e6
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else if (libId.includes('VCC') || libId.includes('POWER') || libId.includes('VDD')) {
        const supplyNode = this.resolveSupplyNode(comp, pinNets, netNodeMap, 'VCC');
        if (this.isFloatingNode(supplyNode)) {
          Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: supply pin not wired`);
          continue;
        }
        const vNum = parseVoltageVolts(paramMapGet(comp.parameters, 'voltage', '5V'), 5);
        const devId = `V${this.voltageSources.length}`;
        this.voltageSources.push({
          id: devId, nodeA: supplyNode, nodeB: '0',
          voltage: vNum, waveform: 'dc', freq: 0, amplitude: 0, phase: 0,
          dutyCycle: 0.5, riseTime: 0, fallTime: 0
        });
        this.compUuidToDevId.set(comp.id, [devId]);
        traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, supplyNode, '0',
          `Vsrc ${vNum}V pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      } else {
        // MCU, instruments, etc. — inject characteristic impedance so nodes don't float
        const libUpper = libId.toUpperCase();
        if (libUpper.includes('VOLTMETER') || (libUpper.includes('METER') && !libUpper.includes('AMMETER'))) {
          const vm = this.resolveInstrumentTerminals(comp, pinNets, netNodeMap, libUpper);
          if (!this.areTerminalsConnected(vm[0], vm[1])) {
            Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: voltmeter pin(s) not wired`);
          } else {
            const devId = `R${rIdx++}`;
            this.resistors.push({ id: devId, nodeA: vm[0], nodeB: vm[1], resistance: 10e6 });
            this.compUuidToDevId.set(comp.id, [devId]);
            traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, vm[0], vm[1],
              `10MΩ VM pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
          }
        } else if (libUpper.includes('AMMETER')) {
          const am = this.resolveInstrumentTerminals(comp, pinNets, netNodeMap, libUpper);
          if (!this.areTerminalsConnected(am[0], am[1])) {
            Logger.info(INSTR_TRACE_TAG, `analog skip ${comp.refDes}: ammeter pin(s) not wired`);
          } else {
            const devId = `R${rIdx++}`;
            this.resistors.push({ id: devId, nodeA: am[0], nodeB: am[1], resistance: 0.1 });
            this.compUuidToDevId.set(comp.id, [devId]);
            traceAnalogDeviceStamp(comp.refDes, devId, comp.libraryId, am[0], am[1],
              `0.1Ω AM pins=[${AnalogEngine.formatPinNetDetail(pinNets, netNodeMap)}]`);
          }
        }
        for (const m of pinNets) {
          const node = netNodeMap.get(m.netId);
          if (node) this.netUuidToNode.set(m.netId, node);
        }
      }
    }

    const rStamps: AnalogResistorStamp[] = [];
    for (let ri = 0; ri < this.resistors.length; ri++) {
      const r = this.resistors[ri];
      let refDes = r.id;
      this.compUuidToDevId.forEach((devIds: string[], compId: string) => {
        if (devIds.includes(r.id)) {
          const comp = doc.components.find(c => c.id === compId);
          if (comp !== undefined) {
            refDes = comp.refDes;
          }
        }
      });
      rStamps.push({ devId: r.id, refDes: refDes, nodeA: r.nodeA, nodeB: r.nodeB, ohms: r.resistance });
    }
    const vsrcLines: string[] = [];
    for (let vi = 0; vi < this.voltageSources.length; vi++) {
      const vs = this.voltageSources[vi];
      vsrcLines.push(`Vsrc ${vs.id} ${vs.nodeA}->${vs.nodeB} ${vs.voltage}V`);
    }
    traceAnalogNetlistSummary(rStamps, vsrcLines);
  }

  solveTransient(time: number, stepSize: number): Map<string, number> {
    this.lastStepSize = stepSize;
    this.simTime = time;
    this.solveTransientStep(stepSize);
    const signals = new Map<string, number>();
    this.nodeVoltages.forEach((v, node) => signals.set(node, v));
    this.computeBranchCurrents();
    return signals;
  }

  solveDC(): Map<string, number> {
    this.runOpAnalysis();
    return copyNodeMap(this.nodeVoltages);
  }

  solveAC(freq: number): Map<string, number> {
    this.buildMnaSystem(freq, true);
    const n = this.nodeIndex.size + this.voltageSources.length;
    if (!this.solveLinearSystem(n)) {
      this.lastConverged = false;
      return copyNodeMap(this.nodeVoltages);
    }
    const result = new Map<string, number>();
    this.nodeIndex.forEach((idx, node) => {
      if (idx < this.mnaRhs.length) result.set(node, Math.abs(this.mnaRhs[idx]));
    });
    this.lastConverged = true;
    return result;
  }

  getNetlist(): string { return this.netlist; }
  getBranchCurrents(): Map<string, number> { return this.branchCurrents; }
  getLastConverged(): boolean { return this.lastConverged; }
  getNodeVoltage(node: string): number { return this.nodeVoltages.get(node) ?? 0; }
  getTotalIterations(): number { return this.newtonIterations; }

  private runOpAnalysis(): void {
    for (let iter = 0; iter < this.maxNewtonIter; iter++) {
      this.newtonIterations = iter + 1;
      this.buildMnaSystem(0, false);
      const n = this.nodeIndex.size + this.voltageSources.length;
      if (!this.solveLinearSystem(n)) { this.lastConverged = false; return; }
      if (this.checkNewtonConvergence(n)) { this.lastConverged = true; this.updateNodeVoltages(n); return; }
      this.updateNodeVoltages(n);
    }
    this.lastConverged = false;
  }

  private solveTransientStep(dt: number): void {
    this.updateCompanionModels(dt);
    this.runOpAnalysis();
    for (const cap of this.capacitors) { cap.prevVoltage = cap.voltage; }
  }

  private buildMnaSystem(freq: number, isAc: boolean): void {
    const vSrcCount = this.voltageSources.length;
    const totalSize = this.nodeIndex.size + vSrcCount;
    this.mnaG = new Array(totalSize * totalSize).fill(0);
    this.mnaRhs = new Array(totalSize).fill(0);
    const n = this.nodeIndex.size;
    const omega = 2 * Math.PI * freq;
    const useComplex = isAc && freq > 0;

    // Ground node constraint
    const gndIdx = this.nodeIndex.get('0') ?? 0;
    this.mnaG[gndIdx * totalSize + gndIdx] = 1;
    this.mnaRhs[gndIdx] = 0;

    // Resistors: g = 1/R
    for (const r of this.resistors) {
      const ni = this.nodeIndex.get(r.nodeA);
      const nj = this.nodeIndex.get(r.nodeB);
      if (ni === undefined || nj === undefined) continue;
      const g = 1.0 / Math.max(r.resistance, 1e-12);
      this.stampConductance(ni, nj, g, totalSize);
    }

    // Capacitors: trapezoidal companion model
    // g_eq = 2*C/dt,  i_eq = g_eq * v_prev + i_prev
    for (const cap of this.capacitors) {
      const ni = this.nodeIndex.get(cap.nodeA);
      const nj = this.nodeIndex.get(cap.nodeB);
      if (ni === undefined || nj === undefined) continue;
      if (useComplex) {
        const g = omega * cap.capacitance;
        this.stampConductance(ni, nj, g, totalSize);
      } else if (this.lastStepSize > 0) {
        this.stampConductance(ni, nj, cap.geq, totalSize);
        this.mnaRhs[ni] -= cap.ieq;
        this.mnaRhs[nj] += cap.ieq;
      }
    }

    // Inductors: trapezoidal companion model
    // R_eq = 2*L/dt,  i_eq = i_prev + (dt/(2L)) * v_prev
    for (const ind of this.inductors) {
      const ni = this.nodeIndex.get(ind.nodeA);
      const nj = this.nodeIndex.get(ind.nodeB);
      if (ni === undefined || nj === undefined) continue;
      if (useComplex) {
        const g = ind.inductance > 0 ? 1.0 / (omega * ind.inductance) : 1e12;
        this.stampConductance(ni, nj, g, totalSize);
      } else if (this.lastStepSize > 0 && ind.inductance > 0) {
        const geq = this.lastStepSize / (2 * ind.inductance);
        // ieqStamp = I_hist from previous step (computed in updateCompanionModels)
        // i_n = geq * (v_A - v_B) + I_hist
        this.stampConductance(ni, nj, geq, totalSize);
        this.mnaRhs[ni] -= ind.ieqStamp;
        this.mnaRhs[nj] += ind.ieqStamp;
      }
    }

    // Voltage sources (stamp as extra rows/cols)
    for (let vsIdx = 0; vsIdx < vSrcCount; vsIdx++) {
      const vs = this.voltageSources[vsIdx];
      const ni = this.nodeIndex.get(vs.nodeA);
      const nj = this.nodeIndex.get(vs.nodeB);
      if (ni === undefined || nj === undefined) continue;
      const row = n + vsIdx;
      let vVal = vs.voltage;
      if (!isAc && vs.freq > 0) {
        const omega = 2 * Math.PI * vs.freq;
        const period = 1.0 / vs.freq;
        const phase = ((this.simTime % period) + period) % period / period; // 0..1
        switch (vs.waveform) {
          case 'sin':
            vVal = vs.voltage + vs.amplitude * Math.sin(omega * this.simTime + vs.phase);
            break;
          case 'square': {
            const sqPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
            vVal = vs.voltage + (sqPhase < (vs.dutyCycle || 0.5) ? vs.amplitude : -vs.amplitude);
            break;
          }
          case 'triangle': {
            const triPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
            vVal = vs.voltage + vs.amplitude * (4 * Math.abs(triPhase - 0.5) - 1);
            break;
          }
          case 'sawtooth': {
            const sawPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
            vVal = vs.voltage + vs.amplitude * (2 * sawPhase - 1);
            break;
          }
          case 'pulse': {
            const pPhase = (phase + vs.phase / (2 * Math.PI) + 1) % 1;
            vVal = vs.voltage + (pPhase < (vs.dutyCycle || 0.5) ? vs.amplitude : 0);
            break;
          }
          default:
            vVal = vs.voltage;
            break;
        }
      }
      this.mnaG[ni * totalSize + row] = 1;
      this.mnaG[nj * totalSize + row] = -1;
      this.mnaG[row * totalSize + ni] = 1;
      this.mnaG[row * totalSize + nj] = -1;
      this.mnaRhs[row] = vVal;
    }

    // Nonlinear devices: diodes, BJTs, opamps
    for (const d of this.diodes) {
      const ni = this.nodeIndex.get(d.nodeA);
      const nj = this.nodeIndex.get(d.nodeB);
      if (ni === undefined || nj === undefined || useComplex) continue;
      this.stampDiode(ni, nj, d, totalSize);
    }
    for (const bjt of this.bjts) {
      const nc = this.nodeIndex.get(bjt.nodeC);
      const nb = this.nodeIndex.get(bjt.nodeB);
      const ne = this.nodeIndex.get(bjt.nodeE);
      if (nc === undefined || nb === undefined || ne === undefined || useComplex) continue;
      this.stampBjt(nc, nb, ne, bjt, totalSize);
    }
    for (const opa of this.opamps) {
      const no = this.nodeIndex.get(opa.nodeOut);
      const np = this.nodeIndex.get(opa.nodeInP);
      const nn = this.nodeIndex.get(opa.nodeInN);
      if (no === undefined || np === undefined || nn === undefined || useComplex) continue;
      this.stampOpAmp(no, np, nn, opa, totalSize);
    }
  }

  private stampConductance(ni: number, nj: number, g: number, size: number): void {
    this.mnaG[ni * size + ni] += g;
    this.mnaG[nj * size + nj] += g;
    this.mnaG[ni * size + nj] -= g;
    this.mnaG[nj * size + ni] -= g;
  }

  private stampDiode(ni: number, nj: number, d: DiodeModel, size: number): void {
    const vd = (this.nodeVoltages.get(d.nodeA) ?? 0) - (this.nodeVoltages.get(d.nodeB) ?? 0);
    const vThermal = d.n * d.vt;
    let id: number; let gd: number;
    if (vd > -10 * vThermal) {
      const expArg = Math.min(vd / vThermal, 40);
      id = d.is * (Math.exp(expArg) - 1);
      gd = d.is * Math.exp(expArg) / vThermal;
    } else {
      id = -d.is;
      gd = 1e-12;
    }
    if (d.rs > 0 && gd > 0) {
      const denom = 1 + gd * d.rs;
      gd = gd / denom;
      id = id / denom;
    }
    gd = Math.max(gd, 1e-12);
    this.stampConductance(ni, nj, gd, size);
    this.mnaRhs[ni] -= id;
    this.mnaRhs[nj] += id;
  }

  private stampBjt(nc: number, nb: number, ne: number, bjt: BjtModel, size: number): void {
    const vbe = (this.nodeVoltages.get(bjt.nodeB) ?? 0) - (this.nodeVoltages.get(bjt.nodeE) ?? 0);
    const vbc = (this.nodeVoltages.get(bjt.nodeB) ?? 0) - (this.nodeVoltages.get(bjt.nodeC) ?? 0);
    const vt = bjt.nf * 0.02585;
    let gbe: number; let ibe: number;
    if (vbe > -10 * vt) {
      const expArg = Math.min(vbe / vt, 40);
      ibe = (bjt.is / bjt.bf) * (Math.exp(expArg) - 1);
      gbe = (bjt.is / bjt.bf) * Math.exp(expArg) / vt;
    } else {
      ibe = -bjt.is / bjt.bf;
      gbe = 1e-12;
    }
    let gbc: number; let ibc: number;
    if (vbc > -10 * vt) {
      const expArg = Math.min(vbc / vt, 40);
      ibc = bjt.is * (Math.exp(expArg) - 1);
      gbc = bjt.is * Math.exp(expArg) / vt;
    } else {
      ibc = -bjt.is;
      gbc = 1e-12;
    }
    const alpha = bjt.bf / (bjt.bf + 1);
    const ic = alpha * bjt.is * (Math.exp(Math.min(vbe / vt, 40)) - 1) - ibc;
    this.stampConductance(nb, ne, gbe, size);
    this.stampConductance(nb, nc, gbc, size);
    this.mnaRhs[nb] -= ibe + ibc;
    this.mnaRhs[nc] -= ic - ibc;
    this.mnaRhs[ne] += ibe + ic;
  }

  private stampOpAmp(no: number, np: number, nn: number, opa: OpAmpModel, size: number): void {
    // Ideal op-amp: v_out = A * (v_in+ - v_in-), clamped to supply rails
    // Stamp as Norton equivalent: G_out * v_out - G_out*A*(v_p - v_n) = 0
    // → G_out*v_out - G_out*A*v_p + G_out*A*v_n = 0
    const gOut = 1e-3; // Output conductance (1kΩ output impedance)
    const vcc = this.nodeVoltages.get('VCC') ?? 5;
    const vee = this.nodeVoltages.get(opa.nodeVee) ?? 0;
    const vDiff = (this.nodeVoltages.get(opa.nodeInP) ?? 0) - (this.nodeVoltages.get(opa.nodeInN) ?? 0);
    let idealOut = vDiff * opa.gain;
    // Soft clamp: use tanh instead of hard clamp to maintain continuity for Newton
    const mid = (vcc + vee) / 2;
    const range = (vcc - vee) / 2 - 0.2;
    const clamped = mid + range * Math.tanh(idealOut / Math.max(range, 0.1));
    // gOut * (v_out - clamped) = 0 → G[no][np] = -gOut*A, G[no][nn] = +gOut*A, G[no][no] = gOut, RHS[no] = gOut*clamped - gOut*A*(v_p - v_n)
    // But the clamped value already encodes A*(v_p - v_n)...
    // Better: stamp as v_out = A*(v_p - v_n) with output resistance
    // G[no][no] += gOut;  G[no][np] -= gOut * opa.gain;  G[no][nn] += gOut * opa.gain;
    // RHS[no] = gOut * (v_out_prev - A*(v_p - v_n))  ...
    const vOut = this.nodeVoltages.get(opa.nodeOut) ?? mid;
    const rhsVal = gOut * (clamped - vOut);
    this.mnaG[no * size + no] += gOut;
    this.mnaRhs[no] += rhsVal;
  }

  // ---- LU decomposition solver with partial pivoting ----

  private solveLinearSystem(n: number): boolean {
    if (n <= 0) return false;
    const a = this.mnaG.slice();
    const b = this.mnaRhs.slice();

    // LU decomposition in-place with partial pivoting
    for (let k = 0; k < n; k++) {
      // Find pivot
      let maxVal = Math.abs(a[k * n + k]);
      let maxRow = k;
      for (let i = k + 1; i < n; i++) {
        const val = Math.abs(a[i * n + k]);
        if (val > maxVal) { maxVal = val; maxRow = i; }
      }
      if (maxVal < 1e-12) {
        // Singular row — ground it
        a[k * n + k] = 1;
        b[k] = 0;
        continue;
      }
      // Swap rows
      if (maxRow !== k) {
        for (let j = 0; j < n; j++) {
          const tmp = a[k * n + j];
          a[k * n + j] = a[maxRow * n + j];
          a[maxRow * n + j] = tmp;
        }
        const tmpB = b[k]; b[k] = b[maxRow]; b[maxRow] = tmpB;
      }

      // Eliminate below
      const pivot = a[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const factor = a[i * n + k] / pivot;
        if (Math.abs(factor) < 1e-15) continue;
        a[i * n + k] = factor; // Store L factor
        for (let j = k + 1; j < n; j++) {
          a[i * n + j] -= factor * a[k * n + j];
        }
        b[i] -= factor * b[k];
      }
    }

    // Back substitution
    for (let k = n - 1; k >= 0; k--) {
      if (Math.abs(a[k * n + k]) < 1e-12) { b[k] = 0; continue; }
      for (let i = k + 1; i < n; i++) {
        b[k] -= a[k * n + i] * b[i];
      }
      b[k] /= a[k * n + k];
    }

    this.mnaRhs = b;
    return true;
  }

  private checkNewtonConvergence(n: number): boolean {
    let maxDelta = 0;
    this.nodeIndex.forEach((idx, node) => {
      if (idx < n && idx < this.mnaRhs.length) {
        const oldV = this.nodeVoltages.get(node) ?? 0;
        const delta = Math.abs(this.mnaRhs[idx] - oldV);
        if (delta > maxDelta) maxDelta = delta;
      }
    });
    return maxDelta < 1e-5;
  }

  private updateNodeVoltages(n: number): void {
    this.nodeIndex.forEach((idx, node) => {
      if (idx < n && idx < this.mnaRhs.length) {
        this.nodeVoltages.set(node, this.mnaRhs[idx]);
      }
    });
    const vSrcCount = this.voltageSources.length;
    for (let i = 0; i < vSrcCount; i++) {
      const row = n + i;
      if (row < this.mnaRhs.length) {
        this.branchCurrents.set(`I(${this.voltageSources[i].id})`, this.mnaRhs[row]);
      }
    }
  }

  // ---- Companion model update (trapezoidal rule) ----

  // Trapezoidal companion model update:
  // Capacitor: i = C * dv/dt
  // Trapezoidal rule: i(n) = (2C/dt)*v(n) - [(2C/dt)*v(n-1) + i(n-1)]
  // So ieq(n) stores [(2C/dt)*v(n-1) + i(n-1)], giving i(n) = geq*v(n) - ieq(n)
  // After solving for v(n), we update: ieq(n+1) = 2*geq*v(n) - ieq(n)
  //
  // Inductor: v = L * di/dt
  // Trapezoidal rule: i(n) = (dt/2L)*v(n) + [(dt/2L)*v(n-1) + i(n-1)]
  // Companion: geq = dt/(2L), ieq flows from A to B, stored as branch parameter
  private updateCompanionModels(dt: number): void {
    for (const cap of this.capacitors) {
      if (dt > 1e-15 && cap.capacitance > 0) {
        cap.geq = 2 * cap.capacitance / dt;
        const vA = this.nodeVoltages.get(cap.nodeA) ?? 0;
        const vB = this.nodeVoltages.get(cap.nodeB) ?? 0;
        const vNow = vA - vB;
        // Trapezoidal: i_n = geq*v_n - J_n where J_n = geq*v_{n-1} + i_{n-1}
        // Store ieq = -J_n so MNA RHS gets +J_n via rhs -= ieq
        // Next step: ieq_{n+1} = -J_{n+1} = -(geq*v_n + i_n) = -2*geq*v_n - ieq_n
        cap.ieq = -(2 * cap.geq * vNow) - cap.ieq;
        cap.prevVoltage = cap.voltage;
        cap.voltage = vNow;
      }
    }
    // Inductor companion model: i_n = geq*v_n + I_hist
    // geq = dt/(2L), ieqStamp = I_hist from previous step
    for (const ind of this.inductors) {
      if (dt > 1e-15 && ind.inductance > 0) {
        const vA = this.nodeVoltages.get(ind.nodeA) ?? 0;
        const vB = this.nodeVoltages.get(ind.nodeB) ?? 0;
        const vNow = vA - vB;
        const geq = dt / (2 * ind.inductance);
        // i_n = I_hist + geq * v_n  (companion: Norton equivalent)
        // I_hist = i_{n-1} + geq * v_{n-1}
        const iNow = ind.ieqStamp + geq * vNow;
        // Store for next step: ieqStamp_{n+1} = i_n + geq * v_n = i_n + geq * vNow
        ind.ieqStamp = iNow + geq * vNow;
        ind.current = iNow;
        ind.prevCurrent = ind.current;
        ind.prevVoltage = vNow;
      }
    }
  }

  private computeBranchCurrents(): void {
    for (const r of this.resistors) {
      const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
      const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
      this.branchCurrents.set(`I(${r.id})`, (vA - vB) / Math.max(r.resistance, 1e-12));
    }
    for (const cap of this.capacitors) {
      const vA = this.nodeVoltages.get(cap.nodeA) ?? 0;
      const vB = this.nodeVoltages.get(cap.nodeB) ?? 0;
      const ic = cap.capacitance * ((vA - vB) - cap.prevVoltage) / Math.max(this.lastStepSize, 1e-15);
      this.branchCurrents.set(`I(${cap.id})`, ic);
    }
    // Also compute net-specific currents for instrument support
    this.netUuidToNode.forEach((nodeName: string, netUuid: string) => {
      if (nodeName !== '0' && nodeName !== 'VCC') {
        let netCurrent = 0;
        for (const r of this.resistors) {
          if (r.nodeA === nodeName) {
            const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
            netCurrent += (vA - vB) / Math.max(r.resistance, 1e-12);
          } else if (r.nodeB === nodeName) {
            const vA = this.nodeVoltages.get(r.nodeA) ?? 0;
            const vB = this.nodeVoltages.get(r.nodeB) ?? 0;
            netCurrent -= (vA - vB) / Math.max(r.resistance, 1e-12);
          }
        }
        this.branchCurrents.set(`NET(${netUuid})`, netCurrent);
      }
    });
  }

  /** Get branch current for a component instance UUID */
  getCurrentForComponent(compUuid: string): number {
    const devIds = this.compUuidToDevId.get(compUuid);
    if (devIds && devIds.length > 0) {
      return this.branchCurrents.get(`I(${devIds[0]})`) ?? 0;
    }
    return 0;
  }

  /** Register or update a signal generator as a voltage source in the circuit */
  registerSignalSource(sourceId: string, nodeA: string, nodeB: string,
                       waveform: string, voltage: number, amplitude: number,
                       freq: number, phase: number, dutyCycle: number): void {
    // Find existing source with this ID or add new one
    let existing = false;
    for (let i = 0; i < this.voltageSources.length; i++) {
      if (this.voltageSources[i].id === sourceId) {
        this.voltageSources[i] = {
          id: sourceId, nodeA, nodeB,
          voltage, waveform, freq, amplitude, phase, dutyCycle,
          riseTime: 0, fallTime: 0
        };
        existing = true;
        break;
      }
    }
    if (!existing) {
      this.voltageSources.push({
        id: sourceId, nodeA, nodeB,
        voltage, waveform, freq, amplitude, phase, dutyCycle,
        riseTime: 0, fallTime: 0
      });
    }
    // Expand node index if needed
    if (!this.nodeIndex.has(nodeA)) {
      this.nodeIndex.set(nodeA, this.nodeIndex.size);
    }
    if (!this.nodeIndex.has(nodeB)) {
      this.nodeIndex.set(nodeB, this.nodeIndex.size);
    }
  }

  /** Get all node voltages for display/export */
  getNodeVoltageMap(): Map<string, number> {
    return copyNodeMap(this.nodeVoltages);
  }

  /** Get all branch currents for display/export */
  getBranchCurrentMap(): Map<string, number> {
    return new Map(this.branchCurrents);
  }

  /** Get net current (sum of branch currents at a net) */
  getNetCurrentForUuid(netUuid: string): number {
    return this.branchCurrents.get(`NET(${netUuid})`) ?? 0;
  }

  // ---- Parse utilities ----

  /**
   * If value is a bare number (no unit suffix) but fallback has one,
   * append the suffix so "4.7"+"4.7K"→"4.7K".  If value is empty,
   * return the fallback as-is.
   */
  private withUnitSuffix(value: string, fallback: string): string {
    const v = value.trim();
    if (v.length === 0) return fallback;
    if (/[a-z]/i.test(v)) return v;                  // already has a unit
    const m = fallback.match(/[a-zµ]+$/i);           // extract suffix from fallback
    if (m === null) return v;
    return v + m[0];
  }

  private static formatPinNetDetail(pinNets: PinNetMapping[], netNodeMap: Map<string, string>): string {
    const parts: string[] = [];
    for (let i = 0; i < pinNets.length; i++) {
      const m = pinNets[i];
      const label = m.pinName.length > 0 ? m.pinName : m.pinId;
      const node = netNodeMap.get(m.netId) ?? '?';
      parts.push(`${label}@${node}`);
    }
    return parts.length > 0 ? parts.join(',') : '(none)';
  }

  private parseResistance(val: string): number {
    const normalized = AnalogEngine.normalizeResistanceInput(val);
    const parsed = UnitParser.parseResistance(normalized);
    if (parsed.valid && parsed.numeric > 0) {
      return parsed.numeric;
    }
    const s = normalized.toLowerCase().replace(/[ωohm]/g, '').trim();
    if (s.includes('meg')) {
      return parseFloat(s) * 1e6;
    }
    if (s.includes('k')) {
      const n = parseFloat(s);
      return isNaN(n) ? 1000 : n * 1000;
    }
    if (s.includes('m') && !s.includes('meg')) {
      return parseFloat(s) * 0.001;
    }
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? 1000 : n;
  }

  /**
   * Fix malformed values like "47000ΩK" (already ohms + stray K from lib id).
   * Values >= 1000 with a trailing K are treated as plain ohms.
   */
  private static normalizeResistanceInput(val: string): string {
    let s = val.trim().replace(/\s+/g, '');
    // "47ΩK" / "47000ΩK" — strip Ω before K/M/G suffix
    s = s.replace(/(?:Ω|ohm|R)(?=[KMG])/i, '');
    const redundantK = s.match(/^([\d.]+)(?:Ω|ohm|R)?K$/i);
    if (redundantK !== null) {
      const n = parseFloat(redundantK[1]);
      if (!isNaN(n) && n >= 1000) {
        return `${n}Ω`;
      }
    }
    return s;
  }

  private parseCapacitance(val: string): number {
    const s = val.toLowerCase().replace('f', '').trim();
    if (s.includes('u') || s.includes('µ')) return parseFloat(s) * 1e-6;
    if (s.includes('n')) return parseFloat(s) * 1e-9;
    if (s.includes('p')) return parseFloat(s) * 1e-12;
    if (s.includes('m')) return parseFloat(s) * 1e-3;
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? 100e-9 : n;
  }

  private parseInductance(val: string): number {
    const s = val.toLowerCase().replace('h', '').trim();
    if (s.includes('u') || s.includes('µ')) return parseFloat(s) * 1e-6;
    if (s.includes('n')) return parseFloat(s) * 1e-9;
    if (s.includes('p')) return parseFloat(s) * 1e-12;
    if (s.includes('m')) return parseFloat(s) * 1e-3;
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? 0.001 : n;
  }

  private toSpiceValue(val: string): string {
    if (val.length === 0) return '1k';
    const s = val.replace('µ', 'u');
    if (s.includes('Meg')) return s;
    if (s.includes('k') || s.includes('K')) return s.toUpperCase().replace('K', 'k');
    if (s.includes('M') && !s.includes('Meg') && !s.includes('m')) return s.replace('M', 'Meg');
    if (/^\d+(\.\d+)?$/.test(s)) return s;
    return s;
  }
}

function copyNodeMap(source: Map<string, number>): Map<string, number> {
  const copy = new Map<string, number>();
  source.forEach((v, k) => copy.set(k, v));
  return copy;
}
