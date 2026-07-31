/**
 * 软件 Z-buffer 光栅（Cook-Torrance GGX + 三点光源 + SSAO 近似 + 胶片色调映射）
 * 主线程友好：按三角形着色、无逐像素对象分配
 */
import {
  Vec3, MeshTri, Mesh3d
} from './Pcb3dMath';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function saturate(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** 简易伪随机哈希（用于程序化纹理） */
function hash11(n: number): number {
  let h = n * 127.1 + 311.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

function hash31(p: Vec3): number {
  let h = p.x * 127.1 + p.y * 311.7 + p.z * 74.7;
  h = Math.sin(h) * 43758.5453;
  return h - Math.floor(h);
}

/** 程序化 FR4 编织纹理法线扰动 */
function fr4WeaveBump(pos: Vec3): Vec3 {
  const scale = 0.012;
  const px = pos.x * scale;
  const py = pos.y * scale;
  const gridX = Math.sin(px * 6.28) * 0.5 + 0.5;
  const gridY = Math.sin(py * 6.28) * 0.5 + 0.5;
  const bumpX = (gridX - 0.5) * 0.06;
  const bumpY = (gridY - 0.5) * 0.06;
  const weave = Math.sin((px + py) * 9.42) * 0.04;
  return new Vec3(bumpX + weave * 0.3, bumpY + weave * 0.3, 0);
}

export interface PbrRenderParams {
  width: number;
  height: number;
  msaa: number;
  ortho: boolean;
  yawDeg: number;
  pitchDeg: number;
  zoom: number;
  panX: number;
  panY: number;
  boardCx: number;
  boardCy: number;
  worldScale: number;
}

/** 光源定义 */
interface Light {
  dir: Vec3;
  color: Vec3;
  intensity: number;
}

export class Pcb3dPbrRaster {
  static render(mesh: Mesh3d, p: PbrRenderParams): number[] {
    // 分辨率提升至 55% 视口（上限 500px 保证性能）
    const scale = 0.55;
    const w = Math.max(80, Math.min(500, Math.floor(p.width * scale)));
    const h = Math.max(60, Math.min(340, Math.floor(p.height * scale)));

    const color = new Array<number>(w * h * 4);
    const depth = new Array<number>(w * h);

    // 三点光源系统：主光 + 补光 + 边缘光
    const keyLight: Light = {
      dir: new Vec3(-0.48, 0.35, 0.78).normalize(),
      color: new Vec3(1.0, 0.95, 0.88),
      intensity: 1.15
    };
    const fillLight: Light = {
      dir: new Vec3(0.40, -0.25, 0.42).normalize(),
      color: new Vec3(0.55, 0.62, 0.78),
      intensity: 0.35
    };
    const rimLight: Light = {
      dir: new Vec3(0.0, -0.65, 0.35).normalize(),
      color: new Vec3(0.75, 0.78, 0.90),
      intensity: 0.28
    };
    const lights: Light[] = [keyLight, fillLight, rimLight];

    // 环境光上色：上方偏冷、下方偏暖（模拟天空/地面）
    const skyCol = new Vec3(0.18, 0.22, 0.32);
    const groundCol = new Vec3(0.15, 0.12, 0.08);

    // 初始化深度缓冲 + 渐变背景
    for (let i = 0; i < w * h; i++) {
      depth[i] = 1e30;
    }
    for (let y = 0; y < h; y++) {
      const t = y / Math.max(h - 1, 1);
      // 上暗下亮渐变（模拟桌面/环境）
      const skyT = 1 - t;
      const bgR = Math.round(skyCol.x * 255 * skyT + groundCol.x * 255 * t);
      const bgG = Math.round(skyCol.y * 255 * skyT + groundCol.y * 255 * t);
      const bgB = Math.round(skyCol.z * 255 * skyT + groundCol.z * 255 * t);
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        color[idx] = bgR;
        color[idx + 1] = bgG;
        color[idx + 2] = bgB;
        color[idx + 3] = 255;
      }
    }

    // 相机矩阵
    const yaw = p.yawDeg * Math.PI / 180;
    const pitch = p.pitchDeg * Math.PI / 180;
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const ox = w / 2 + p.panX * scale;
    const oy = h / 2 + p.panY * scale;
    const zoom = Math.max(p.zoom * scale, 0.03);

    const project = (wx: number, wy: number, wz: number, out: Vec3): void => {
      const x0 = wx - p.boardCx;
      const y0 = wy - p.boardCy;
      const x1 = x0 * cyaw - y0 * syaw;
      const y1 = x0 * syaw + y0 * cyaw;
      const y2 = y1 * cp - wz * sp;
      let sx = x1 * zoom;
      let sy = y2 * zoom;
      const d = y1 * sp + wz * cp;
      // 默认正交（与 Canvas 路径一致），仅显式设置 perspective 才用透视
      if (p.ortho === false) {
        const sc = 1 / (1 + d * 0.00022);
        sx *= sc;
        sy *= sc;
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
      Pcb3dPbrRaster.rasterTriPbr(tri, sa, sb, sc, lights, skyCol, groundCol,
        w, h, color, depth);
    }

    return color;
  }

  /**
   * Cook-Torrance GGX + 多光源 + SSAO 近似光栅化
   */
  private static rasterTriPbr(
    tri: MeshTri, sa: Vec3, sb: Vec3, sc: Vec3,
    lights: Light[], skyCol: Vec3, groundCol: Vec3,
    w: number, h: number,
    color: number[], depth: number[]
  ): void {
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

    // 几何法线（世界空间）
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

    // 确保法线与顶点法线一致
    const anx = (tri.na.x + tri.nb.x + tri.nc.x) / 3;
    const any = (tri.na.y + tri.nb.y + tri.nc.y) / 3;
    const anz = (tri.na.z + tri.nb.z + tri.nc.z) / 3;
    if (nx * anx + ny * any + nz * anz < 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }

    let N = new Vec3(nx, ny, nz);
    const albedo = tri.mat.albedo;
    const metallic = saturate(tri.mat.metallic);
    let roughness = saturate(Math.max(0.08, tri.mat.roughness));

    // 程序化表面细节
    const centroid = new Vec3(
      (tri.a.x + tri.b.x + tri.c.x) / 3,
      (tri.a.y + tri.b.y + tri.c.y) / 3,
      (tri.a.z + tri.b.z + tri.c.z) / 3
    );

    // FR4 编织纹理法线扰动
    if (metallic < 0.1 && roughness > 0.6) {
      const bump = fr4WeaveBump(centroid);
      N = N.add(bump).normalize();
    }

    // 铜箔表面粗糙度微变化
    if (metallic > 0.8 && roughness < 0.45) {
      const rVar = hash31(centroid) * 0.08 - 0.02;
      roughness = saturate(roughness + rVar);
    }

    // 轻微颜色变化（模拟污迹/氧化）
    const colorVar = metallic < 0.1 ? hash31(centroid) * 0.04 - 0.02 : 0;
    const varAlbedo = new Vec3(
      saturate(albedo.x + colorVar),
      saturate(albedo.y + colorVar),
      saturate(albedo.z + colorVar)
    );

    const alpha = roughness * roughness;

    // F0：金属用 albedo，非金属用 0.04
    const f0 = new Vec3(
      albedo.x * metallic + 0.04 * (1 - metallic),
      albedo.y * metallic + 0.04 * (1 - metallic),
      albedo.z * metallic + 0.04 * (1 - metallic)
    );

    // 视线方向 = (0,0,1) 在相机空间中，近似为正面
    const V = new Vec3(0.18, 0.08, 0.98).normalize();

    // SSAO 近似：朝下的面更暗（地面遮蔽）
    const ndotUp = N.z;
    const ao = 0.55 + 0.45 * saturate(ndotUp * 0.5 + 0.5);
    // 边缘接触阴影：低角度面更暗
    const edgeAo = 0.7 + 0.3 * saturate(Math.abs(N.z));

    // 环境光：天空/地面半球
    const envUp = Math.max(0, N.z);
    const envDown = Math.max(0, -N.z);
    const ambient = new Vec3(
      skyCol.x * envUp + groundCol.x * envDown,
      skyCol.y * envUp + groundCol.y * envDown,
      skyCol.z * envUp + groundCol.z * envDown
    );

    // 累加所有光源
    let litR = ambient.x * 0.55;
    let litG = ambient.y * 0.55;
    let litB = ambient.z * 0.55;

    for (let li = 0; li < lights.length; li++) {
      const L = lights[li];
      const NdotL = Math.max(0, N.dot(L.dir));
      if (NdotL <= 0.001) continue;

      // Half vector
      const H = V.add(L.dir).normalize();
      const NdotH = saturate(N.dot(H));
      const NdotV = saturate(N.dot(V));
      const HdotV = saturate(H.dot(V));

      // Cook-Torrance: D * G * F / (4 * NdotV * NdotL)
      const D = Pcb3dPbrRaster.ggxDistribution(NdotH, alpha);
      const G = Pcb3dPbrRaster.smithSchlick(NdotL, roughness) *
        Pcb3dPbrRaster.smithSchlick(NdotV, roughness);
      const F = Pcb3dPbrRaster.fresnelSchlick(HdotV, f0);

      const specBrdf = new Vec3(
        D * G * F.x,
        D * G * F.y,
        D * G * F.z
      );
      const denom = Math.max(0.001, 4 * NdotL * NdotV);
      const spec = new Vec3(
        specBrdf.x / denom,
        specBrdf.y / denom,
        specBrdf.z / denom
      );

      // Diffuse: use color-varied albedo for non-metals
      const kD = new Vec3(
        (1 - F.x) * (1 - metallic),
        (1 - F.y) * (1 - metallic),
        (1 - F.z) * (1 - metallic)
      );
      const diffAlbedo = metallic > 0.5 ? albedo : varAlbedo;
      const diffuse = new Vec3(
        diffAlbedo.x * kD.x / Math.PI,
        diffAlbedo.y * kD.y / Math.PI,
        diffAlbedo.z * kD.z / Math.PI
      );

      const liCol = L.color;
      const liInt = L.intensity * NdotL;
      litR += liCol.x * liInt * (diffuse.x + spec.x);
      litG += liCol.y * liInt * (diffuse.y + spec.y);
      litB += liCol.z * liInt * (diffuse.z + spec.z);
    }

    // 应用 AO
    const aoFinal = ao * edgeAo;
    litR *= aoFinal;
    litG *= aoFinal;
    litB *= aoFinal;

    // 胶片色调映射（ACES 近似）
    const tmR = Pcb3dPbrRaster.acesApprox(litR);
    const tmG = Pcb3dPbrRaster.acesApprox(litG);
    const tmB = Pcb3dPbrRaster.acesApprox(litB);

    // 轻微 Gamma
    const gamma = 0.95;
    const fr = saturate(Math.pow(tmR, gamma)) * 255;
    const fg = saturate(Math.pow(tmG, gamma)) * 255;
    const fb = saturate(Math.pow(tmB, gamma)) * 255;
    // 防止溢出，统一钳制为有效值
    const clampByte = (v: number): number => {
      if (!(v >= 0) || !(v <= 255)) {
        return v < 0 ? 0 : 255;
      }
      return Math.round(v);
    };
    const cr = clampByte(fr);
    const cg = clampByte(fg);
    const cb = clampByte(fb);

    const invArea = 1 / area;
    const sax = sa.x; const say = sa.y; const saz = sa.z;
    const sbx = sb.x; const sby = sb.y; const sbz = sb.z;
    const scx = sc.x; const scy = sc.y; const scz = sc.z;

    // 覆盖抗锯齿：每个像素 4 个子样本
    const subSamples = 4;
    const subOffX = [0.25, 0.75, 0.25, 0.75];
    const subOffY = [0.25, 0.25, 0.75, 0.75];

    for (let y = minY; y <= maxY; y++) {
      const row = y * w;
      for (let x = minX; x <= maxX; x++) {
        const di = row + x;

        // 4x 覆盖采样
        let hits = 0;
        let zSum = 0;
        for (let s = 0; s < subSamples; s++) {
          const px = x + subOffX[s];
          const py = y + subOffY[s];
          const a0 = ((scx - sbx) * (py - sby) - (scy - sby) * (px - sbx)) * invArea;
          const a1 = ((sax - scx) * (py - scy) - (say - scy) * (px - scx)) * invArea;
          const a2 = 1 - a0 - a1;
          if (a0 >= 0 && a1 >= 0 && a2 >= 0) {
            hits++;
            zSum += a0 * saz + a1 * sbz + a2 * scz;
          }
        }
        if (hits === 0) continue;

        const z = zSum / hits;
        if (z >= depth[di]) continue;
        depth[di] = z;

        // 覆盖权重混合
        const coverage = hits / subSamples;
        const idx = di * 4;

        if (coverage >= 0.999) {
          color[idx] = cr;
          color[idx + 1] = cg;
          color[idx + 2] = cb;
          color[idx + 3] = 255;
        } else {
          // 混合已有颜色（边缘抗锯齿）
          const bgr = color[idx];
          const bgg = color[idx + 1];
          const bgb = color[idx + 2];
          color[idx] = Math.round(bgr * (1 - coverage) + cr * coverage);
          color[idx + 1] = Math.round(bgg * (1 - coverage) + cg * coverage);
          color[idx + 2] = Math.round(bgb * (1 - coverage) + cb * coverage);
          color[idx + 3] = 255;
        }
      }
    }
  }

  /** GGX/Trowbridge-Reitz 法线分布 */
  private static ggxDistribution(NdotH: number, alpha: number): number {
    const a2 = alpha * alpha;
    const d = NdotH * NdotH * (a2 - 1) + 1;
    return a2 / Math.max(0.0001, Math.PI * d * d);
  }

  /** Smith-Schlick 几何遮蔽 */
  private static smithSchlick(NdotX: number, roughness: number): number {
    const k = (roughness + 1) * (roughness + 1) / 8;
    return NdotX / (NdotX * (1 - k) + k);
  }

  /** Schlick Fresnel */
  private static fresnelSchlick(cosTheta: number, f0: Vec3): Vec3 {
    const p = Math.pow(1 - cosTheta, 5);
    return new Vec3(
      f0.x + (1 - f0.x) * p,
      f0.y + (1 - f0.y) * p,
      f0.z + (1 - f0.z) * p
    );
  }

  /** ACES 胶片色调映射近似 */
  private static acesApprox(x: number): number {
    const a = 2.51;
    const b = 0.03;
    const c = 2.43;
    const d = 0.59;
    const e = 0.14;
    return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
  }

  /** 将 RGBA 缓冲绘制到 Canvas */
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
