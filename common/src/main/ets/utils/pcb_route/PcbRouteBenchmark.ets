/**
 * 自动布线基准：合成小板 + 多引擎探针，输出布通/线长量化。
 * 可在应用内调用 runAutorouteBenchmark() 看日志与返回值。
 */
import {
  PcbDocument, PcbLayerId, PcbPadType, PcbPadShape, createEmptyPcbDocument
} from '../../types/PcbTypes';
import { Point2D } from '../../types/CommonTypes';
import { IdUtil } from '../IdUtil';
import { mazeRouteRectilinear, MazeLayerPair } from './PcbMazeRouter';
import { routeGridlessVisible } from './PcbGridlessRoom';
import { routeRoomModel } from './PcbRoomModel';
import { routePolyRoom } from './PcbPolyRoom';
import { buildCongestionMap } from './PcbGlobalRoute';
import { assignGlobalChannelsEdgeAware } from './PcbGCellEdgeRouter';
import { assignTracksToGuides } from './PcbTrackAssign';
import { GlobalNetSeed } from './PcbGlobalChannel';
import { annealRouteOptimize } from './PcbSimulatedAnnealing';
import { computeAutoRouteMetrics } from './PcbRouteVerify';
import { autoRoutePcb } from '../PcbAutoRouter';
import { tracePcb } from '../PcbTraceLog';

export interface BenchCaseResult {
  name: string;
  pairs: number;
  mazeOk: number;
  gridlessOk: number;
  roomOk: number;
  polyOk: number;
  completion: number;
}

export interface BenchReport {
  cases: BenchCaseResult[];
  overallCompletion: number;
  annealImprovedPct: number;
  summary: string;
}

export interface E2ECaseResult {
  name: string;
  completionRate: number;
  trackCount: number;
  viaCount: number;
  drcErrorCount: number;
  elapsedMs: number;
}

export interface E2EReport {
  cases: E2ECaseResult[];
  overallCompletion: number;
  summary: string;
}

function addNet(doc: PcbDocument, name: string): string {
  const id = IdUtil.generate('net');
  doc.nets.push({ id, name, classId: 'nc_signal' });
  return id;
}

function addTwoPadFp(
  doc: PcbDocument,
  ref: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  netId: string,
  netName: string
): void {
  const fpId = IdUtil.generate('fp');
  doc.footprints.push({
    id: fpId,
    defId: 'bench_r',
    refDes: ref,
    value: '10k',
    position: { x: (ax + bx) * 0.5, y: (ay + by) * 0.5 },
    rotation: 0,
    mirrored: false,
    layer: PcbLayerId.F_CU,
    locked: false,
    pads: [
      {
        id: IdUtil.generate('pad'),
        number: '1',
        type: PcbPadType.SMD,
        shape: PcbPadShape.RECT,
        pos: { x: ax - (ax + bx) * 0.5, y: ay - (ay + by) * 0.5 },
        size: { x: 20, y: 20 },
        layers: [PcbLayerId.F_CU],
        netId,
        netName
      },
      {
        id: IdUtil.generate('pad'),
        number: '2',
        type: PcbPadType.SMD,
        shape: PcbPadShape.RECT,
        pos: { x: bx - (ax + bx) * 0.5, y: by - (ay + by) * 0.5 },
        size: { x: 20, y: 20 },
        layers: [PcbLayerId.F_CU],
        netId,
        netName
      }
    ]
  });
}

/** 简单：3 条不相交网 */
export function buildBenchBoardSimple(): PcbDocument {
  const doc = createEmptyPcbDocument('bench_simple');
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: 1200, y: 0 }, { x: 1200, y: 800 }, { x: 0, y: 800 }
  ];
  const n1 = addNet(doc, 'S1');
  const n2 = addNet(doc, 'S2');
  const n3 = addNet(doc, 'S3');
  addTwoPadFp(doc, 'R1', 100, 100, 500, 100, n1, 'S1');
  addTwoPadFp(doc, 'R2', 100, 300, 500, 300, n2, 'S2');
  addTwoPadFp(doc, 'R3', 100, 500, 500, 500, n3, 'S3');
  return doc;
}

