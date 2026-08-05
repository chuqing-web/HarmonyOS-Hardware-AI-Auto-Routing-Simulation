/**
 * PCB AI pipeline blackboard
 */
import {
  PcbDocument, PcbTrack, PcbVia, PcbPad, PcbFootprintInst, PcbZone, Point2D,
  PcbPlacementPlan, PcbNetPlanResult, PcbRoutePolicy, PcbGeometryResult
} from 'common';

export class PcbRouteBlackboard {
  runId: string = '';
  usedLlm: boolean = false;
  stageCompleted: string = '';
  abortStage: string = '';
  abortReason: string = '';
  workDoc: PcbDocument | null = null;
  placementPlan: PcbPlacementPlan | null = null;
  netPlan: PcbNetPlanResult | null = null;
  routePolicy: PcbRoutePolicy | null = null;
  geometry: PcbGeometryResult | null = null;
  /** 与原理图 aiEnableReasoning 同步：开则允许 thinking */
  enableReasoning: boolean = false;
  logs: string[] = [];

  reset(runId: string, doc: PcbDocument, enableReasoning: boolean = false): void {
    this.runId = runId;
    this.usedLlm = false;
    this.stageCompleted = '';
    this.abortStage = '';
    this.abortReason = '';
    this.workDoc = clonePcbWorkingDoc(doc);
    this.placementPlan = null;
    this.netPlan = null;
    this.routePolicy = null;
    this.geometry = null;
    this.enableReasoning = enableReasoning;
    this.logs = [];
  }

  log(msg: string): void {
    this.logs.push(msg);
  }

  abort(stage: string, reason: string): void {
    this.abortStage = stage;
    this.abortReason = reason;
    this.log(`ABORT ${stage}: ${reason}`);
  }

  markStage(stage: string): void {
    this.stageCompleted = stage;
    this.log(`stage_done=${stage}`);
  }
}

/** Clone working doc: deep-copy footprint pose/pads; empty tracks/vias */
export function clonePcbWorkingDoc(src: PcbDocument): PcbDocument {
  const footprints: PcbFootprintInst[] = [];
  for (let fi = 0; fi < src.footprints.length; fi++) {
    const fp = src.footprints[fi];
    const pads: PcbPad[] = [];
    for (let pi = 0; pi < fp.pads.length; pi++) {
      const p = fp.pads[pi];
      const pos: Point2D = { x: p.pos.x, y: p.pos.y };
      const size: Point2D = { x: p.size.x, y: p.size.y };
      const pad: PcbPad = {
        id: p.id,
        number: p.number,
        type: p.type,
        shape: p.shape,
        pos: pos,
        size: size,
        drill: p.drill,
        layers: p.layers.slice(),
        netId: p.netId,
        netName: p.netName
      };
      pads.push(pad);
    }
    const position: Point2D = { x: fp.position.x, y: fp.position.y };
    const fpClone: PcbFootprintInst = {
      id: fp.id,
      defId: fp.defId,
      refDes: fp.refDes,
      value: fp.value,
      position: position,
      rotation: fp.rotation,
      mirrored: fp.mirrored,
      layer: fp.layer,
      locked: fp.locked,
      pads: pads,
      schematicCompId: fp.schematicCompId
    };
    footprints.push(fpClone);
  }
  const zones: PcbZone[] = [];
  const srcZones = src.zones ?? [];
  for (let zi = 0; zi < srcZones.length; zi++) {
    const z = srcZones[zi];
    const outline: Point2D[] = [];
    for (let oi = 0; oi < z.outline.length; oi++) {
      outline.push({ x: z.outline[oi].x, y: z.outline[oi].y });
    }
    const cutouts: Point2D[][] = [];
    for (let ci = 0; ci < (z.cutouts?.length ?? 0); ci++) {
      const poly: Point2D[] = [];
      for (let pi = 0; pi < z.cutouts[ci].length; pi++) {
        poly.push({ x: z.cutouts[ci][pi].x, y: z.cutouts[ci][pi].y });
      }
      cutouts.push(poly);
    }
    const manualCutouts: Point2D[][] = [];
    for (let ci = 0; ci < (z.manualCutouts?.length ?? 0); ci++) {
      const poly: Point2D[] = [];
      for (let pi = 0; pi < z.manualCutouts[ci].length; pi++) {
        poly.push({ x: z.manualCutouts[ci][pi].x, y: z.manualCutouts[ci][pi].y });
      }
      manualCutouts.push(poly);
    }
    zones.push({
      id: z.id,
      layer: z.layer,
      netId: z.netId,
      netName: z.netName,
      outline,
      priority: z.priority,
      clearance: z.clearance,
      cutouts,
      manualCutouts,
      thermalRelief: z.thermalRelief,
      thermalGap: z.thermalGap,
      thermalWidth: z.thermalWidth
    });
  }
  const doc: PcbDocument = {
    id: src.id,
    name: src.name,
    version: src.version,
    boardOutline: src.boardOutline,
    footprints: footprints,
    tracks: [],
    vias: [],
    zones: zones,
    nets: src.nets,
    netClasses: src.netClasses,
    diffPairs: src.diffPairs,
    layers: src.layers,
    layerStack: src.layerStack,
    metadata: src.metadata
  };
  return doc;
}

export function commitGeometryToWorkDoc(bb: PcbRouteBlackboard, tracks: PcbTrack[], vias: PcbVia[]): void {
  if (!bb.workDoc) {
    return;
  }
  bb.workDoc.tracks = tracks.slice();
  bb.workDoc.vias = vias.slice();
}
