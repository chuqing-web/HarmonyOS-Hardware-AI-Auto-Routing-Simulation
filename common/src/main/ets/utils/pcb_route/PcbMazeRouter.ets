/**
 * PCB 正交 A* 绕障：按 H/V 层对校验 clearance，拐角换层检查 via。
 * 供经典自动布线在折线候选耗尽后兜底。
 */
import {
  PcbDocument, PcbLayerId, copperLayersFromStack
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { pathClearBlockReason, viaClearAt } from './PcbClearanceOracle';
import { mazeViaTransitionCost } from './PcbViaCostModel';

export interface MazeLayerPair {
  h: PcbLayerId;
  v: PcbLayerId;
}

interface MazeNode {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: MazeNode | null;
  dir: number;
}

const TURN_COST = 2;
/** 过孔代价约 2×单位格线长启发，抑制无谓换层（可被层跨度模型覆盖） */
const VIA_COST = 10;
/** 靠近搜索窗边缘惩罚（近似「居中走线 / 远离障碍」） */
const EDGE_BIAS = 0.25;
const MAX_STEPS_SYNC = 4500;
/** 异步 A*：收紧步数/开放集，配合高频让出，避免 THREAD_BLOCK */
const MAX_STEPS_ASYNC = 1800;
const MAX_OPEN = 600;
const ASTAR_WALL_MS = 80;
/** 每 N 步让出一次（须足够密，否则 uvLoopTask 堵住看门狗） */
const ASYNC_YIELD_EVERY = 32;
/** 异步 A* 墙钟软上限（ms）——远小于 3s 看门狗 */
const ASTAR_ASYNC_WALL_MS = 90;

function snapPt(p: Point2D, grid: number): Point2D {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid
  };
}

function layerForDir(pair: MazeLayerPair, dir: number): PcbLayerId {
  // 0:+x 1:-x → H；2:+y 3:-y → V
  if (dir === 0 || dir === 1) {
    return pair.h;
  }
  return pair.v;
}

function isHDir(dir: number): boolean {
  return dir === 0 || dir === 1;
}

function compressOrtho(path: Point2D[]): Point2D[] {
  if (path.length <= 2) {
    return path.slice();
  }
  const out: Point2D[] = [];
  const p0: Point2D = { x: path[0].x, y: path[0].y };
  out.push(p0);
  for (let i = 1; i < path.length - 1; i++) {
    const prev = out[out.length - 1];
    const cur: Point2D = { x: path[i].x, y: path[i].y };
    const next = path[i + 1];
    const ax = Math.abs(cur.x - prev.x) < 0.5;
    const ay = Math.abs(cur.y - prev.y) < 0.5;
    const bx = Math.abs(next.x - cur.x) < 0.5;
    const by = Math.abs(next.y - cur.y) < 0.5;
    // 共线则跳过中间点
    if ((ax && bx) || (ay && by)) {
      continue;
    }
    out.push(cur);
  }
  const last: Point2D = { x: path[path.length - 1].x, y: path[path.length - 1].y };
  const tail = out[out.length - 1];
  if (Math.abs(last.x - tail.x) >= 0.5 || Math.abs(last.y - tail.y) >= 0.5) {
    out.push(last);
  }
  return out;
}

/** 两点之间保证正交：已正交则直连，否则插入 L 折点（H-first） */
function manhattanJoin(a: Point2D, b: Point2D, preferHFirst: boolean): Point2D[] {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx < 0.5 && dy < 0.5) {
    return [];
  }
  if (dx < 0.5 || dy < 0.5) {
    const only: Point2D = { x: b.x, y: b.y };
    return [only];
  }
  const mid: Point2D = preferHFirst
    ? { x: b.x, y: a.y }
    : { x: a.x, y: b.y };
  const bPt: Point2D = { x: b.x, y: b.y };
  return [mid, bPt];
}

/**
 * 把格点路径封到真实焊盘端点，且全程正交（禁止 from→首格 / 末格→to 斜线）。
 */
function sealEndpoints(gridPath: Point2D[], from: Point2D, to: Point2D): Point2D[] {
  if (gridPath.length === 0) {
    return [];
  }
  const mid = compressOrtho(gridPath);
  if (mid.length === 0) {
    return [];
  }
  const out: Point2D[] = [];
  const start: Point2D = { x: from.x, y: from.y };
  out.push(start);
  // from → 首格：正交接上
  const firstJoin = manhattanJoin(start, mid[0], true);
  for (let i = 0; i < firstJoin.length; i++) {
    out.push(firstJoin[i]);
  }
  // 中间格点（跳过已接入的首点）
  for (let i = 1; i < mid.length; i++) {
    const p: Point2D = { x: mid[i].x, y: mid[i].y };
    const last = out[out.length - 1];
    if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) {
      continue;
    }
    // 格点链应已正交；若否补 L
    const join = manhattanJoin(last, p, true);
    for (let j = 0; j < join.length; j++) {
      out.push(join[j]);
    }
  }
  const end: Point2D = { x: to.x, y: to.y };
  const last = out[out.length - 1];
  if (Math.abs(end.x - last.x) >= 0.5 || Math.abs(end.y - last.y) >= 0.5) {
    const endJoin = manhattanJoin(last, end, false);
    for (let i = 0; i < endJoin.length; i++) {
      out.push(endJoin[i]);
    }
  }
  return compressOrtho(out);
}

