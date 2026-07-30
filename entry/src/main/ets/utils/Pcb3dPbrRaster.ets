/**
 * 软件 Z-buffer 光栅（Lambert + 金属高光近似）
 * 主线程友好：按三角形着色、无逐像素分配、强制低分辨率
 */
import {
  Vec3, MeshTri, Mesh3d
} from './Pcb3dMath';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function clampByte(x: number): number {
  return Math.max(0, Math.min(255, Math.round(x)));
}

export interface PbrRenderParams {
  width: number;
  height: number;
  /** MSAA 样本数：1 或 4（交互路径强制 1） */
  msaa: number;
  ortho: boolean;
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
  boardCx: number;
  boardCy: number;
  /** 世界单位到场景单位（mil → 渲染空间） */
  worldScale: number;
}

export class Pcb3dPbrRaster {
  /**
   * 渲染网格到 RGBA8888 像素缓冲（行优先，上→下）
   */
  static render(mesh: Mesh3d, p: PbrRenderParams): number[] {
    // 硬上限：避免模拟器主线程 THREAD_BLOCK
    const w = Math.max(48, Math.min(360, Math.floor(p.width)));
    const h = Math.max(36, Math.min(240, Math.floor(p.height)));
    const color = new Array<number>(w * h * 4);
    const depth = new Array<number>(w * h);
    for (let i = 0; i < w * h; i++) {
      depth[i] = 1e30;
      color[i * 4] = 34;
      color[i * 4 + 1] = 38;
      color[i * 4 + 2] = 48;
      color[i * 4 + 3] = 255;
    }
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(h - 1, 1);
      const r = Math.round(232 + (168 - 232) * t);
      const g = Math.round(236 + (176 - 236) * t);
      const b = Math.round(242 + (190 - 242) * t);
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        color[idx] = r;
        color[idx + 1] = g;
        color[idx + 2] = b;
      }
    }

    const yaw = p.yawDeg * Math.PI / 180;
    const pitch = p.pitchDeg * Math.PI / 180;
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const ox = w / 2 + p.panX;
    const oy = h / 2 + p.panY;
    const zoom = Math.max(p.zoom, 0.05);
    const lx = -0.55;
    const ly = 0.45;
    const lz = 0.7;
    const llen = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;

    const project = (wx: number, wy: number, wz: number, out: Vec3): void => {
      const x0 = wx - p.boardCx;
      const y0 = wy - p.boardCy;
      const x1 = x0 * cyaw - y0 * syaw;
      const y1 = x0 * syaw + y0 * cyaw;
      const y2 = y1 * cp - wz * sp;
      let sx = x1 * zoom;
      let sy = y2 * zoom;
      // 与伪 3D painter 一致：depth 越大越靠前；Z-buffer 存 -depth
      const d = y1 * sp + wz * cp;
      if (!p.ortho) {
        const scale = 1 / (1 + d * 0.00022);
        sx *= scale;
        sy *= scale;
      }
      out.x = ox + sx;
      out.y = oy + sy;
      out.z = -d;
    };

    const sa = new Vec3();
    const sb = new Vec3();
    const sc = new Vec3();
    const tris = mesh.tris;
    for (let ti = 0; ti < tris.length; ti++) {
      const tri = tris[ti];
      project(tri.a.x, tri.a.y, tri.a.z, sa);
      project(tri.b.x, tri.b.y, tri.b.z, sb);
      project(tri.c.x, tri.c.y, tri.c.z, sc);
      Pcb3dPbrRaster.rasterTriFast(tri, sa, sb, sc, lx / llen, ly / llen, lz / llen,
        w, h, color, depth);
    }
    return color;
  }

  /** 按三角形一次着色 + 标量 Z 测试（无逐像素对象分配） */
  private static rasterTriFast(tri: MeshTri, sa: Vec3, sb: Vec3, sc: Vec3,
    lx: number, ly: number, lz: number,
    w: number, h: number,
    color: number[], depth: number[]): void {
    const area = (sb.x - sa.x) * (sc.y - sa.y) - (sb.y - sa.y) * (sc.x - sa.x);
    if (area <= 1e-4) return;

    let minX = Math.floor(Math.min(sa.x, sb.x, sc.x));
    let maxX = Math.ceil(Math.max(sa.x, sb.x, sc.x));
    let minY = Math.floor(Math.min(sa.y, sb.y, sc.y));
    let maxY = Math.ceil(Math.max(sa.y, sb.y, sc.y));
    minX = Math.max(0, minX);
    maxX = Math.min(w - 1, maxX);
    minY = Math.max(0, minY);
    maxY = Math.min(h - 1, maxY);
    if (minX > maxX || minY > maxY) return;

    // 面法线（几何）用于 Lambert
    const e1x = tri.b.x - tri.a.x;
    const e1y = tri.b.y - tri.a.y;
    const e1z = tri.b.z - tri.a.z;
    const e2x = tri.c.x - tri.a.x;
    const e2y = tri.c.y - tri.a.y;
    const e2z = tri.c.z - tri.a.z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // 若网格法线与几何相反，取网格平均法线
    const anx = (tri.na.x + tri.nb.x + tri.nc.x) / 3;
    const any = (tri.na.y + tri.nb.y + tri.nc.y) / 3;
    const anz = (tri.na.z + tri.nb.z + tri.nc.z) / 3;
    if (nx * anx + ny * any + nz * anz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }

    const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
    const albedo = tri.mat.albedo;
    const metallic = clamp01(tri.mat.metallic);
    const ambient = 0.28 + 0.12 * clamp01(nz * 0.5 + 0.5);
    const diff = ambient + (0.55 + 0.35 * metallic) * ndl;
    const spec = metallic * Math.pow(ndl, 12) * 0.45;
    const cr = clamp01(albedo.x * diff * (1 - metallic * 0.35) + spec);
    const cg = clamp01(albedo.y * diff * (1 - metallic * 0.35) + spec * 0.92);
    const cb = clamp01(albedo.z * diff * (1 - metallic * 0.35) + spec * 0.75);
    // 简易显示映射（避免二次 sRGB）
    const fr = clampByte(Math.pow(cr, 0.9) * 255);
    const fg = clampByte(Math.pow(cg, 0.9) * 255);
    const fb = clampByte(Math.pow(cb, 0.9) * 255);

    const invArea = 1 / area;
    const sax = sa.x;
    const say = sa.y;
    const saz = sa.z;
    const sbx = sb.x;
    const sby = sb.y;
    const sbz = sb.z;
    const scx = sc.x;
    const scy = sc.y;
    const scz = sc.z;

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      const row = y * w;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        // 与 area=(B-A)×(C-A) 同绕向
        const a0 = ((scx - sbx) * (py - sby) - (scy - sby) * (px - sbx)) * invArea;
        const a1 = ((sax - scx) * (py - scy) - (say - scy) * (px - scx)) * invArea;
        const a2 = 1 - a0 - a1;
        if (a0 < 0 || a1 < 0 || a2 < 0) continue;
        const z = a0 * saz + a1 * sbz + a2 * scz;
        const di = row + x;
        if (z >= depth[di]) continue;
        depth[di] = z;
        const idx = di * 4;
        color[idx] = fr;
        color[idx + 1] = fg;
        color[idx + 2] = fb;
        color[idx + 3] = 255;
      }
    }
  }

  /** 将 RGBA 缓冲绘制到 Canvas（优先 putImageData；缩放按源像素填块） */
  static blitToCanvas(ctx: CanvasRenderingContext2D, rgba: number[],
    srcW: number, srcH: number, dstX: number, dstY: number,
    dstW: number, dstH: number): void {
    if (dstW === srcW && dstH === srcH) {
      try {
        const img = ctx.createImageData(srcW, srcH);
        const data = img.data;
        const n = srcW * srcH * 4;
        for (let i = 0; i < n; i++) {
          data[i] = rgba[i];
        }
        ctx.putImageData(img, dstX, dstY);
        return;
      } catch (_e) {
        // fall through
      }
    }
    Pcb3dPbrRaster.blitScaled(ctx, rgba, srcW, srcH, dstX, dstY, dstW, dstH);
  }

  /** 按源分辨率遍历上采样，避免按目标分辨率百万次 fillRect */
  private static blitScaled(ctx: CanvasRenderingContext2D, rgba: number[],
    srcW: number, srcH: number, dstX: number, dstY: number,
    dstW: number, dstH: number): void {
    const scaleX = dstW / srcW;
    const scaleY = dstH / srcH;
    for (let y = 0; y < srcH; y++) {
      let runX = 0;
      let runR = -1;
      let runG = -1;
      let runB = -1;
      let runLen = 0;
      const dy = dstY + y * scaleY;
      const dh = Math.max(1, Math.ceil(scaleY + 0.01));
      const flush = (): void => {
        if (runLen <= 0 || runR < 0) return;
        ctx.fillStyle = `rgb(${runR},${runG},${runB})`;
        ctx.fillRect(dstX + runX * scaleX, dy, Math.ceil(runLen * scaleX + 0.01), dh);
        runLen = 0;
      };
      const row = y * srcW * 4;
      for (let x = 0; x < srcW; x++) {
        const i = row + x * 4;
        const r = rgba[i];
        const g = rgba[i + 1];
        const b = rgba[i + 2];
        if (runLen === 0) {
          runX = x;
          runR = r;
          runG = g;
          runB = b;
          runLen = 1;
        } else if (r === runR && g === runG && b === runB) {
          runLen++;
        } else {
          flush();
          runX = x;
          runR = r;
          runG = g;
          runB = b;
          runLen = 1;
        }
      }
      flush();
    }
  }
}
