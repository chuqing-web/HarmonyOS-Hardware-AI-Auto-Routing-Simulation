/**
 * 3D 向量 / 矩阵（PBR 光栅用）
 */
export class Vec3 {
  x: number = 0;
  y: number = 0;
  z: number = 0;

  constructor(x: number = 0, y: number = 0, z: number = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  static from(a: number[]): Vec3 {
    return new Vec3(a[0], a[1], a[2]);
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  add(o: Vec3): Vec3 {
    return new Vec3(this.x + o.x, this.y + o.y, this.z + o.z);
  }

  sub(o: Vec3): Vec3 {
    return new Vec3(this.x - o.x, this.y - o.y, this.z - o.z);
  }

  mul(s: number): Vec3 {
    return new Vec3(this.x * s, this.y * s, this.z * s);
  }

  hadamard(o: Vec3): Vec3 {
    return new Vec3(this.x * o.x, this.y * o.y, this.z * o.z);
  }

  dot(o: Vec3): number {
    return this.x * o.x + this.y * o.y + this.z * o.z;
  }

  cross(o: Vec3): Vec3 {
    return new Vec3(
      this.y * o.z - this.z * o.y,
      this.z * o.x - this.x * o.z,
      this.x * o.y - this.y * o.x
    );
  }

  length(): number {
    return Math.sqrt(this.dot(this));
  }

  normalize(): Vec3 {
    const l = this.length();
    if (l < 1e-12) return new Vec3(0, 0, 1);
    return this.mul(1 / l);
  }

  reflect(n: Vec3): Vec3 {
    return this.sub(n.mul(2 * this.dot(n)));
  }

  lerp(o: Vec3, t: number): Vec3 {
    return this.mul(1 - t).add(o.mul(t));
  }

  saturate(): Vec3 {
    return new Vec3(
      Math.max(0, Math.min(1, this.x)),
      Math.max(0, Math.min(1, this.y)),
      Math.max(0, Math.min(1, this.z))
    );
  }
}

export class Mat4 {
  /** column-major 16 */
  m: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];

  static identity(): Mat4 {
    return new Mat4();
  }

  static translation(x: number, y: number, z: number): Mat4 {
    const r = Mat4.identity();
    r.m[12] = x;
    r.m[13] = y;
    r.m[14] = z;
    return r;
  }

  static scale(sx: number, sy: number, sz: number): Mat4 {
    const r = Mat4.identity();
    r.m[0] = sx;
    r.m[5] = sy;
    r.m[10] = sz;
    return r;
  }

  static rotationY(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const r = Mat4.identity();
    r.m[0] = c;
    r.m[2] = -s;
    r.m[8] = s;
    r.m[10] = c;
    return r;
  }

  static rotationX(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const r = Mat4.identity();
    r.m[5] = c;
    r.m[6] = s;
    r.m[9] = -s;
    r.m[10] = c;
    return r;
  }

  static rotationZ(rad: number): Mat4 {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const r = Mat4.identity();
    r.m[0] = c;
    r.m[1] = s;
    r.m[4] = -s;
    r.m[5] = c;
    return r;
  }

  static lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
    const z = eye.sub(target).normalize();
    const x = up.cross(z).normalize();
    const y = z.cross(x);
    const r = Mat4.identity();
    r.m[0] = x.x; r.m[4] = x.y; r.m[8] = x.z;
    r.m[1] = y.x; r.m[5] = y.y; r.m[9] = y.z;
    r.m[2] = z.x; r.m[6] = z.y; r.m[10] = z.z;
    r.m[12] = -x.dot(eye);
    r.m[13] = -y.dot(eye);
    r.m[14] = -z.dot(eye);
    return r;
  }

  static ortho(l: number, rgt: number, b: number, t: number, n: number, f: number): Mat4 {
    const m = Mat4.identity();
    m.m[0] = 2 / (rgt - l);
    m.m[5] = 2 / (t - b);
    m.m[10] = -2 / (f - n);
    m.m[12] = -(rgt + l) / (rgt - l);
    m.m[13] = -(t + b) / (t - b);
    m.m[14] = -(f + n) / (f - n);
    return m;
  }