function viaDia(doc: PcbDocument): number {
  return doc.metadata.designRules.minViaDrill + 8;
}

/**
 * 正交 A*：边按方向落在 pair.h / pair.v；换轴时要求 via 可打。
 * @param clearanceScale 仅搜索用；1=与提交相同；略小于 1 仅作末次兜底
 */
export function mazeRouteRectilinear(
  doc: PcbDocument,
  pair: MazeLayerPair,
  from: Point2D,
  to: Point2D,
  netId: string,
  width: number,
  gridIn: number,
  clearanceScale: number = 1
): Point2D[] {
  const grid = Math.max(2, Math.round(gridIn));
  const a0 = snapPt(from, grid);
  const b0 = snapPt(to, grid);
  const sgx = Math.round(a0.x / grid);
  const sgy = Math.round(a0.y / grid);
  const egx = Math.round(b0.x / grid);
  const egy = Math.round(b0.y / grid);

  const manh = Math.abs(egx - sgx) + Math.abs(egy - sgy);
  if (manh === 0) {
    // 同格：端点可能不对齐，强制曼哈顿
    const sealed = sealEndpoints([a0], from, to);
    if (sealed.length < 2) {
      return [];
    }
    let ok = true;
    for (let i = 0; i < sealed.length - 1; i++) {
      const ly = Math.abs(sealed[i].x - sealed[i + 1].x) >=
        Math.abs(sealed[i].y - sealed[i + 1].y) ? pair.h : pair.v;
      if (!edgeClear(doc, ly, sealed[i], sealed[i + 1], netId, width, clearanceScale)) {
        ok = false;
        break;
      }
    }
    return ok ? sealed : [];
  }

  const pad = Math.min(48, Math.max(12, Math.ceil(manh * 0.35) + 14));
  const minGx = Math.min(sgx, egx) - pad;
  const maxGx = Math.max(sgx, egx) + pad;
  const minGy = Math.min(sgy, egy) - pad;
  const maxGy = Math.max(sgy, egy) + pad;

  const copper = copperLayersFromStack(doc.layerStack);
  const viaLayers = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  const dia = viaDia(doc);
  const needVia = pair.h !== pair.v;
  const viaStepCost = needVia ? mazeViaTransitionCost(doc, pair.h, pair.v) : VIA_COST;

  const open: MazeNode[] = [];
  const openMap = new Map<string, number>();
  const closed = new Set<string>();

  const start: MazeNode = {
    gx: sgx, gy: sgy, g: 0,
    f: manh, parent: null, dir: -1
  };
  open.push(start);
  openMap.set(`${sgx},${sgy},-1`, 0);

  let steps = 0;
  let found: MazeNode | null = null;
  const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const wallT0 = Date.now();

  while (open.length > 0 && steps < MAX_STEPS_SYNC) {
    if (open.length > MAX_OPEN) {
      break;
    }
    if (steps > 0 && (steps & 31) === 0 && (Date.now() - wallT0) > ASTAR_WALL_MS) {
      break;
    }
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) {
        bestIdx = i;
      }
    }
    const cur = open[bestIdx];
    const ckey = `${cur.gx},${cur.gy},${cur.dir}`;
    openMap.delete(ckey);
    if (bestIdx === open.length - 1) {
      open.pop();
    } else {
      const moved = open[open.length - 1];
      open[bestIdx] = moved;
      open.pop();
      openMap.set(`${moved.gx},${moved.gy},${moved.dir}`, bestIdx);
    }
    if (closed.has(ckey)) {
      continue;
    }
    closed.add(ckey);
    steps++;

    if (cur.gx === egx && cur.gy === egy) {
      found = cur;
      break;
    }

    for (let di = 0; di < 4; di++) {
      const ngx = cur.gx + dirs[di][0];
      const ngy = cur.gy + dirs[di][1];
      if (ngx < minGx || ngx > maxGx || ngy < minGy || ngy > maxGy) {
        continue;
      }
      const nkey = `${ngx},${ngy},${di}`;
      if (closed.has(nkey)) {
        continue;
      }

      const fromW: Point2D = { x: cur.gx * grid, y: cur.gy * grid };
      const toW: Point2D = { x: ngx * grid, y: ngy * grid };
      const ly = layerForDir(pair, di);

      // 换轴 → 过孔（分层对才需要）
      if (needVia && cur.dir >= 0 && isHDir(cur.dir) !== isHDir(di)) {
        if (!viaClearAt(doc, fromW, netId, dia, viaLayers, doc.tracks, doc.vias)) {
          continue;
        }
      } else if (!needVia && cur.dir >= 0 && isHDir(cur.dir) !== isHDir(di)) {
        // 同层对：拐角无需 via，段仍在同层校验
      }

      if (!edgeClear(doc, ly, fromW, toW, netId, width, clearanceScale)) {
        continue;
      }

      let stepCost = 1;
      if (cur.dir >= 0 && cur.dir !== di) {
        stepCost += TURN_COST;
        if (needVia && isHDir(cur.dir) !== isHDir(di)) {
          stepCost += viaStepCost;
        }
      }
      // 居中偏置：远离搜索窗边界（近似避障贴边）
      const midGx = (minGx + maxGx) * 0.5;
      const midGy = (minGy + maxGy) * 0.5;
      const span = Math.max(1, (maxGx - minGx) + (maxGy - minGy));
      stepCost += EDGE_BIAS * (Math.abs(ngx - midGx) + Math.abs(ngy - midGy)) / span;
      const tentativeG = cur.g + stepCost;
      const existingIdx = openMap.get(nkey);
      if (existingIdx !== undefined && existingIdx < open.length &&
        open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
        open[existingIdx].dir === di && open[existingIdx].g <= tentativeG) {
        continue;
      }
      const h = Math.abs(egx - ngx) + Math.abs(egy - ngy);
      const node: MazeNode = {
        gx: ngx, gy: ngy, g: tentativeG, f: tentativeG + h,
        parent: cur, dir: di
      };
      if (existingIdx !== undefined && existingIdx < open.length &&
        open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
        open[existingIdx].dir === di) {
        open[existingIdx] = node;
      } else {
        openMap.set(nkey, open.length);
        open.push(node);
      }
    }
  }

  if (found === null) {
    return [];
  }
  const gridPath: Point2D[] = [];
  let walk: MazeNode | null = found;
  while (walk !== null) {
    gridPath.push({ x: walk.gx * grid, y: walk.gy * grid });
    walk = walk.parent;
  }
  gridPath.reverse();
  return sealEndpoints(gridPath, from, to);
}

