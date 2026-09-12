/**
 * 模板库手摆配方（lab_mcu_stm32 列式）：MCU 分列，Y/CX 贴 OSC 侧，R/RL/D 同簇局部，CD 在 VDD 侧。
 * 供 AUTO_ROUTE 布局阶段：LLM 按此配方决策；本地确定性兜底强制贴簇。
 */
import { PcbDocument, PcbFootprintInst } from '../../types/PcbTypes';
import { PcbPlacementItem, PcbPlacementPlan } from '../../types/PcbAiRouteTypes';
import { Point2D } from '../../types/CommonTypes';
import { tracePcb } from '../PcbTraceLog';

/** 写入 Placement Agent 提示：模板手摆可借 LLM，但几何约束不变 */
export const MCU_COLUMN_PLACE_RECIPE =
  '【模板库手摆配方 — 多MCU最小系统，LLM 按此 revise/relayout】\n' +
  '1) 每列一颗 U{n}；同序号簇必须贴紧：Y{n}+CX* 贴 U 的 OSC 脚侧（通常左侧），' +
  '曼哈顿距离目标 <350mil（禁止晶振远漂）。\n' +
  '2) R{n}/RL{n}/D{n} 同侧局部（复位/LED）；CD{n} 在 VDD 侧（MCU 右侧）。\n' +
  '3) 多 MCU 横向分列，列间距 ≥ MCU半宽*2+350；J1/连接器靠右板边，勿挡 OSC 逃逸。\n' +
  '4) 若态势中 Y↔U 已远 / 飞线含 XTAL：必须 decision=revise 或 relayout 并写出 Y/CX/R/CD 新坐标；禁止 keep。\n' +
  '5) 整板混乱/多簇交叉时用 decision=relayout，placements 覆盖 movable 列表几乎全部 id。\n' +
  '6) footprintId 必须逐字复制态势 fps/movable 列表；可省略 boardWidthMil（保持现板框）。\n';

export interface McuColumnPlaceOpts {
  /** 重排 MCU 列坐标（回环改布局时建议 true） */
  packColumns?: boolean;
  /** Y↔U 超过该曼哈顿距离则视为需修复 */
  farThreshMil?: number;
}

interface BoardBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface ClusterRefs {
  idx: number;
  mcu: PcbFootprintInst;
  xtal: PcbFootprintInst | null;
  cx1: PcbFootprintInst | null;
  cx2: PcbFootprintInst | null;
  rst: PcbFootprintInst | null;
  decap: PcbFootprintInst | null;
  ledr: PcbFootprintInst | null;
  led: PcbFootprintInst | null;
}

function boardBounds(doc: PcbDocument): BoardBounds {
  const pts = doc.boardOutline?.points ?? [];
  if (pts.length < 2) {
    return { minX: 0, minY: 0, maxX: 5000, maxY: 5000 };
  }
  let minX = pts[0].x;
  let minY = pts[0].y;
  let maxX = pts[0].x;
  let maxY = pts[0].y;
  for (let i = 1; i < pts.length; i++) {
    minX = Math.min(minX, pts[i].x);
    minY = Math.min(minY, pts[i].y);
    maxX = Math.max(maxX, pts[i].x);
    maxY = Math.max(maxY, pts[i].y);
  }
  return { minX, minY, maxX, maxY };
}

function clampInBoard(b: BoardBounds, x: number, y: number, inset: number): Point2D {
  return {
    x: Math.max(b.minX + inset, Math.min(b.maxX - inset, x)),
    y: Math.max(b.minY + inset, Math.min(b.maxY - inset, y))
  };
}

function fpHalfW(fp: PcbFootprintInst): number {
  let m = 80;
  for (let i = 0; i < fp.pads.length; i++) {
    const p = fp.pads[i];
    m = Math.max(m, Math.abs(p.pos.x) + p.size.x * 0.5);
  }
  return m;
}

function refIndex(ref: string): number {
  let n = 0;
  let found = false;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      n = n * 10 + (c - 48);
      found = true;
    } else if (found) {
      break;
    }
  }
  return found ? n : -1;
}