  static perspective(fovY: number, aspect: number, n: number, f: number): Mat4 {
    const t = Math.tan(fovY * 0.5);
    const m = Mat4.identity();
    m.m[0] = 1 / (aspect * t);
    m.m[5] = 1 / t;
    m.m[10] = -(f + n) / (f - n);
    m.m[11] = -1;
    m.m[14] = -(2 * f * n) / (f - n);
    m.m[15] = 0;
    return m;
  }

  mul(o: Mat4): Mat4 {
    const r = new Mat4();
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < 4; row++) {
        r.m[c * 4 + row] =
          this.m[0 * 4 + row] * o.m[c * 4 + 0] +
          this.m[1 * 4 + row] * o.m[c * 4 + 1] +
          this.m[2 * 4 + row] * o.m[c * 4 + 2] +
          this.m[3 * 4 + row] * o.m[c * 4 + 3];
      }
    }
    return r;
  }

  transformPoint(p: Vec3): Vec3 {
    const x = this.m[0] * p.x + this.m[4] * p.y + this.m[8] * p.z + this.m[12];
    const y = this.m[1] * p.x + this.m[5] * p.y + this.m[9] * p.z + this.m[13];
    const z = this.m[2] * p.x + this.m[6] * p.y + this.m[10] * p.z + this.m[14];
    const w = this.m[3] * p.x + this.m[7] * p.y + this.m[11] * p.z + this.m[15];
    if (Math.abs(w) < 1e-12) return new Vec3(x, y, z);
    return new Vec3(x / w, y / w, z / w);
  }

  transformDir(p: Vec3): Vec3 {
    return new Vec3(
      this.m[0] * p.x + this.m[4] * p.y + this.m[8] * p.z,
      this.m[1] * p.x + this.m[5] * p.y + this.m[9] * p.z,
      this.m[2] * p.x + this.m[6] * p.y + this.m[10] * p.z
    );
  }
}

export interface PbrMaterial {
  albedo: Vec3;
  metallic: number;
  roughness: number;
}

export interface MeshTri {
  /** 9 floats: 3 verts xyz */
  a: Vec3;
  b: Vec3;
  c: Vec3;
  na: Vec3;
  nb: Vec3;
  nc: Vec3;
  mat: PbrMaterial;
}

export class Mesh3d {
  tris: MeshTri[] = [];
  name: string = '';

  addTri(a: Vec3, b: Vec3, c: Vec3, mat: PbrMaterial, n?: Vec3): void {
    let nn = n;
    if (nn === undefined) {
      nn = b.sub(a).cross(c.sub(a)).normalize();
    }
    this.tris.push({ a, b, c, na: nn, nb: nn, nc: nn, mat });
  }

