import { PcbLayerId, PcbPadType, isCopperLayer, copperLayersFromStack, padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { Mesh3d, Vec3, Mat4, PbrMats } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMath";
import type { PbrMaterial } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMath";
import { getBoundStepMesh } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PcbStepImporter";
import { copperWorldZ, boardThicknessWorld } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
export class Pcb3dMeshBuilder {
    static build(doc: PcbDocument, maxTris: number): Mesh3d {
        const mesh = new Mesh3d();
        mesh.name = doc.name;
        const outline = doc.boardOutline.points;
        if (outline.length < 3)
            return mesh;
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
        const cuH = 1.4;
        const copperOrder = copperLayersFromStack(doc.layerStack);
        // 基板盒：略透明感由光栅材质决定；铜箔放在盒外（底面下方 / 顶面上方），避免埋进实体看不见
        mesh.addBox(new Vec3(minX, minY, 0), new Vec3(maxX, maxY, boardH), PbrMats.fr4());
        // 顶面阻焊薄层
        mesh.addBox(new Vec3(minX, minY, boardH), new Vec3(maxX, maxY, boardH + 0.8), PbrMats.mask());
        // 走线：挤出条带；F.Cu 在板顶之上，B.Cu 在板底之下，内层按堆叠高度
        for (let i = 0; i < doc.tracks.length; i++) {
            if (mesh.tris.length > maxTris)
                break;
            const t = doc.tracks[i];
            if (!isCopperLayer(t.layer))
                continue;
            let z0 = copperWorldZ(t.layer, boardH, copperOrder, false, 0);
            if (t.layer === PcbLayerId.F_CU) {
                z0 = boardH + 0.8;
            }
            else if (t.layer === PcbLayerId.B_CU) {
                z0 = -cuH - 0.2;
            }
            const z1 = z0 + cuH;
            Pcb3dMeshBuilder.addTrackBox(mesh, t.start.x, t.start.y, t.end.x, t.end.y, t.width * 0.5, z0, z1, PbrMats.copper());
        }
        // 底层铺铜（zone）简化为薄板，否则过孔后 GND 在 PBR 中不可见
        for (let zi = 0; zi < doc.zones.length; zi++) {
            if (mesh.tris.length > maxTris)
                break;
            const zn = doc.zones[zi];
            if (!isCopperLayer(zn.layer) || zn.outline.length < 3)
                continue;
            let xMin = zn.outline[0].x;
            let xMax = zn.outline[0].x;
            let yMin = zn.outline[0].y;
            let yMax = zn.outline[0].y;
            for (let pi = 1; pi < zn.outline.length; pi++) {
                const p = zn.outline[pi];
                xMin = Math.min(xMin, p.x);
                xMax = Math.max(xMax, p.x);
                yMin = Math.min(yMin, p.y);
                yMax = Math.max(yMax, p.y);
            }
            let z0 = copperWorldZ(zn.layer, boardH, copperOrder, false, 0);
            if (zn.layer === PcbLayerId.B_CU)
                z0 = -cuH * 0.5;
            if (zn.layer === PcbLayerId.F_CU)
                z0 = boardH + 0.5;
            mesh.addBox(new Vec3(xMin, yMin, z0), new Vec3(xMax, yMax, z0 + cuH * 0.6), PbrMats.copper());
        }
        // 过孔：贯穿板厚，底环在 B.Cu 高度可见
        for (let i = 0; i < doc.vias.length; i++) {
            if (mesh.tris.length > maxTris)
                break;
            const v = doc.vias[i];
            const rOut = v.diameter * 0.5;
            const rIn = Math.max(2, v.drill * 0.5);
            mesh.addCylinder(v.position.x, v.position.y, -cuH, boardH + cuH, rIn + 0.8, 10, PbrMats.barrel(), false);
            mesh.addCylinder(v.position.x, v.position.y, boardH + 0.5, boardH + cuH + 0.2, rOut, 12, PbrMats.enig(), true);
            mesh.addCylinder(v.position.x, v.position.y, -cuH - 0.2, 0.2, rOut, 12, PbrMats.copper(), true);
        }
        for (let fi = 0; fi < doc.footprints.length; fi++) {
            if (mesh.tris.length > maxTris)
                break;
            const fp = doc.footprints[fi];
            const zBase = fp.layer === PcbLayerId.B_CU ? -1 : boardH + 1;
            const stepMesh = getBoundStepMesh(fp.defId);
            if (stepMesh !== null && stepMesh.tris.length > 0) {
                const yaw = (fp.rotation as number) * Math.PI / 180;
                let m = Mat4.rotationZ(yaw);
                if (fp.mirrored) {
                    m = Mat4.scale(-1, 1, 1).mul(m);
                }
                m = Mat4.translation(fp.position.x, fp.position.y, zBase).mul(m);
                // STEP 通常为 mm：mil 板坐标需 mm→mil
                const mmToMil = Mat4.scale(39.3701, 39.3701, 39.3701);
                mesh.append(stepMesh.transform(m.mul(mmToMil)));
                continue;
            }
            // 参数化兜底：焊盘经封装旋转/镜像
            for (let pi = 0; pi < fp.pads.length; pi++) {
                const pad = fp.pads[pi];
                const wp = padWorldPosition(fp, pad);
                if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
                    const outer = Math.max(pad.size.x, pad.size.y) * 0.5;
                    const drill = pad.drill !== undefined ? pad.drill * 0.5 : outer * 0.4;
                    const plated = pad.type !== PcbPadType.NPTH;
                    mesh.addCylinder(wp.x, wp.y, 0, boardH + cuH, Math.max(drill, 1), 8, plated ? PbrMats.barrel() : PbrMats.fr4(), false);
                    mesh.addCylinder(wp.x, wp.y, zBase, zBase + cuH, outer, 10, plated ? PbrMats.enig() : PbrMats.fr4(), true);
                }
                else {
                    const hx = pad.size.x * 0.5;
                    const hy = pad.size.y * 0.5;
                    const c00 = Pcb3dMeshBuilder.fpLocal(pad.pos.x - hx, pad.pos.y - hy, fp);
                    const c10 = Pcb3dMeshBuilder.fpLocal(pad.pos.x + hx, pad.pos.y - hy, fp);
                    const c11 = Pcb3dMeshBuilder.fpLocal(pad.pos.x + hx, pad.pos.y + hy, fp);
                    const c01 = Pcb3dMeshBuilder.fpLocal(pad.pos.x - hx, pad.pos.y + hy, fp);
                    const minPX = Math.min(c00.x, c10.x, c11.x, c01.x);
                    const maxPX = Math.max(c00.x, c10.x, c11.x, c01.x);
                    const minPY = Math.min(c00.y, c10.y, c11.y, c01.y);
                    const maxPY = Math.max(c00.y, c10.y, c11.y, c01.y);
                    mesh.addBox(new Vec3(minPX, minPY, zBase), new Vec3(maxPX, maxPY, zBase + cuH), PbrMats.enig());
                }
            }
            Pcb3dMeshBuilder.addParametricBody(mesh, fp.defId, fp.refDes, fp.value, fp.position.x, fp.position.y, zBase, fp.rotation as number, fp.mirrored === true);
        }
        return mesh;
    }
    private static fpLocal(lx: number, ly: number, fp: PcbFootprintInst): Point2D {
        let x = lx;
        let y = ly;
        if (fp.mirrored)
            x = -x;
        if (fp.rotation === 90) {
            const t = x;
            x = -y;
            y = t;
        }
        else if (fp.rotation === 180) {
            x = -x;
            y = -y;
        }
        else if (fp.rotation === 270) {
            const t = x;
            x = y;
            y = -t;
        }
        return { x: fp.position.x + x, y: fp.position.y + y };
    }
    private static addTrackBox(mesh: Mesh3d, x0: number, y0: number, x1: number, y1: number, halfW: number, z0: number, z1: number, mat: PbrMaterial): void {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.1)
            return;
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
        mesh.addTri(a, a0, b0, mat);
        mesh.addTri(a, b0, b, mat);
        mesh.addTri(d, c, c0, mat);
        mesh.addTri(d, c0, d0, mat);
    }
    private static addParametricBody(mesh: Mesh3d, defId: string, refDes: string, value: string, x: number, y: number, zBase: number, rotDeg: number, mirrored: boolean): void {
        const yaw = rotDeg * Math.PI / 180;
        const local = (lx: number, ly: number, lz: number): Vec3 => {
            let px = mirrored ? -lx : lx;
            let py = ly;
            const c = Math.cos(yaw);
            const s = Math.sin(yaw);
            return new Vec3(x + px * c - py * s, y + px * s + py * c, zBase + lz);
        };
        if (refDes.startsWith('H') || defId === 'FP_MOUNT')
            return;
        if (defId.indexOf('PINHDR') >= 0 || refDes.startsWith('J')) {
            mesh.addBox(local(-12, -30, 0), local(12, 30, 10), PbrMats.plastic());
            return;
        }
        if (defId.indexOf('TO220') >= 0) {
            mesh.addBox(local(-32, -22, 0), local(32, 24, 36), PbrMats.plastic());
            mesh.addBox(local(-28, -38, 36), local(28, -20, 50), PbrMats.pin());
            return;
        }
        if (defId.indexOf('SOIC') >= 0 || defId.indexOf('DIP') >= 0) {
            mesh.addBox(local(-40, -28, 0), local(40, 28, 22), PbrMats.plastic());
            return;
        }
        const vu = (value ?? '').toUpperCase();
        if (refDes.startsWith('C') && (vu.indexOf('UF') >= 0 || defId.indexOf('RADIAL') >= 0)) {
            const tmp = new Mesh3d();
            tmp.addCylinder(0, 0, 0, 48, 16, 12, { albedo: new Vec3(0.05, 0.12, 0.35), metallic: 0, roughness: 0.45 }, true);
            let m = Mat4.rotationZ(yaw);
            if (mirrored)
                m = Mat4.scale(-1, 1, 1).mul(m);
            m = Mat4.translation(x, y, zBase).mul(m);
            mesh.append(tmp.transform(m));
            return;
        }
        if (refDes.startsWith('C')) {
            mesh.addBox(local(-10, -7, 0), local(10, 7, 10), PbrMats.ceramic());
            return;
        }
        mesh.addBox(local(-10, -6, 0), local(10, 6, 8), PbrMats.plastic());
    }
}
