/**
 * 内置 3D 封装模型库（嘉立创风格参数化体）
 * 覆盖 PcbFootprintLibrary 全部 BUILTIN_DEFS（约 44 个 FP_*）；
 * 80+ 器件经 resolveFootprintId 映射到这些封装。
 * 有真实 STEP 绑定时由 MeshBuilder 优先使用 STEP。
 */
import { Mesh3d, Vec3, Mat4, PbrMats, PbrMaterial } from './Pcb3dMath';
import { Point2D } from 'common';

/** 阻焊开窗相对焊盘的外扩 (mil) — 接近嘉立创默认 */
export const MASK_OPENING_EXPAND_MIL = 3.5;

/** 3D 引脚绘制只需焊盘局部坐标（与 PcbPad.pos 兼容） */
interface ModelLeadPad {
  pos: Point2D;
}

export class Pcb3dModelLibrary {
  /** 显式构造 PbrMaterial，避免 arkts-no-untyped-obj-literals */
  private static mat(r: number, g: number, b: number, metallic: number, roughness: number): PbrMaterial {
    const m: PbrMaterial = {
      albedo: new Vec3(r, g, b),
      metallic: metallic,
      roughness: roughness
    };
    return m;
  }

  /** 按真实焊盘位置画引脚（原理图脚数权威 → pads 已同步） */
  private static appendLeadsFromPads(
    lead: (lx: number, ly: number, lz0: number, lz1: number, w: number, t: number) => void,
    pads: ModelLeadPad[],
    tht: boolean
  ): void {
    for (let i = 0; i < pads.length; i++) {
      const px = pads[i].pos.x;
      const py = pads[i].pos.y;
      if (tht) {
        lead(px, py, 0 - 10, 6, 2.4, 2.4);
      } else {
        const ax = Math.abs(px);
        const ay = Math.abs(py);
        if (ax >= ay) {
          const sx = px >= 0 ? 1 : -1;
          lead(px + sx * 6, py, 0, 3.2, 6, 1.8);
          lead(px + sx * 1, py, 2.2, 6, 10, 1.6);
        } else {
          const sy = py >= 0 ? 1 : -1;
          lead(px, py + sy * 6, 0, 3.2, 1.8, 6);
          lead(px, py + sy * 1, 2.2, 6, 1.6, 10);
        }
      }
    }
  }

  /**
   * 按 defId / refDes 生成高细节参数体。
   * @returns 是否已写入网格（true 则调用方勿再画默认体）
   */
  static appendBody(mesh: Mesh3d, defId: string, refDes: string, value: string,
    x: number, y: number, zBase: number, rotDeg: number, mirrored: boolean,
    pads?: ModelLeadPad[]): boolean {
    const id = (defId ?? '').toUpperCase();
    const ref = (refDes ?? '').toUpperCase();
    const vu = (value ?? '').toUpperCase();

    if (ref.startsWith('H') || id === 'FP_MOUNT') {
      return true;
    }

    const yaw: number = rotDeg * Math.PI / 180;
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
      mat: PbrMaterial): void => {
      const tmp = new Mesh3d();
      tmp.addBox(new Vec3(x0, y0, z0), new Vec3(x1, y1, z1), mat);
      mesh.append(tmp.transform(Pcb3dModelLibrary.xf(x, y, zBase, yaw, mirrored)));
    };
    const cyl = (cx: number, cy: number, z0: number, z1: number, r: number,
      seg: number, mat: PbrMaterial, capped: boolean): void => {
      const tmp = new Mesh3d();
      tmp.addCylinder(cx, cy, z0, z1, r, seg, mat, capped);
      mesh.append(tmp.transform(Pcb3dModelLibrary.xf(x, y, zBase, yaw, mirrored)));
    };
    const lead = (lx: number, ly: number, lz0: number, lz1: number, w: number, t: number): void => {
      box(lx - w * 0.5, ly - t * 0.5, lz0, lx + w * 0.5, ly + t * 0.5, lz1, PbrMats.pin());
    };