/** 交叉：两网对角交叉，测绕障 */
export function buildBenchBoardCross(): PcbDocument {
  const doc = createEmptyPcbDocument('bench_cross');
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }
  ];
  const n1 = addNet(doc, 'A');
  const n2 = addNet(doc, 'B');
  addTwoPadFp(doc, 'RA', 80, 80, 900, 900, n1, 'A');
  addTwoPadFp(doc, 'RB', 80, 900, 900, 80, n2, 'B');
  // 中央障碍焊盘（浮空）
  doc.footprints.push({
    id: IdUtil.generate('fp'),
    defId: 'obs',
    refDes: 'OBS',
    value: '',
    position: { x: 500, y: 500 },
    rotation: 0,
    mirrored: false,
    layer: PcbLayerId.F_CU,
    locked: true,
    pads: [{
      id: IdUtil.generate('pad'),
      number: '1',
      type: PcbPadType.SMD,
      shape: PcbPadShape.RECT,
      pos: { x: 0, y: 0 },
      size: { x: 120, y: 120 },
      layers: [PcbLayerId.F_CU]
    }]
  });
  return doc;
}

/** 中等：8 网网格 */
export function buildBenchBoardGrid(): PcbDocument {
  const doc = createEmptyPcbDocument('bench_grid');
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: 1600, y: 0 }, { x: 1600, y: 1200 }, { x: 0, y: 1200 }
  ];
  for (let i = 0; i < 8; i++) {
    const name = `N${i}`;
    const nid = addNet(doc, name);
    const y = 80 + i * 120;
    addTwoPadFp(doc, `R${i}`, 80, y, 1400, y + ((i % 2) * 40 - 20), nid, name);
  }
  return doc;
}

interface PairJob {
  netId: string;
  netName: string;
  a: Point2D;
  b: Point2D;
}

function collectPairs(doc: PcbDocument): PairJob[] {
  const byNet: Map<string, Point2D[]> = new Map();
  const names: Map<string, string> = new Map();
  for (let fi = 0; fi < doc.footprints.length; fi++) {
    const fp = doc.footprints[fi];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const pad = fp.pads[pi];
      const nid = pad.netId ?? '';
      if (nid.length === 0) {
        continue;
      }
      names.set(nid, pad.netName ?? nid);
      const wp: Point2D = {
        x: fp.position.x + pad.pos.x,
        y: fp.position.y + pad.pos.y
      };
      let arr = byNet.get(nid);
      if (arr === undefined) {
        arr = [];
        byNet.set(nid, arr);
      }
      arr.push(wp);
    }
  }
  const jobs: PairJob[] = [];
  byNet.forEach((pts: Point2D[], nid: string) => {
    if (pts.length < 2) {
      return;
    }
    jobs.push({
      netId: nid,
      netName: names.get(nid) ?? nid,
      a: pts[0],
      b: pts[pts.length - 1]
    });
  });
  return jobs;
}