function isMcuRef(ref: string): boolean {
  if (ref.length < 2 || ref.charAt(0) !== 'U') {
    return false;
  }
  for (let i = 1; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 48 || c > 57) {
      return false;
    }
  }
  return true;
}

function byRefMap(doc: PcbDocument): Map<string, PcbFootprintInst> {
  const map: Map<string, PcbFootprintInst> = new Map();
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    const r = (fp.refDes ?? '').toUpperCase();
    if (r.length > 0) {
      map.set(r, fp);
    }
  }
  return map;
}

function findRef(map: Map<string, PcbFootprintInst>, ref: string): PcbFootprintInst | null {
  const hit = map.get(ref.toUpperCase());
  return hit !== undefined ? hit : null;
}

function collectClusters(doc: PcbDocument): ClusterRefs[] {
  const map = byRefMap(doc);
  const out: ClusterRefs[] = [];
  for (let i = 0; i < doc.footprints.length; i++) {
    const fp = doc.footprints[i];
    if (fp.locked) {
      continue;
    }
    const ref = (fp.refDes ?? '').toUpperCase();
    if (!isMcuRef(ref)) {
      continue;
    }
    const idx = refIndex(ref);
    if (idx < 0) {
      continue;
    }
    const z = idx - 1; // 模板 CX{z}1 用 0-based
    const xtal = findRef(map, `Y${idx}`);
    let cx1 = findRef(map, `CX${z}1`);
    let cx2 = findRef(map, `CX${z}2`);
    if (cx1 === null) {
      cx1 = findRef(map, `CX${idx}1`);
    }
    if (cx2 === null) {
      cx2 = findRef(map, `CX${idx}2`);
    }
    out.push({
      idx: idx,
      mcu: fp,
      xtal: xtal,
      cx1: cx1,
      cx2: cx2,
      rst: findRef(map, `R${idx}`),
      decap: findRef(map, `CD${idx}`),
      ledr: findRef(map, `RL${idx}`),
      led: findRef(map, `D${idx}`)
    });
  }
  out.sort((a: ClusterRefs, b: ClusterRefs) => a.mcu.position.x - b.mcu.position.x);
  return out;
}

function manh(a: Point2D, b: Point2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** 检测到 ≥1 个 MCU+晶振簇 */
export function detectMcuColumnClusters(doc: PcbDocument): number {
  const cs = collectClusters(doc);
  let n = 0;
  for (let i = 0; i < cs.length; i++) {
    if (cs[i].xtal !== null) {
      n++;
    }
  }
  return n;
}

/** Y 相对 U 过远或缺失贴簇 → 需按模板配方修复 */
export function mcuColumnNeedsRepair(doc: PcbDocument, farThreshMil: number = 420): boolean {
  const cs = collectClusters(doc);
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.xtal === null) {
      continue;
    }
    if (manh(c.mcu.position, c.xtal.position) > farThreshMil) {
      return true;
    }
    if (c.cx1 !== null && manh(c.mcu.position, c.cx1.position) > farThreshMil + 80) {
      return true;
    }
    if (c.cx2 !== null && manh(c.mcu.position, c.cx2.position) > farThreshMil + 80) {
      return true;
    }
  }
  return false;
}

function pushItem(items: PcbPlacementItem[], fp: PcbFootprintInst | null,
  x: number, y: number, rot: number): void {
  if (fp === null || fp.locked) {
    return;
  }
  items.push({
    footprintId: fp.id,
    x: Math.round(x),
    y: Math.round(y),
    rotationDeg: rot,
    mirrored: false
  });
}

/**
 * 生成列式贴簇布局计划（增量 revise）。
 * 不改连接器/安装孔；可选横向重排 MCU。
 */