    // —— SMD 片式 0402 / 0603 / 0805 / 1206 ——
    if (id.indexOf('0402') >= 0 || id.indexOf('0603') >= 0 ||
      id.indexOf('0805') >= 0 || id.indexOf('1206') >= 0) {
      let bw: number = 22;
      let bh: number = 12;
      let bz: number = 8;
      let endW: number = 5;
      if (id.indexOf('0402') >= 0) {
        bw = 16; bh = 8; bz = 5; endW = 3.5;
      } else if (id.indexOf('0603') >= 0) {
        bw = 22; bh = 12; bz = 7; endW = 4.5;
      } else if (id.indexOf('0805') >= 0) {
        bw = 28; bh = 16; bz = 9; endW = 6;
      } else {
        bw = 40; bh = 22; bz = 11; endW = 8;
      }
      let bodyMat: PbrMaterial = PbrMats.chipBody();
      if (ref.startsWith('C')) {
        bodyMat = PbrMats.ceramic();
      } else if (ref.startsWith('L')) {
        bodyMat = PbrMats.inductor();
      }
      // 本体略矮于电极，电极“包边”更像真实贴片
      box(0 - bw + endW, 0 - bh, 0.4, bw - endW, bh, bz, bodyMat);
      box(0 - bw + endW + 1.2, 0 - bh + 1.0, bz, bw - endW - 1.2, bh - 1.0, bz + 0.7,
        ref.startsWith('C') ? PbrMats.ceramic() : PbrMats.plasticTop());
      box(0 - bw, 0 - bh, 0, 0 - bw + endW + 0.8, bh, bz + 0.3, PbrMats.enig());
      box(bw - endW - 0.8, 0 - bh, 0, bw, bh, bz + 0.3, PbrMats.enig());
      return true;
    }

    // —— SOIC / SOP ——
    if (id.indexOf('SOIC') >= 0 || id.indexOf('SOP') >= 0) {
      let bw: number = 28;
      let bh: number = 18;
      const bz: number = 10;
      const isWide: boolean = id.indexOf('SOIC8W') >= 0 ||
        (id.indexOf('W') >= 0 && id.indexOf('SOIC') >= 0);
      if (isWide) {
        bw = 36;
        bh = 22;
      }
      box(0 - bw, 0 - bh, 1.2, bw, bh, bz - 0.8, PbrMats.plastic());
      box(0 - bw + 1.5, 0 - bh + 1.5, bz - 0.8, bw - 1.5, bh - 1.5, bz, PbrMats.plastic());
      box(0 - bw + 3, 0 - bh + 3, bz, bw - 3, bh - 3, bz + 0.85, PbrMats.plasticTop());
      cyl(0 - (bw - 6), 0 - (bh - 5), bz + 0.5, bz + 1.4, 2.8, 12,
        Pcb3dModelLibrary.mat(0.06, 0.06, 0.08, 0, 0.85), true);
      if (pads !== undefined && pads.length > 0) {
        Pcb3dModelLibrary.appendLeadsFromPads(lead, pads, false);
      } else {
        const pins: number = 4;
        for (let i = 0; i < pins; i++) {
          const py: number = 0 - bh + 6 + i * ((2 * bh - 12) / Math.max(pins - 1, 1));
          lead(0 - (bw + 8), py, 0, 3.5, 6, 2.2);
          lead(bw + 8, py, 0, 3.5, 6, 2.2);
          lead(0 - (bw + 2), py, 2.5, 6, 10, 1.8);
          lead(bw + 2, py, 2.5, 6, 10, 1.8);
        }
      }
      return true;
    }

