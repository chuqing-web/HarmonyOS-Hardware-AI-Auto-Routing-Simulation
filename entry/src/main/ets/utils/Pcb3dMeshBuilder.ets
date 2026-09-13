/**
 * PCB 文档 → PBR 三角网格（嘉立创风格：阻焊开窗、露铜、参数化元件库）
 */
import {
  PcbDocument, PcbFootprintInst, PcbLayerId, PcbPadType, Point2D, PcbViaKind,
  isCopperLayer, copperLayersFromStack, padWorldPosition
} from 'common';
import { Mesh3d, Vec3, Mat4, PbrMats, PbrMaterial } from './Pcb3dMath';
import { getBoundStepMesh } from './PcbStepImporter';
import { copperWorldZ, boardThicknessWorld, viaZSpan } from './Pcb3dSceneUtil';
import { Pcb3dModelLibrary, MASK_OPENING_EXPAND_MIL } from './Pcb3dModelLibrary';

export class Pcb3dMeshBuilder {
  /** 控制三角数，优先流畅；大板自动截断 */
  private static readonly MAX_TRIS = 42000;

  static build(doc: PcbDocument, maxTris: number = Pcb3dMeshBuilder.MAX_TRIS): Mesh3d {
    const mesh = new Mesh3d();
    mesh.name = doc.name;
    const outline = doc.boardOutline.points;
    if (outline.length < 3) return mesh;

    let minX = outline[0].x;
    let maxX = outline[0].x;
    let minY = outline[0].y;
    let maxY = outline[0].y;
    for (let i = 1; i < outline.length; i++) {
      minX = Math.min(minX, outline[i].x);
      maxX = Math.max(maxX, outline[i].x);
      minY = Math.min(minY, outline[i].y);
      maxY = Math.max(maxY, outline[i].y);
    }
    const boardH = boardThicknessWorld(doc);
    const cuH = 1.2;
    const maskH = 0.55;
    const copperOrder = copperLayersFromStack(doc.layerStack);

    // 基板：侧边 FR4 + 顶面先铺阻焊色（开窗处后续由 ENIG 覆盖）
    Pcb3dMeshBuilder.addBoardExtrusion(mesh, outline, 0, boardH, PbrMats.fr4(), PbrMats.mask());

    // 顶面阻焊薄层（整板；焊盘/过孔以更高 Z 的 ENIG 覆盖形成「开窗」观感）
    mesh.addBox(new Vec3(minX, minY, boardH), new Vec3(maxX, maxY, boardH + maskH), PbrMats.mask());

    // 丝印：封装库轮廓挤出细带
    Pcb3dMeshBuilder.addSilkRibbons(mesh, doc, boardH + maskH + 0.15);

    // 走线：阻焊下铜色（略暗）
    for (let i = 0; i < doc.tracks.length; i++) {
      if (mesh.tris.length > maxTris) break;
      const t = doc.tracks[i];
      if (!isCopperLayer(t.layer)) continue;
      const zMid = copperWorldZ(t.layer, boardH, copperOrder, false, 0, doc.layerStack);
      const z0 = zMid - cuH * 0.45;
      const z1 = Math.min(boardH + maskH * 0.35, zMid + cuH * 0.45);
      const isTop = t.layer === PcbLayerId.F_CU;
      Pcb3dMeshBuilder.addTrackBox(mesh, t.start.x, t.start.y, t.end.x, t.end.y,
        t.width * 0.5, z0, z1, isTop ? PbrMats.maskedCopper() : PbrMats.copper());
    }

    // 铺铜：真实多边形挤出（扇形三角化）
    for (let zi = 0; zi < doc.zones.length; zi++) {
      if (mesh.tris.length > maxTris) break;
      const zn = doc.zones[zi];
      if (!isCopperLayer(zn.layer) || zn.outline.length < 3) continue;
      const zMid = copperWorldZ(zn.layer, boardH, copperOrder, false, 0, doc.layerStack);
      const zh = cuH * 0.5;
      const isTop = zn.layer === PcbLayerId.F_CU;
      Pcb3dMeshBuilder.addPolyPrism(mesh, zn.outline, zMid - zh * 0.5, zMid + zh * 0.5,
        isTop ? PbrMats.maskedCopper() : PbrMats.copper());
    }

    // 过孔：空心镀铜管 + 顶底 ENIG 环（Z 跨度与 Canvas viaZSpan 一致；外径钳制防过大）
    for (let i = 0; i < doc.vias.length; i++) {
      if (mesh.tris.length > maxTris) break;
      const v = doc.vias[i];
      const rDrill = v.drill > 0 ? v.drill * 0.5 : Math.max(v.diameter * 0.22, 2);
      const rOut = Math.min(Math.max(v.diameter * 0.5, rDrill * 1.35), Math.max(rDrill * 1.9, 14));
      const rIn = Math.max(0.8, Math.min(rDrill, rOut * 0.55));
      const kind = v.kind !== undefined ? v.kind : PcbViaKind.THROUGH;
      const span = viaZSpan(v.layers, kind, boardH, copperOrder, false, 0, doc.layerStack);
      const zBot = span.x + 0.08;
      const zTop = Math.max(span.y - 0.08, zBot + 1);
      const segs = doc.vias.length > 80 ? 12 : 16;
      mesh.addTube(v.position.x, v.position.y, zBot, zTop, rOut, rIn, segs,
        PbrMats.barrel(), PbrMats.enig());
      const ringH = Math.max(0.35, cuH * 0.35);
      // 环略大于 drill，勿再叠大 MASK 膨胀
      const rRing = rOut + 1.0;
      mesh.addCylinder(v.position.x, v.position.y, zTop, zTop + ringH + maskH * 0.25,
        rRing, segs, PbrMats.enig(), true);
      mesh.addCylinder(v.position.x, v.position.y, zBot - ringH, zBot,
        rRing, Math.max(8, segs - 2), PbrMats.enig(), true);
    }

    // 封装：焊盘开窗 + STEP / 模型库 / 参数体
    for (let fi = 0; fi < doc.footprints.length; fi++) {
      if (mesh.tris.length > maxTris) break;
      const fp = doc.footprints[fi];
      const zBase = fp.layer === PcbLayerId.B_CU ? -1 : boardH + maskH + 0.35;
      const stepMesh = getBoundStepMesh(fp.defId);
      if (stepMesh !== null && stepMesh.tris.length > 0) {
        const yaw = (fp.rotation as number) * Math.PI / 180;
        let m = Mat4.rotationZ(yaw);
        if (fp.mirrored) {
          m = Mat4.scale(-1, 1, 1).mul(m);
        }
        m = Mat4.translation(fp.position.x, fp.position.y, zBase).mul(m);
        const mmToMil = Mat4.scale(39.3701, 39.3701, 39.3701);
        mesh.append(stepMesh.transform(m.mul(mmToMil)));
      } else {
        const used = Pcb3dModelLibrary.appendBody(mesh, fp.defId, fp.refDes, fp.value,
          fp.position.x, fp.position.y, zBase, fp.rotation as number, fp.mirrored === true, fp.pads);
        if (!used) {
          Pcb3dMeshBuilder.addParametricBody(mesh, fp.defId, fp.refDes, fp.value,
            fp.position.x, fp.position.y, zBase, fp.rotation as number, fp.mirrored === true);
        }
      }

      // 焊盘：阻焊开窗露 ENIG（略高于 mask）
      for (let pi = 0; pi < fp.pads.length; pi++) {
        if (mesh.tris.length > maxTris) break;
        const pad = fp.pads[pi];
        const wp = padWorldPosition(fp, pad);
        const padZ0 = fp.layer === PcbLayerId.B_CU ? -maskH - 0.2 : boardH + maskH * 0.15;
        const padZ1 = fp.layer === PcbLayerId.B_CU ? 0.05 : boardH + maskH + 0.85;
        if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
          const drill = pad.drill !== undefined ? pad.drill * 0.5 : Math.max(pad.size.x, pad.size.y) * 0.22;
          const outer = Math.min(Math.max(pad.size.x, pad.size.y) * 0.5,
            Math.max(drill * 1.85, 7)) + 0.8;
          const plated = pad.type !== PcbPadType.NPTH;
          const rIn = Math.max(0.8, Math.min(drill, outer * 0.55));
          const segs = 14;
          if (plated) {
            mesh.addTube(wp.x, wp.y, 0.05, boardH + cuH * 0.5, outer * 0.92, rIn, segs,
              PbrMats.barrel(), PbrMats.enig());
          } else {
            mesh.addCylinder(wp.x, wp.y, 0.05, boardH + cuH * 0.5, Math.max(rIn, 1), 10,
              PbrMats.fr4(), false);
          }
          mesh.addCylinder(wp.x, wp.y, padZ0, padZ1, outer, 12,
            plated ? PbrMats.enig() : PbrMats.fr4(), true);
        } else {
          const hx = pad.size.x * 0.5 + MASK_OPENING_EXPAND_MIL;
          const hy = pad.size.y * 0.5 + MASK_OPENING_EXPAND_MIL;
          const c00 = Pcb3dMeshBuilder.fpLocal(pad.pos.x - hx, pad.pos.y - hy, fp);
          const c10 = Pcb3dMeshBuilder.fpLocal(pad.pos.x + hx, pad.pos.y - hy, fp);
          const c11 = Pcb3dMeshBuilder.fpLocal(pad.pos.x + hx, pad.pos.y + hy, fp);
          const c01 = Pcb3dMeshBuilder.fpLocal(pad.pos.x - hx, pad.pos.y + hy, fp);
          const minPX = Math.min(c00.x, c10.x, c11.x, c01.x);
          const maxPX = Math.max(c00.x, c10.x, c11.x, c01.x);
          const minPY = Math.min(c00.y, c10.y, c11.y, c01.y);
          const maxPY = Math.max(c00.y, c10.y, c11.y, c01.y);
          mesh.addBox(new Vec3(minPX, minPY, padZ0),
            new Vec3(maxPX, maxPY, padZ1), PbrMats.enig());
        }
      }
    }
    return mesh;
  }

  /** 板框挤出：顶面 mask 色，侧面 FR4 */
  private static addBoardExtrusion(mesh: Mesh3d, outline: Point2D[], z0: number, z1: number,
    sideMat: PbrMaterial, topMat: PbrMaterial): void {
    if (outline.length < 3) return;
    // 顶/底扇形
    const c = Pcb3dMeshBuilder.polyCentroid(outline);
    const topC = new Vec3(c.x, c.y, z1);
    const botC = new Vec3(c.x, c.y, z0);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const ta = new Vec3(a.x, a.y, z1);
      const tb = new Vec3(b.x, b.y, z1);
      const ba = new Vec3(a.x, a.y, z0);
      const bb = new Vec3(b.x, b.y, z0);
      mesh.addTri(topC, ta, tb, topMat, new Vec3(0, 0, 1));
      mesh.addTri(botC, bb, ba, sideMat, new Vec3(0, 0, -1));
      mesh.addTri(ta, ba, bb, sideMat);
      mesh.addTri(ta, bb, tb, sideMat);
    }
  }

  private static addPolyPrism(mesh: Mesh3d, outline: Point2D[], z0: number, z1: number,
    mat: PbrMaterial): void {
    if (outline.length < 3) return;
    const c = Pcb3dMeshBuilder.polyCentroid(outline);
    const topC = new Vec3(c.x, c.y, z1);
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      mesh.addTri(topC, new Vec3(a.x, a.y, z1), new Vec3(b.x, b.y, z1), mat, new Vec3(0, 0, 1));
      mesh.addTri(new Vec3(a.x, a.y, z0), new Vec3(b.x, b.y, z0), new Vec3(b.x, b.y, z1), mat);
      mesh.addTri(new Vec3(a.x, a.y, z0), new Vec3(b.x, b.y, z1), new Vec3(a.x, a.y, z1), mat);
    }
  }

  private static polyCentroid(outline: Point2D[]): Point2D {
    let x = 0;
    let y = 0;
    for (let i = 0; i < outline.length; i++) {
      x += outline[i].x;
      y += outline[i].y;
    }
    return { x: x / outline.length, y: y / outline.length };
  }

  private static addSilkRibbons(mesh: Mesh3d, doc: PcbDocument, silkZ: number): void {
    // 轻量：仅板框一圈细白边，避免三角形爆炸
    const outline = doc.boardOutline.points;
    const silkH = 0.22;
    const halfW = 4;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 2) continue;
      const nx = -dy / len * halfW;
      const ny = dx / len * halfW;
      mesh.addBox(
        new Vec3(Math.min(a.x + nx, b.x + nx, a.x - nx, b.x - nx),
          Math.min(a.y + ny, b.y + ny, a.y - ny, b.y - ny), silkZ),
        new Vec3(Math.max(a.x + nx, b.x + nx, a.x - nx, b.x - nx),
          Math.max(a.y + ny, b.y + ny, a.y - ny, b.y - ny), silkZ + silkH),
        PbrMats.silk()
      );
    }
  }

  private static fpLocal(lx: number, ly: number, fp: PcbFootprintInst): Point2D {
    let x = lx;
    let y = ly;
    if (fp.mirrored) x = -x;
    if (fp.rotation === 90) {
      const t = x; x = -y; y = t;
    } else if (fp.rotation === 180) {
      x = -x; y = -y;
    } else if (fp.rotation === 270) {
      const t = x; x = y; y = -t;
    }
    return { x: fp.position.x + x, y: fp.position.y + y };
  }

  private static addTrackBox(mesh: Mesh3d, x0: number, y0: number, x1: number, y1: number,
    halfW: number, z0: number, z1: number, mat: PbrMaterial): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.1) return;
    const nx = -dy / len * halfW;
    const ny = dx / len * halfW;
    const a = new Vec3(x0 + nx, y0 + ny, z1);
    const b = new Vec3(x1 + nx, y1 + ny, z1);
    const c = new Vec3(x1 - nx, y1 - ny, z1);
    const d = new Vec3(x0 - nx, y0 - ny, z1);
    const a0 = new Vec3(x0 + nx, y0 + ny, z0);
    const b0 = new Vec3(x1 + nx, y1 + ny, z0);
    const c0 = new Vec3(x1 - nx, y1 - ny, z0);
    const d0 = new Vec3(x0 - nx, y0 - ny, z0);
    mesh.addTri(a, b, c, mat, new Vec3(0, 0, 1));
    mesh.addTri(a, c, d, mat, new Vec3(0, 0, 1));
    mesh.addTri(a0, d0, c0, mat, new Vec3(0, 0, -1));
    mesh.addTri(a0, c0, b0, mat, new Vec3(0, 0, -1));
    // 端帽用 6 段圆柱（兼顾圆角与性能）
    mesh.addCylinder(x0, y0, z0, z1, halfW, 6, mat, true);
    mesh.addCylinder(x1, y1, z0, z1, halfW, 6, mat, true);
    mesh.addTri(a, a0, b0, mat);
    mesh.addTri(a, b0, b, mat);
    mesh.addTri(d, c, c0, mat);
    mesh.addTri(d, c0, d0, mat);
  }

  private static addParametricBody(mesh: Mesh3d, defId: string, refDes: string, value: string,
    x: number, y: number, zBase: number, rotDeg: number, mirrored: boolean): void {
    const yaw = rotDeg * Math.PI / 180;
    const local = (lx: number, ly: number, lz: number): Vec3 => {
      let px = mirrored ? -lx : lx;
      let py = ly;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      return new Vec3(x + px * c - py * s, y + px * s + py * c, zBase + lz);
    };
    mesh.addBox(local(-12, -7, 0), local(12, 7, 9), PbrMats.plastic());
  }
}
