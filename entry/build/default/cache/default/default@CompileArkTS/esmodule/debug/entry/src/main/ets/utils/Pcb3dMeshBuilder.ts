import { PcbLayerId, PcbPadType, isCopperLayer, copperLayersFromStack, padWorldPosition } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import type { PcbDocument, PcbFootprintInst, Point2D } from "@bundle:com.elecdraw.aischsim/entry@common/Index";
import { Mesh3d, Vec3, Mat4, PbrMats } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMath";
import type { PbrMaterial } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dMath";
import { getBoundStepMesh } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/PcbStepImporter";
import { copperWorldZ, boardThicknessWorld } from "@bundle:com.elecdraw.aischsim/entry/ets/utils/Pcb3dSceneUtil";
export class Pcb3dMeshBuilder {
    /** 三角形预算提升至 60k */
    private static readonly MAX_TRIS = 60000;
    static build(doc: PcbDocument, maxTris: number = Pcb3dMeshBuilder.MAX_TRIS): Mesh3d {
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
        // 基板盒
        mesh.addBox(new Vec3(minX, minY, 0), new Vec3(maxX, maxY, boardH), PbrMats.fr4());
        // 顶面阻焊薄层
        mesh.addBox(new Vec3(minX, minY, boardH), new Vec3(maxX, maxY, boardH + 0.8), PbrMats.mask());
        // 丝印板框（薄四边带，白色，略高于阻焊）
        const silkZ = boardH + 0.9;
        const silkH = 0.25;
        const silkOffset = 15;
        for (let i = 0; i < outline.length; i++) {
            const a = outline[i];
            const b = outline[(i + 1) % outline.length];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 2)
                continue;
            const nx = -dy / len * silkOffset;
            const ny = dx / len * silkOffset;
            // 丝印线段：窄盒
            mesh.addBox(new Vec3(a.x + nx, a.y + ny, silkZ), new Vec3(b.x + nx, b.y + ny, silkZ + silkH), PbrMats.silk());
        }
        // 走线：挤出条带（Z 取层栈铜箔中心）
        for (let i = 0; i < doc.tracks.length; i++) {
            if (mesh.tris.length > maxTris)
                break;
            const t = doc.tracks[i];
            if (!isCopperLayer(t.layer))
                continue;
            const zMid = copperWorldZ(t.layer, boardH, copperOrder, false, 0, doc.layerStack);
            const z0 = zMid - cuH * 0.5;
            const z1 = zMid + cuH * 0.5;
            Pcb3dMeshBuilder.addTrackBox(mesh, t.start.x, t.start.y, t.end.x, t.end.y, t.width * 0.5, z0, z1, PbrMats.copper());
        }
        // 铺铜 zone
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
            const zMid = copperWorldZ(zn.layer, boardH, copperOrder, false, 0, doc.layerStack);
            const zh = cuH * 0.6;
            mesh.addBox(new Vec3(xMin, yMin, zMid - zh * 0.5), new Vec3(xMax, yMax, zMid + zh * 0.5), PbrMats.copper());
        }
        // 过孔：提高圆柱段数（16 段外筒 + 12 段内筒）
        for (let i = 0; i < doc.vias.length; i++) {
            if (mesh.tris.length > maxTris)
                break;
            const v = doc.vias[i];
            const rOut = v.diameter * 0.5;
            const rIn = Math.max(2, v.drill * 0.5);
            mesh.addCylinder(v.position.x, v.position.y, -cuH, boardH + cuH, rIn + 0.8, 16, PbrMats.barrel(), false);
            mesh.addCylinder(v.position.x, v.position.y, boardH + 0.5, boardH + cuH + 0.2, rOut, 16, PbrMats.enig(), true);
            mesh.addCylinder(v.position.x, v.position.y, -cuH - 0.2, 0.2, rOut, 16, PbrMats.copper(), true);
        }
        // 封装
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
                const mmToMil = Mat4.scale(39.3701, 39.3701, 39.3701);
                mesh.append(stepMesh.transform(m.mul(mmToMil)));
                continue;
            }
            // 参数化焊盘
            for (let pi = 0; pi < fp.pads.length; pi++) {
                const pad = fp.pads[pi];
                const wp = padWorldPosition(fp, pad);
                if (pad.type === PcbPadType.TH || pad.type === PcbPadType.NPTH) {
                    const outer = Math.max(pad.size.x, pad.size.y) * 0.5;
                    const drill = pad.drill !== undefined ? pad.drill * 0.5 : outer * 0.4;
                    const plated = pad.type !== PcbPadType.NPTH;
                    mesh.addCylinder(wp.x, wp.y, 0, boardH + cuH, Math.max(drill, 1), 14, plated ? PbrMats.barrel() : PbrMats.fr4(), false);
                    mesh.addCylinder(wp.x, wp.y, zBase, zBase + cuH, outer, 14, plated ? PbrMats.enig() : PbrMats.fr4(), true);
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
        const cylAt = (cx: number, cy: number, z0: number, z1: number, r: number, seg: number, mat: PbrMaterial, capped: boolean): void => {
            const tmp = new Mesh3d();
            tmp.addCylinder(0, 0, z0, z1, r, seg, mat, capped);
            let m = Mat4.rotationZ(yaw);
            if (mirrored)
                m = Mat4.scale(-1, 1, 1).mul(m);
            m = Mat4.translation(x + cx, y + cy, zBase).mul(m);
            mesh.append(tmp.transform(m));
        };
        if (refDes.startsWith('H') || defId === 'FP_MOUNT')
            return;
        // --- 连接器 / 排针 ---
        if (defId.indexOf('PINHDR') >= 0 || refDes.startsWith('J')) {
            mesh.addBox(local(-14, -32, 0), local(14, 32, 12), PbrMats.plastic());
            mesh.addBox(local(-9, -30, 12), local(-5, -26, 12.3), PbrMats.silk());
            return;
        }
        // --- TO-220 ---
        if (defId.indexOf('TO220') >= 0) {
            mesh.addBox(local(-34, -22, 0), local(34, 24, 38), PbrMats.plastic());
            mesh.addBox(local(-30, -40, 38), local(30, -19, 52), PbrMats.pin());
            const tmpHole = new Mesh3d();
            tmpHole.addCylinder(0, -32, 49, 52, 5, 10, { albedo: new Vec3(0.06, 0.06, 0.08), metallic: 0.95, roughness: 0.28 }, false);
            mesh.append(tmpHole.transform(Mat4.translation(x, y, zBase)));
            return;
        }
        // --- DIP / SOIC / QFP / TSSOP IC ---
        if (defId.indexOf('DIP') >= 0 || defId.indexOf('SOIC') >= 0 ||
            defId.indexOf('QFP') >= 0 || defId.indexOf('TSSOP') >= 0 || defId.indexOf('SOP') >= 0) {
            let bw = 42;
            let bh = 30;
            let bz = 24;
            if (defId.indexOf('DIP40') >= 0) {
                bw = 56;
                bh = 50;
                bz = 32;
            }
            else if (defId.indexOf('DIP28') >= 0) {
                bw = 52;
                bh = 44;
                bz = 26;
            }
            else if (defId.indexOf('DIP16') >= 0) {
                bw = 44;
                bh = 36;
                bz = 24;
            }
            else if (defId.indexOf('DIP14') >= 0) {
                bw = 42;
                bh = 34;
                bz = 22;
            }
            else if (defId.indexOf('QFP100') >= 0) {
                bw = 60;
                bh = 32;
                bz = 8;
            }
            else if (defId.indexOf('QFP64') >= 0) {
                bw = 50;
                bh = 26;
                bz = 7;
            }
            else if (defId.indexOf('QFP48') >= 0) {
                bw = 44;
                bh = 22;
                bz = 6;
            }
            else if (defId.indexOf('QFP44') >= 0) {
                bw = 40;
                bh = 20;
                bz = 6;
            }
            else if (defId.indexOf('TSSOP') >= 0) {
                bw = 32;
                bh = 18;
                bz = 5;
            }
            mesh.addBox(local(-bw, -bh, 0), local(bw, bh, bz), PbrMats.plastic());
            // pin-1 凹点
            mesh.addCylinder(x + (-(bw - 4) * Math.cos(yaw) - (-(bh - 2)) * Math.sin(yaw)), y + (-(bw - 4) * Math.sin(yaw) + (-(bh - 2)) * Math.cos(yaw)), zBase + bz - 0.5, zBase + bz + 1, 3.5, 8, { albedo: new Vec3(0.08, 0.08, 0.1), metallic: 0, roughness: 0.9 }, true);
            return;
        }
        // --- TO-92 三极管 / 传感器 ---
        if (defId.indexOf('TO92') >= 0 || refDes.startsWith('Q') || defId.indexOf('SOT') >= 0) {
            cylAt(0, 0, 0, 16, 14, 14, PbrMats.plastic(), true);
            // 平切面（TO-92 半圆柱特征）
            if (defId.indexOf('SOT') < 0) {
                mesh.addBox(local(-16, 8, 2), local(16, 16, 14), { albedo: new Vec3(0.08, 0.08, 0.1), metallic: 0, roughness: 0.55 });
            }
            return;
        }
        // --- LED 5mm ---
        if (defId.indexOf('LED') >= 0 || refDes.startsWith('D') && defId.indexOf('FP_LED') >= 0) {
            cylAt(0, 0, 0, 10, 16, 16, PbrMats.plastic(), true);
            // 半球顶
            cylAt(0, 0, 8, 16, 16, 12, { albedo: new Vec3(0.08, 0.08, 0.12), metallic: 0, roughness: 0.40 }, true);
            return;
        }
        // --- 轴向二极管 ---
        if (defId.indexOf('AXIAL_DIODE') >= 0 || defId.indexOf('AXIAL') >= 0 &&
            (refDes.startsWith('D') || refDes.startsWith('Z'))) {
            cylAt(0, 0, 0, 14, 12, 14, { albedo: new Vec3(0.55, 0.25, 0.12), metallic: 0.02, roughness: 0.30 }, true);
            // 阴极黑环
            mesh.addBox(local(-10, -13, 0), local(-3, 13, 14), { albedo: new Vec3(0.05, 0.05, 0.06), metallic: 0, roughness: 0.70 });
            return;
        }
        const vu = (value ?? '').toUpperCase();
        // --- 电解电容 ---
        if ((refDes.startsWith('C') && (vu.indexOf('UF') >= 0 || defId.indexOf('RADIAL') >= 0)) ||
            defId.indexOf('RADIAL_CAP') >= 0) {
            const tmp = new Mesh3d();
            tmp.addCylinder(0, 0, 0, 52, 18, 16, { albedo: new Vec3(0.07, 0.15, 0.45), metallic: 0.05, roughness: 0.40 }, true);
            let m = Mat4.rotationZ(yaw);
            if (mirrored)
                m = Mat4.scale(-1, 1, 1).mul(m);
            m = Mat4.translation(x, y, zBase).mul(m);
            mesh.append(tmp.transform(m));
            // 负极标记环
            const negRing = new Mesh3d();
            negRing.addCylinder(0, 0, 10, 42, 17.5, 16, { albedo: new Vec3(0.65, 0.65, 0.68), metallic: 0, roughness: 0.55 }, false);
            mesh.append(negRing.transform(Mat4.translation(x, y, 0)));
            return;
        }
        // --- 陶瓷电容 ---
        if (refDes.startsWith('C')) {
            mesh.addBox(local(-12, -8, 0), local(12, 8, 11), PbrMats.ceramic());
            return;
        }
        // --- 电阻 / 保险丝 ---
        if (refDes.startsWith('R') || defId.indexOf('FUSE') >= 0) {
            mesh.addBox(local(-11, -6, 0), local(11, 6, 8), PbrMats.plastic());
            const bandColors: Vec3[] = [
                new Vec3(0.7, 0.15, 0.1),
                new Vec3(0.1, 0.55, 0.2),
                new Vec3(0.7, 0.45, 0.1)
            ];
            for (let b = 0; b < 3; b++) {
                const bx = -5 + b * 5;
                mesh.addBox(local(bx - 1.2, -5.5, 8), local(bx + 1.2, 5.5, 8.2), { albedo: bandColors[b], metallic: 0, roughness: 0.6 });
            }
            return;
        }
        // --- 电位器 ---
        if (defId.indexOf('POT') >= 0 || refDes.startsWith('VR') || refDes.startsWith('P')) {
            cylAt(0, 0, 0, 18, 20, 16, { albedo: new Vec3(0.12, 0.25, 0.55), metallic: 0.0, roughness: 0.50 }, true);
            // 调节轴
            cylAt(0, 0, 18, 28, 6, 10, PbrMats.pin(), true);
            return;
        }
        // --- 晶振 ---
        if (defId.indexOf('XTAL') >= 0 || defId.indexOf('FP_XTAL') >= 0) {
            mesh.addBox(local(-24, -12, 0), local(24, 12, 16), { albedo: new Vec3(0.8, 0.78, 0.72), metallic: 0.9, roughness: 0.22 });
            // 顶面标记
            mesh.addBox(local(-8, -3, 16), local(8, 3, 16.3), PbrMats.silk());
            return;
        }
        // --- 微动开关 ---
        if (defId.indexOf('SW_PUSH') >= 0 || defId.indexOf('SW_') >= 0) {
            mesh.addBox(local(-18, -18, 0), local(18, 18, 14), PbrMats.plastic());
            // 按钮帽
            cylAt(0, 0, 14, 20, 10, 12, PbrMats.pin(), true);
            return;
        }
        // --- 继电器 ---
        if (defId.indexOf('RELAY') >= 0) {
            mesh.addBox(local(-36, -24, 0), local(36, 24, 28), { albedo: new Vec3(0.1, 0.18, 0.48), metallic: 0.0, roughness: 0.45 });
            // 品牌标识区域
            mesh.addBox(local(-14, -8, 28), local(14, 8, 28.3), PbrMats.silk());
            return;
        }
        // --- 蜂鸣器 ---
        if (defId.indexOf('BUZZER') >= 0) {
            cylAt(0, 0, 0, 20, 24, 16, PbrMats.plastic(), true);
            // 顶部出声孔
            mesh.addCylinder(x, y, zBase + 20, zBase + 20.3, 8, 12, { albedo: new Vec3(0.04, 0.04, 0.05), metallic: 0, roughness: 0.9 }, true);
            return;
        }
        // --- LCD1602 ---
        if (defId.indexOf('LCD') >= 0) {
            mesh.addBox(local(-70, -24, 0), local(70, 24, 8), { albedo: new Vec3(0.06, 0.18, 0.06), metallic: 0.0, roughness: 0.55 });
            // 屏幕暗区
            mesh.addBox(local(-58, -14, 8), local(58, 14, 8.3), { albedo: new Vec3(0.05, 0.08, 0.05), metallic: 0, roughness: 0.35 });
            return;
        }
        // --- OLED ---
        if (defId.indexOf('OLED') >= 0) {
            mesh.addBox(local(-32, -18, 0), local(32, 18, 4), { albedo: new Vec3(0.04, 0.04, 0.06), metallic: 0.0, roughness: 0.60 });
            // 蓝色屏幕区
            mesh.addBox(local(-24, -10, 4), local(24, 10, 4.2), { albedo: new Vec3(0.02, 0.04, 0.18), metallic: 0, roughness: 0.25 });
            return;
        }
        // --- LDR 光敏电阻 ---
        if (defId.indexOf('LDR') >= 0) {
            mesh.addBox(local(-14, -10, 0), local(14, 10, 8), PbrMats.ceramic());
            // 感光面
            mesh.addBox(local(-10, -6, 8), local(10, 6, 8.3), { albedo: new Vec3(0.65, 0.55, 0.35), metallic: 0, roughness: 0.55 });
            return;
        }
        // --- 仪器探针 ---
        if (defId.indexOf('INSTRUMENT') >= 0) {
            cylAt(0, 0, 0, 22, 16, 14, { albedo: new Vec3(0.30, 0.32, 0.35), metallic: 0.3, roughness: 0.38 }, true);
            // 色环
            cylAt(0, 0, 8, 10, 15, 14, { albedo: new Vec3(0.75, 0.15, 0.12), metallic: 0, roughness: 0.55 }, false);
            // 金属探头
            cylAt(0, 0, 22, 30, 5, 10, PbrMats.pin(), true);
            return;
        }
        // --- 电源/信号端子 ---
        if (defId.indexOf('TERMINAL') >= 0) {
            mesh.addBox(local(-16, -10, 0), local(16, 10, 18), PbrMats.plastic());
            return;
        }
        // --- 轴向电感 ---
        if (defId.indexOf('AXIAL_IND') >= 0 || (refDes.startsWith('L') && defId.indexOf('AXIAL') >= 0)) {
            cylAt(0, 0, 0, 15, 13, 14, { albedo: new Vec3(0.25, 0.40, 0.22), metallic: 0.0, roughness: 0.55 }, true);
            return;
        }
        // --- 默认塑封 ---
        mesh.addBox(local(-12, -7, 0), local(12, 7, 9), PbrMats.plastic());
    }
}