    // —— QFP / LQFP / TSSOP ——
    if (id.indexOf('QFP') >= 0 || id.indexOf('TSSOP') >= 0 || id.indexOf('LQFP') >= 0) {
      let bw: number = 40;
      let bh: number = 40;
      let bz: number = 7;
      let pinsPerSide: number = 12;
      if (id.indexOf('100') >= 0) {
        bw = 55; bh = 55; bz = 8; pinsPerSide = 25;
      } else if (id.indexOf('64') >= 0) {
        bw = 48; bh = 48; bz = 7; pinsPerSide = 16;
      } else if (id.indexOf('48') >= 0) {
        bw = 42; bh = 42; bz = 7; pinsPerSide = 12;
      } else if (id.indexOf('44') >= 0) {
        bw = 40; bh = 40; bz = 7; pinsPerSide = 11;
      } else if (id.indexOf('TSSOP') >= 0) {
        bw = 28; bh = 18; bz = 5; pinsPerSide = 10;
      }
      box(0 - bw, 0 - bh, 1.2, bw, bh, bz, PbrMats.plastic());
      box(0 - bw + 3, 0 - bh + 3, bz, bw - 3, bh - 3, bz + 0.5, PbrMats.plasticTop());
      cyl(0 - (bw - 8), 0 - (bh - 8), bz + 0.3, bz + 1.0, 3.2, 10,
        Pcb3dModelLibrary.mat(0.05, 0.05, 0.07, 0, 0.9), true);
      // QFP_PADS_FROM_SCH
      if (pads !== undefined && pads.length > 0) {
        Pcb3dModelLibrary.appendLeadsFromPads(lead, pads, false);
        return true;
      }
      const span: number = 2 * Math.min(bw, bh) - 16;
      const isTssop: boolean = id.indexOf('TSSOP') >= 0;
      for (let i = 0; i < pinsPerSide; i++) {
        const t: number = pinsPerSide <= 1 ? 0.5 : i / (pinsPerSide - 1);
        const o: number = 0 - span * 0.5 + t * span;
        if (!isTssop) {
          lead(o, 0 - (bh + 7), 0, 2.8, 1.6, 5);
          lead(o, bh + 7, 0, 2.8, 1.6, 5);
          lead(0 - (bw + 7), o, 0, 2.8, 5, 1.6);
          lead(bw + 7, o, 0, 2.8, 5, 1.6);
        } else {
          lead(0 - (bw + 6), o * (bh / Math.max(bw, 1)), 0, 2.2, 5, 1.4);
          lead(bw + 6, o * (bh / Math.max(bw, 1)), 0, 2.2, 5, 1.4);
        }
      }
      return true;
    }

    // —— DIP ——
    if (id.indexOf('DIP') >= 0) {
      let pins: number = (pads !== undefined && pads.length > 0) ? pads.length : 8;
      if (id.indexOf('40') >= 0) {
        pins = 40;
      } else if (id.indexOf('28') >= 0) {
        pins = 28;
      } else if (id.indexOf('16') >= 0) {
        pins = 16;
      } else if (id.indexOf('14') >= 0) {
        pins = 14;
      }
      const rows: number = pins / 2;
      const bh: number = Math.max(28, (rows - 1) * 10 + 16);
      const bw: number = 32;
      const bz: number = 18;
      box(0 - bw, 0 - bh, 2, bw, bh, bz, PbrMats.plastic());
      box(0 - bw + 2, 0 - bh + 2, bz, bw - 2, bh - 2, bz + 0.8, PbrMats.plasticTop());
      box(0 - 6, 0 - bh, bz - 1, 6, 0 - bh + 4, bz + 1.2,
        Pcb3dModelLibrary.mat(0.08, 0.08, 0.1, 0, 0.7));
      if (pads !== undefined && pads.length > 0) {
        Pcb3dModelLibrary.appendLeadsFromPads(lead, pads, true);
      } else {
        for (let i = 0; i < rows; i++) {
          const py: number = 0 - bh + 10 + i * ((2 * bh - 20) / Math.max(rows - 1, 1));
          lead(0 - (bw + 2), py, 0 - 8, 6, 2.4, 2.4);
          lead(bw + 2, py, 0 - 8, 6, 2.4, 2.4);
        }
      }
      return true;
    }