export function buildMcuColumnPlacementPlan(
  doc: PcbDocument,
  opts?: McuColumnPlaceOpts
): PcbPlacementPlan | null {
  const clusters = collectClusters(doc);
  if (clusters.length === 0) {
    return null;
  }
  let hasXtal = false;
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].xtal !== null) {
      hasXtal = true;
      break;
    }
  }
  if (!hasXtal) {
    return null;
  }

  const pack = opts?.packColumns === true;
  const bounds = boardBounds(doc);
  const inset = 100;
  const items: PcbPlacementItem[] = [];

  // 列坐标：保持相对顺序，必要时重排间距
  const colXs: number[] = [];
  if (pack && clusters.length >= 2) {
    let ox = bounds.minX + inset + 400;
    for (let i = 0; i < clusters.length; i++) {
      const half = fpHalfW(clusters[i].mcu);
      const pitch = Math.max(half * 2 + 380, 1100);
      colXs.push(ox);
      ox += pitch;
    }
    // 若超出板宽，等比压缩列距
    const last = colXs[colXs.length - 1];
    const maxX = bounds.maxX - inset - 350;
    if (last > maxX && colXs.length > 1) {
      const span0 = colXs[colXs.length - 1] - colXs[0];
      const span1 = Math.max(maxX - colXs[0], 400);
      const k = span0 > 1 ? span1 / span0 : 1;
      for (let i = 1; i < colXs.length; i++) {
        colXs[i] = colXs[0] + (colXs[i] - colXs[0]) * k;
      }
    }
  } else {
    for (let i = 0; i < clusters.length; i++) {
      colXs.push(clusters[i].mcu.position.x);
    }
  }

  const uyBase = clusters[0].mcu.position.y;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const half = fpHalfW(c.mcu);
    let ux = colXs[i];
    let uy = pack ? uyBase : c.mcu.position.y;
    const mcuPos = clampInBoard(bounds, ux, uy, inset);
    ux = mcuPos.x;
    uy = mcuPos.y;

    if (pack || Math.abs(c.mcu.position.x - ux) > 8 || Math.abs(c.mcu.position.y - uy) > 8) {
      pushItem(items, c.mcu, ux, uy, 0);
    }

    // 与 _hand_mcu_stm32 同构：OSC/晶振在 MCU 左侧，CD 在右侧
    const sideX = ux - half - 40;
    const rightX = ux + half + 40;

    const yPos = clampInBoard(bounds, sideX - 280, uy - 160, inset);
    pushItem(items, c.xtal, yPos.x, yPos.y, 0);

    const cx1p = clampInBoard(bounds, sideX - 340, uy - 320, inset);
    pushItem(items, c.cx1, cx1p.x, cx1p.y, 180);
    const cx2p = clampInBoard(bounds, sideX - 220, uy - 320, inset);
    pushItem(items, c.cx2, cx2p.x, cx2p.y, 180);

    const rp = clampInBoard(bounds, sideX - 160, uy + 200, inset);
    pushItem(items, c.rst, rp.x, rp.y, 180);

    const cdp = clampInBoard(bounds, rightX + 40, uy - 80, inset);
    pushItem(items, c.decap, cdp.x, cdp.y, 0);

    const rlp = clampInBoard(bounds, sideX - 200, uy + 320, inset);
    pushItem(items, c.ledr, rlp.x, rlp.y, 0);
    const dp = clampInBoard(bounds, sideX - 420, uy + 320, inset);
    pushItem(items, c.led, dp.x, dp.y, 0);
  }

  // 简易去重叠：同计划内中心过近则微挪 X
  const minDist = 70;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const dx = items[j].x - items[i].x;
      const dy = items[j].y - items[i].y;
      const d = Math.hypot(dx, dy);
      if (d < minDist && d > 1e-3) {
        const push = (minDist - d) * 0.5 + 2;
        const nx = dx / d;
        items[i].x = Math.round(items[i].x - nx * push);
        items[j].x = Math.round(items[j].x + nx * push);
      }
    }
  }

  if (items.length === 0) {
    return null;
  }

  const plan: PcbPlacementPlan = {
    fromLlm: false,
    placements: items,
    decision: 'revise',
    reason: `mcu_column_template clusters=${clusters.length} pack=${pack ? 1 : 0}`
  };
  tracePcb('MCU_COL_PLAN',
    `clusters=${clusters.length} items=${items.length} pack=${pack ? 1 : 0}`);
  return plan;
}