/** 异步 A*：定期让出主线程 */
export async function mazeRouteRectilinearAsync(
  doc: PcbDocument,
  pair: MazeLayerPair,
  from: Point2D,
  to: Point2D,
  netId: string,
  width: number,
  gridIn: number,
  clearanceScale: number
): Promise<Point2D[]> {
  const grid = Math.max(2, Math.round(gridIn));
  const a0 = snapPt(from, grid);
  const b0 = snapPt(to, grid);
  const sgx = Math.round(a0.x / grid);
  const sgy = Math.round(a0.y / grid);
  const egx = Math.round(b0.x / grid);
  const egy = Math.round(b0.y / grid);

  const manh = Math.abs(egx - sgx) + Math.abs(egy - sgy);
  if (manh === 0) {
    const sealed = sealEndpoints([a0], from, to);
    if (sealed.length < 2) {
      return [];
    }
    let ok = true;
    for (let i = 0; i < sealed.length - 1; i++) {
      const ly = Math.abs(sealed[i].x - sealed[i + 1].x) >=
        Math.abs(sealed[i].y - sealed[i + 1].y) ? pair.h : pair.v;
      if (!edgeClear(doc, ly, sealed[i], sealed[i + 1], netId, width, clearanceScale)) {
        ok = false;
        break;
      }
    }
    return ok ? sealed : [];
  }

  // 异步搜索窗略紧，避免远距离对拖垮主线程
  const pad = Math.min(48, Math.max(12, Math.ceil(manh * 0.35) + 12));
  const minGx = Math.min(sgx, egx) - pad;
  const maxGx = Math.max(sgx, egx) + pad;
  const minGy = Math.min(sgy, egy) - pad;
  const maxGy = Math.max(sgy, egy) + pad;

  const copper = copperLayersFromStack(doc.layerStack);
  const viaLayers = copper.length > 0 ? copper.slice() : [PcbLayerId.F_CU, PcbLayerId.B_CU];
  const dia = viaDia(doc);
  const needVia = pair.h !== pair.v;
  const viaStepCost = needVia ? mazeViaTransitionCost(doc, pair.h, pair.v) : VIA_COST;

  const open: MazeNode[] = [];
  const openMap = new Map<string, number>();
  const closed = new Set<string>();

  const start: MazeNode = {
    gx: sgx, gy: sgy, g: 0,
    f: manh, parent: null, dir: -1
  };
  open.push(start);
  openMap.set(`${sgx},${sgy},-1`, 0);

  let steps = 0;
  let found: MazeNode | null = null;
  const dirs: number[][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const wallT0 = Date.now();
  while (open.length > 0 && steps < MAX_STEPS_ASYNC) {
    if (open.length > MAX_OPEN) {
      break;
    }
    if (steps > 0 && (steps % ASYNC_YIELD_EVERY) === 0) {
      if ((Date.now() - wallT0) > ASTAR_ASYNC_WALL_MS) {
        break;
      }
      await new Promise<void>((resolve: () => void) => {
        setTimeout((): void => {
          resolve();
        }, 1);
      });
    }
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) {
        bestIdx = i;
      }
    }
    const cur = open[bestIdx];
    const ckey = `${cur.gx},${cur.gy},${cur.dir}`;
    openMap.delete(ckey);
    if (bestIdx === open.length - 1) {
      open.pop();
    } else {
      const moved = open[open.length - 1];
      open[bestIdx] = moved;
      open.pop();
      openMap.set(`${moved.gx},${moved.gy},${moved.dir}`, bestIdx);
    }
    if (closed.has(ckey)) {
      continue;
    }
    closed.add(ckey);
    steps++;

    if (cur.gx === egx && cur.gy === egy) {
      found = cur;
      break;
    }

    for (let di = 0; di < 4; di++) {
      const ngx = cur.gx + dirs[di][0];
      const ngy = cur.gy + dirs[di][1];
      if (ngx < minGx || ngx > maxGx || ngy < minGy || ngy > maxGy) {
        continue;
      }
      const nkey = `${ngx},${ngy},${di}`;
      if (closed.has(nkey)) {
        continue;
      }

      const fromW: Point2D = { x: cur.gx * grid, y: cur.gy * grid };
      const toW: Point2D = { x: ngx * grid, y: ngy * grid };
      const ly = layerForDir(pair, di);

      if (needVia && cur.dir >= 0 && isHDir(cur.dir) !== isHDir(di)) {
        if (!viaClearAt(doc, fromW, netId, dia, viaLayers, doc.tracks, doc.vias)) {
          continue;
        }
      }

      if (!edgeClear(doc, ly, fromW, toW, netId, width, clearanceScale)) {
        continue;
      }

      let stepCost = 1;
      if (cur.dir >= 0 && cur.dir !== di) {
        stepCost += TURN_COST;
        if (needVia && isHDir(cur.dir) !== isHDir(di)) {
          stepCost += viaStepCost;
        }
      }
      const midGx = (minGx + maxGx) * 0.5;
      const midGy = (minGy + maxGy) * 0.5;
      const span = Math.max(1, (maxGx - minGx) + (maxGy - minGy));
      stepCost += EDGE_BIAS * (Math.abs(ngx - midGx) + Math.abs(ngy - midGy)) / span;
      const tentativeG = cur.g + stepCost;
      const existingIdx = openMap.get(nkey);
      if (existingIdx !== undefined && existingIdx < open.length &&
        open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
        open[existingIdx].dir === di && open[existingIdx].g <= tentativeG) {
        continue;
      }
      const h = Math.abs(egx - ngx) + Math.abs(egy - ngy);
      const node: MazeNode = {
        gx: ngx, gy: ngy, g: tentativeG, f: tentativeG + h,
        parent: cur, dir: di
      };
      if (existingIdx !== undefined && existingIdx < open.length &&
        open[existingIdx].gx === ngx && open[existingIdx].gy === ngy &&
        open[existingIdx].dir === di) {
        open[existingIdx] = node;
      } else {
        openMap.set(nkey, open.length);
        open.push(node);
      }
    }
  }

  if (found === null) {
    return [];
  }
  const gridPath: Point2D[] = [];
  let walk: MazeNode | null = found;
  while (walk !== null) {
    gridPath.push({ x: walk.gx * grid, y: walk.gy * grid });
    walk = walk.parent;
  }
  gridPath.reverse();
  return sealEndpoints(gridPath, from, to);
}

/**
 * clearanceScale < 1 时：用略窄等效线宽逼近缩小 clearance（仅搜索）；
 * 提交前 tryCommit 仍走硬校验。
 */
function edgeClear(
  doc: PcbDocument,
  layer: PcbLayerId,
  a: Point2D,
  b: Point2D,
  netId: string,
  width: number,
  clearanceScale: number
): boolean {
  if (clearanceScale >= 0.999) {
    return pathClearBlockReason(doc, layer, a, b, netId, width, doc.tracks, doc.vias) === null;
  }
  // 略松：用稍窄「等效线宽」逼近缩小 clearance，提交前仍会 hard 校验
  const softW = Math.max(width * clearanceScale, width * 0.75);
  return pathClearBlockReason(doc, layer, a, b, netId, softW, doc.tracks, doc.vias) === null;
}