  addBox(min: Vec3, max: Vec3, mat: PbrMaterial): void {
    const x0 = min.x; const y0 = min.y; const z0 = min.z;
    const x1 = max.x; const y1 = max.y; const z1 = max.z;
    const p = (x: number, y: number, z: number): Vec3 => new Vec3(x, y, z);
    // +Z
    this.addTri(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), mat, new Vec3(0, 0, 1));
    this.addTri(p(x0, y0, z1), p(x1, y1, z1), p(x0, y1, z1), mat, new Vec3(0, 0, 1));
    // -Z
    this.addTri(p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), mat, new Vec3(0, 0, -1));
    this.addTri(p(x0, y0, z0), p(x1, y1, z0), p(x1, y0, z0), mat, new Vec3(0, 0, -1));
    // +Y
    this.addTri(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), mat, new Vec3(0, 1, 0));
    this.addTri(p(x0, y1, z0), p(x1, y1, z1), p(x1, y1, z0), mat, new Vec3(0, 1, 0));
    // -Y
    this.addTri(p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), mat, new Vec3(0, -1, 0));
    this.addTri(p(x0, y0, z0), p(x1, y0, z1), p(x0, y0, z1), mat, new Vec3(0, -1, 0));
    // +X
    this.addTri(p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), mat, new Vec3(1, 0, 0));
    this.addTri(p(x1, y0, z0), p(x1, y1, z1), p(x1, y0, z1), mat, new Vec3(1, 0, 0));
    // -X
    this.addTri(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), mat, new Vec3(-1, 0, 0));
    this.addTri(p(x0, y0, z0), p(x0, y1, z1), p(x0, y1, z0), mat, new Vec3(-1, 0, 0));
  }

  /** 圆柱（沿 Z），分段 */
  addCylinder(cx: number, cy: number, z0: number, z1: number, r: number,
    seg: number, mat: PbrMaterial, capped: boolean): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      const n0 = new Vec3(Math.cos(a0), Math.sin(a0), 0);
      const n1 = new Vec3(Math.cos(a1), Math.sin(a1), 0);
      const p00 = new Vec3(x0, y0, z0);
      const p10 = new Vec3(x1, y1, z0);
      const p01 = new Vec3(x0, y0, z1);
      const p11 = new Vec3(x1, y1, z1);
      this.tris.push({ a: p00, b: p10, c: p11, na: n0, nb: n1, nc: n1, mat });
      this.tris.push({ a: p00, b: p11, c: p01, na: n0, nb: n1, nc: n0, mat });
      if (capped) {
        const top = new Vec3(cx, cy, z1);
        const bot = new Vec3(cx, cy, z0);
        this.addTri(top, p01, p11, mat, new Vec3(0, 0, 1));
        this.addTri(bot, p10, p00, mat, new Vec3(0, 0, -1));
      }
    }
  }

  transform(m: Mat4): Mesh3d {
    const out = new Mesh3d();
    out.name = this.name;
    for (let i = 0; i < this.tris.length; i++) {
      const t = this.tris[i];
      out.tris.push({
        a: m.transformPoint(t.a),
        b: m.transformPoint(t.b),
        c: m.transformPoint(t.c),
        na: m.transformDir(t.na).normalize(),
        nb: m.transformDir(t.nb).normalize(),
        nc: m.transformDir(t.nc).normalize(),
        mat: t.mat
      });
    }
    return out;
  }

  clone(): Mesh3d {
    const out = new Mesh3d();
    out.name = this.name;
    for (let i = 0; i < this.tris.length; i++) {
      const t = this.tris[i];
      out.tris.push({
        a: t.a.clone(),
        b: t.b.clone(),
        c: t.c.clone(),
        na: t.na.clone(),
        nb: t.nb.clone(),
        nc: t.nc.clone(),
        mat: t.mat
      });
    }
    return out;
  }

  append(o: Mesh3d): void {
    for (let i = 0; i < o.tris.length; i++) {
      this.tris.push(o.tris[i]);
    }
  }
}

/** PBR 材质库（线性空间 albedo + GGX 粗糙度） */
export class PbrMats {
  /** 绿色阻焊：低粗糙度塑料 */
  static mask(): PbrMaterial {
    return { albedo: hexToLin('#0B7A3E'), metallic: 0.0, roughness: 0.62 };
  }
  /** 铜箔：高金属度、中低粗糙度 */
  static copper(): PbrMaterial {
    return { albedo: hexToLin('#D08050'), metallic: 1.0, roughness: 0.28 };
  }
  /** ENIG 沉金：高金属度、低粗糙度（镜面反射） */
  static enig(): PbrMaterial {
    return { albedo: hexToLin('#F0D050'), metallic: 1.0, roughness: 0.12 };
  }
  /** 塑封体：深灰、微粗糙 */
  static plastic(): PbrMaterial {
    return { albedo: hexToLin('#222228'), metallic: 0.0, roughness: 0.65 };
  }
  /** 陶瓷电容：米黄、半光泽 */
  static ceramic(): PbrMaterial {
    return { albedo: hexToLin('#ECD8A0'), metallic: 0.0, roughness: 0.48 };
  }
  /** 引脚：银色金属 */
  static pin(): PbrMaterial {
    return { albedo: hexToLin('#D0D0D8'), metallic: 1.0, roughness: 0.18 };
  }
  /** FR4 基板侧边：黄褐色纤维 */
  static fr4(): PbrMaterial {
    return { albedo: hexToLin('#A89068'), metallic: 0.0, roughness: 0.80 };
  }
  /** 过孔沉铜孔壁 — 暖调电镀铜 */
  static barrel(): PbrMaterial {
    return { albedo: hexToLin('#D08850'), metallic: 0.92, roughness: 0.35 };
  }
  /** 丝印白字 */
  static silk(): PbrMaterial {
    return { albedo: hexToLin('#F8F8F8'), metallic: 0.0, roughness: 0.60 };
  }
}

function srgbToLin(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function hexToLin(hex: string): Vec3 {
  const h = hex.startsWith('#') ? hex.substring(1) : hex;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return new Vec3(srgbToLin(r), srgbToLin(g), srgbToLin(b));
}

export function linToSrgbByte(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(s * 255)));
}