function probeCase(doc: PcbDocument, name: string, width: number, grid: number): BenchCaseResult {
  const jobs = collectPairs(doc);
  const pair: MazeLayerPair = { h: PcbLayerId.F_CU, v: PcbLayerId.F_CU };
  let mazeOk = 0;
  let gridlessOk = 0;
  let roomOk = 0;
  let polyOk = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    if (mazeRouteRectilinear(doc, pair, j.a, j.b, j.netId, width, grid, 1).length >= 2) {
      mazeOk++;
    }
    if (routeGridlessVisible(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2) {
      gridlessOk++;
    }
    if (routeRoomModel(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2) {
      roomOk++;
    }
    if (routePolyRoom(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2) {
      polyOk++;
    }
  }
  let routed = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const ok =
      mazeRouteRectilinear(doc, pair, j.a, j.b, j.netId, width, grid, 1).length >= 2 ||
      routeGridlessVisible(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2 ||
      routeRoomModel(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2 ||
      routePolyRoom(doc, PcbLayerId.F_CU, j.a, j.b, j.netId, width).length >= 2;
    if (ok) {
      routed++;
      const mid: Point2D = { x: j.b.x, y: j.a.y };
      doc.tracks.push({
        id: IdUtil.generate('trk'),
        layer: PcbLayerId.F_CU,
        start: { x: j.a.x, y: j.a.y },
        end: mid,
        width,
        netId: j.netId,
        netName: j.netName
      });
      doc.tracks.push({
        id: IdUtil.generate('trk'),
        layer: PcbLayerId.F_CU,
        start: mid,
        end: { x: j.b.x, y: j.b.y },
        width,
        netId: j.netId,
        netName: j.netName
      });
    }
  }
  const completion = jobs.length > 0 ? routed / jobs.length : 1;
  const result: BenchCaseResult = {
    name,
    pairs: jobs.length,
    mazeOk,
    gridlessOk,
    roomOk,
    polyOk,
    completion
  };
  tracePcb('BENCH_CASE',
    `${name} pairs=${jobs.length} maze=${mazeOk} gridless=${gridlessOk} room=${roomOk} ` +
    `poly=${polyOk} completion=${(completion * 100).toFixed(0)}%`);
  return result;
}

/**
 * 跑 3 个合成板基准 + 全局通道烟测 + 退火。
 */
export function runAutorouteBenchmark(): BenchReport {
  const width = 10;
  const grid = 10;
  const cases: BenchCaseResult[] = [];

  const simple = buildBenchBoardSimple();
  cases.push(probeCase(simple, 'simple3', width, grid));

  const cross = buildBenchBoardCross();
  cases.push(probeCase(cross, 'cross2', width, grid));

  const gridBoard = buildBenchBoardGrid();
  // 全局通道烟测
  const seeds: GlobalNetSeed[] = [];
  const jobs = collectPairs(gridBoard);
  for (let i = 0; i < jobs.length; i++) {
    seeds.push({
      netId: jobs[i].netId,
      a: jobs[i].a,
      b: jobs[i].b,
      layerH: PcbLayerId.F_CU,
      layerV: PcbLayerId.B_CU
    });
  }
  const cmap = buildCongestionMap(gridBoard, 80);
  const plan0 = assignGlobalChannelsEdgeAware(cmap, seeds, 1);
  assignTracksToGuides(cmap, plan0, 20);
  cases.push(probeCase(gridBoard, 'grid8', width, grid));

  const anneal = annealRouteOptimize(gridBoard, 80, 7);
  let sum = 0;
  for (let i = 0; i < cases.length; i++) {
    sum += cases[i].completion;
  }
  const overall = cases.length > 0 ? sum / cases.length : 0;
  const metrics = computeAutoRouteMetrics(gridBoard, jobs.length, gridBoard.tracks.length, 0);
  const summary =
    `bench overall=${(overall * 100).toFixed(0)}% anneal=${anneal.improvedPct.toFixed(1)}% ` +
    `grid8_drc=${metrics.drcErrorCount} guides=${plan0.guides.size}`;
  tracePcb('BENCH_DONE', summary);

  return {
    cases,
    overallCompletion: overall,
    annealImprovedPct: anneal.improvedPct,
    summary
  };
}

/**
 * 端到端 F8 回归：对合成板调用完整 autoRoutePcb，量化布通/DRC/耗时。
 */
interface BenchBoardEntry {
  name: string;
  doc: PcbDocument;
}

export async function runAutorouteE2EBenchmark(): Promise<E2EReport> {
  const cases: E2ECaseResult[] = [];
  const b0: BenchBoardEntry = { name: 'e2e_simple3', doc: buildBenchBoardSimple() };
  const b1: BenchBoardEntry = { name: 'e2e_cross2', doc: buildBenchBoardCross() };
  const b2: BenchBoardEntry = { name: 'e2e_grid8', doc: buildBenchBoardGrid() };
  const boards: BenchBoardEntry[] = [b0, b1, b2];

  for (let i = 0; i < boards.length; i++) {
    const b = boards[i];
    b.doc.tracks = [];
    b.doc.vias = [];
    const t0 = Date.now();
    const result = await autoRoutePcb(b.doc, PcbLayerId.F_CU);
    const elapsed = Date.now() - t0;
    const rate = result.completionRate !== undefined ? result.completionRate : 0;
    const vias = result.viaCount !== undefined ? result.viaCount : 0;
    const drc = result.drcErrorCount !== undefined ? result.drcErrorCount : 0;
    const caseR: E2ECaseResult = {
      name: b.name,
      completionRate: rate,
      trackCount: result.trackCount,
      viaCount: vias,
      drcErrorCount: drc,
      elapsedMs: elapsed
    };
    cases.push(caseR);
    tracePcb('BENCH_E2E',
      `${b.name} completion=${(rate * 100).toFixed(0)}% trk=${result.trackCount} ` +
      `via=${vias} drc=${drc} ms=${elapsed}`);
  }

  let sum = 0;
  for (let i = 0; i < cases.length; i++) {
    sum += cases[i].completionRate;
  }
  const overall = cases.length > 0 ? sum / cases.length : 0;
  const summary = `e2e overall=${(overall * 100).toFixed(0)}% cases=${cases.length}`;
  tracePcb('BENCH_E2E_DONE', summary);
  return { cases, overallCompletion: overall, summary };
}