    // —— SOT-23 ——
    if (id.indexOf('SOT23') >= 0 || id.indexOf('SOT-23') >= 0) {
      box(0 - 14, 0 - 10, 0.8, 14, 10, 8, PbrMats.plastic());
      lead(0 - 10, 0 - 14, 0, 2, 5, 2);
      lead(10, 0 - 14, 0, 2, 5, 2);
      lead(0, 14, 0, 2, 5, 2);
      return true;
    }

    // —— TO-220 ——
    if (id.indexOf('TO220') >= 0) {
      box(0 - 34, 0 - 18, 0, 34, 22, 36, PbrMats.plastic());
      box(0 - 28, 0 - 40, 34, 28, 0 - 18, 48, PbrMats.pin());
      cyl(0, 0 - 30, 46, 49, 5, 12,
        Pcb3dModelLibrary.mat(0.05, 0.05, 0.06, 0.9, 0.3), false);
      for (let i = 0 - 1; i <= 1; i++) {
        lead(i * 18, 28, 0 - 10, 8, 3, 2.5);
      }
      return true;
    }

    // —— TO-92 ——
    if (id.indexOf('TO92') >= 0) {
      cyl(0, 0, 0, 18, 14, 16, PbrMats.plastic(), true);
      box(0 - 16, 6, 2, 16, 16, 16, Pcb3dModelLibrary.mat(0.07, 0.07, 0.09, 0, 0.55));
      for (let i = 0 - 1; i <= 1; i++) {
        lead(i * 8, 18, 0 - 12, 4, 2, 2);
      }
      return true;
    }

    // —— LED 5mm ——
    if (id.indexOf('LED') >= 0 || id === 'FP_LED5') {
      cyl(0, 0, 0, 12, 15, 18, Pcb3dModelLibrary.mat(0.55, 0.08, 0.08, 0.05, 0.22), true);
      cyl(0, 0, 10, 20, 15, 14, Pcb3dModelLibrary.mat(0.75, 0.12, 0.1, 0.02, 0.18), true);
      lead(0 - 8, 0, 0 - 10, 2, 2, 2);
      lead(8, 0, 0 - 10, 2, 2, 2);
      return true;
    }

    // —— 径向电解 ——
    if (id.indexOf('RADIAL') >= 0 || (ref.startsWith('C') && (vu.indexOf('UF') >= 0 || vu.indexOf('µF') >= 0))) {
      cyl(0, 0, 0, 55, 20, 20, Pcb3dModelLibrary.mat(0.08, 0.18, 0.48, 0.08, 0.35), true);
      cyl(0, 0, 52, 56, 18, 16, Pcb3dModelLibrary.mat(0.55, 0.55, 0.58, 0.15, 0.45), true);
      box(0 - 22, 0 - 6, 8, 0 - 18, 6, 48, Pcb3dModelLibrary.mat(0.7, 0.7, 0.72, 0, 0.5));
      return true;
    }

    // —— 排针 ——
    if (id.indexOf('PINHDR') >= 0 || id.indexOf('HEADER') >= 0) {
      const n: number = Pcb3dModelLibrary.parseTrailingInt(id, 8);
      const pitch: number = 100;
      const span: number = (n - 1) * pitch * 0.5;
      box(0 - 12, 0 - span - 12, 0, 12, span + 12, 14, PbrMats.plastic());
      for (let i = 0; i < n; i++) {
        const py: number = 0 - span + i * pitch;
        cyl(0, py, 14, 42, 3.2, 8, PbrMats.pin(), true);
        cyl(0, py, 0 - 12, 4, 2.6, 8, PbrMats.pin(), true);
      }
      return true;
    }

    // —— 晶振 HC-49 ——
    if (id.indexOf('XTAL') >= 0 || id.indexOf('HC49') >= 0) {
      box(0 - 28, 0 - 12, 0, 28, 12, 18, Pcb3dModelLibrary.mat(0.82, 0.8, 0.74, 0.92, 0.2));
      box(0 - 10, 0 - 4, 18, 10, 4, 18.4, PbrMats.silk());
      return true;
    }

    // —— 按键 ——
    if (id.indexOf('SW_PUSH') >= 0 || id.indexOf('SW_') >= 0) {
      box(0 - 20, 0 - 20, 0, 20, 20, 12, PbrMats.plastic());
      cyl(0, 0, 12, 18, 9, 14, Pcb3dModelLibrary.mat(0.15, 0.15, 0.18, 0.1, 0.4), true);
      return true;
    }

    // —— 蜂鸣器 ——
    if (id.indexOf('BUZZER') >= 0) {
      cyl(0, 0, 0, 22, 26, 20, PbrMats.plastic(), true);
      cyl(0, 0, 20, 22.5, 10, 14, Pcb3dModelLibrary.mat(0.04, 0.04, 0.05, 0, 0.9), true);
      return true;
    }

    // —— 继电器 ——
    if (id.indexOf('RELAY') >= 0) {
      box(0 - 40, 0 - 26, 0, 40, 26, 30, Pcb3dModelLibrary.mat(0.12, 0.2, 0.5, 0, 0.42));
      box(0 - 16, 0 - 10, 30, 16, 10, 30.4, PbrMats.silk());
      return true;
    }

    // —— LCD / OLED ——
    if (id.indexOf('LCD') >= 0) {
      box(0 - 72, 0 - 26, 0, 72, 26, 8, Pcb3dModelLibrary.mat(0.08, 0.22, 0.1, 0, 0.5));
      box(0 - 60, 0 - 16, 8, 60, 16, 8.5, Pcb3dModelLibrary.mat(0.04, 0.1, 0.06, 0, 0.28));
      return true;
    }
    if (id.indexOf('OLED') >= 0) {
      box(0 - 34, 0 - 20, 0, 34, 20, 4, PbrMats.plastic());
      box(0 - 26, 0 - 12, 4, 26, 12, 4.3, Pcb3dModelLibrary.mat(0.02, 0.05, 0.2, 0, 0.22));
      return true;
    }

    // —— 电位器 ——
    if (id.indexOf('POT') >= 0) {
      cyl(0, 0, 0, 18, 22, 18, Pcb3dModelLibrary.mat(0.1, 0.22, 0.5, 0, 0.48), true);
      cyl(0, 0, 18, 30, 6, 12, PbrMats.pin(), true);
      return true;
    }

    // —— SIP-5（LM2596 等）——
    if (id.indexOf('SIP') >= 0) {
      box(0 - 210, 0 - 32, 0, 210, 32, 28, PbrMats.plastic());
      box(0 - 180, 0 - 20, 28, 180, 20, 28.5, PbrMats.plasticTop());
      cyl(40, 0, 28, 42, 18, 14, PbrMats.inductor(), true);
      for (let i = 0; i < 5; i++) {
        const px: number = 0 - 200 + i * 100;
        lead(px, 0, 0 - 14, 6, 3.2, 3.2);
      }
      return true;
    }

    // —— THT 两脚 ——
    if (id.indexOf('THT2') >= 0 || id === 'FP_THT2') {
      box(0 - 55, 0 - 18, 0, 55, 18, 16, Pcb3dModelLibrary.mat(0.12, 0.14, 0.18, 0.05, 0.5));
      box(0 - 20, 0 - 10, 16, 20, 10, 16.4, PbrMats.silk());
      lead(0 - 80, 0, 0 - 12, 4, 3, 3);
      lead(80, 0, 0 - 12, 4, 3, 3);
      return true;
    }

    // —— LDR ——
    if (id.indexOf('LDR') >= 0) {
      cyl(0, 0, 0, 10, 48, 20, PbrMats.ceramic(), true);
      cyl(0, 0, 9, 11.5, 42, 18, Pcb3dModelLibrary.mat(0.62, 0.48, 0.28, 0, 0.55), true);
      box(0 - 28, 0 - 4, 11, 28, 4, 11.4, Pcb3dModelLibrary.mat(0.08, 0.08, 0.1, 0.2, 0.4));
      lead(0 - 80, 0, 0 - 12, 4, 2.8, 2.8);
      lead(80, 0, 0 - 12, 4, 2.8, 2.8);
      return true;
    }

    // —— 仪器探针 ——
    if (id.indexOf('INSTRUMENT') >= 0) {
      box(0 - 150, 0 - 100, 0, 150, 100, 22, Pcb3dModelLibrary.mat(0.28, 0.30, 0.34, 0.25, 0.38));
      box(0 - 120, 0 - 70, 22, 120, 70, 22.5, PbrMats.plasticTop());
      box(0 - 150, 0 - 100, 8, 0 - 130, 100, 14, Pcb3dModelLibrary.mat(0.75, 0.15, 0.12, 0, 0.5));
      cyl(0, 0, 22, 36, 14, 14, PbrMats.pin(), true);
      cyl(0, 0, 36, 48, 6, 10, PbrMats.pin(), true);
      return true;
    }

    // —— 端子 ——
    if (id.indexOf('TERMINAL') >= 0) {
      box(0 - 18, 0 - 12, 0, 18, 12, 20, Pcb3dModelLibrary.mat(0.05, 0.45, 0.2, 0, 0.5));
      return true;
    }

    // —— 轴向电阻 / 二极管 / 电感 / 保险丝 ——
    if (id.indexOf('AXIAL') >= 0 || id.indexOf('FUSE') >= 0) {
      const isDiode: boolean = id.indexOf('DIODE') >= 0 || ref.startsWith('D');
      const isInd: boolean = id.indexOf('IND') >= 0 || ref.startsWith('L');
      const isFuse: boolean = id.indexOf('FUSE') >= 0;
      let body: PbrMaterial = PbrMats.chipBody();
      if (isDiode) {
        body = Pcb3dModelLibrary.mat(0.55, 0.28, 0.12, 0.05, 0.28);
      } else if (isInd) {
        body = PbrMats.inductor();
      } else if (isFuse) {
        body = Pcb3dModelLibrary.mat(0.75, 0.72, 0.68, 0.15, 0.35);
      }
      cyl(0, 0, 0, 14, 11, 16, body, true);
      if (isDiode) {
        box(0 - 10, 0 - 12, 0, 0 - 4, 12, 14, Pcb3dModelLibrary.mat(0.04, 0.04, 0.05, 0, 0.7));
      }
      if (isFuse) {
        box(0 - 6, 0 - 12, 0, 6, 12, 14, Pcb3dModelLibrary.mat(0.05, 0.05, 0.06, 0, 0.6));
      }
      return true;
    }

    return false;
  }

  private static parseTrailingInt(id: string, fallback: number): number {
    let n: number = 0;
    let found: boolean = false;
    for (let i = 0; i < id.length; i++) {
      const c: number = id.charCodeAt(i);
      if (c >= 48 && c <= 57) {
        n = n * 10 + (c - 48);
        found = true;
      } else if (found) {
        break;
      }
    }
    if (!found) {
      return fallback;
    }
    return Math.min(40, Math.max(1, n));
  }

  private static xf(x: number, y: number, zBase: number, yaw: number, mirrored: boolean): Mat4 {
    let m = Mat4.rotationZ(yaw);
    if (mirrored) {
      m = Mat4.scale(0 - 1, 1, 1).mul(m);
    }
    return Mat4.translation(x, y, zBase).mul(m);
  }
}
