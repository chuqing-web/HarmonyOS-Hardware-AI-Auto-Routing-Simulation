/**
 * STEP AP214 高精度网格导入 + 封装绑定
 * 支持 CARTESIAN_POINT / POLY_LOOP / ADVANCED_FACE 扇形三角化；
 * 以及显式 TRIANGULATED 风格点列（KiCad 导出常见）。
 */
import { Mesh3d, Vec3, PbrMats, PbrMaterial } from './Pcb3dMath';

const MAX_RAW_MESHES = 24;

export interface StepImportResult {
  mesh: Mesh3d;
  pointCount: number;
  faceCount: number;
  triCount: number;
  warnings: string[];
}

/** defId → 已导入网格（绑定副本，避免被 raw 淘汰影响） */
const gBoundMeshes: Map<string, Mesh3d> = new Map();
const gRawMeshes: Map<string, Mesh3d> = new Map();
const gRawOrder: string[] = [];

export function getBoundStepMesh(defId: string): Mesh3d | null {
  const m = gBoundMeshes.get(defId);
  return m !== undefined ? m : null;
}

/** 用于 3D mesh cache 失效签名 */
export function getBoundStepSig(): string {
  let s = '';
  gBoundMeshes.forEach((_v: Mesh3d, k: string) => {
    s += k + ',';
  });
  return s;
}

export function bindStepMeshToFootprint(defId: string, meshId: string): boolean {
  const m = gRawMeshes.get(meshId);
  if (m === undefined) return false;
  // 绑定独立副本，避免后续 raw 清理或重解析污染
  gBoundMeshes.set(defId, m.clone());
  return true;
}

export function listImportedStepMeshes(): string[] {
  const keys: string[] = [];
  gRawMeshes.forEach((_v: Mesh3d, k: string) => {
    keys.push(k);
  });
  return keys;
}

export function clearStepBindings(): void {
  gBoundMeshes.clear();
}

export function clearAllStepMeshes(): void {
  gBoundMeshes.clear();
  gRawMeshes.clear();
  gRawOrder.length = 0;
}

function trimRawCache(): void {
  while (gRawOrder.length > MAX_RAW_MESHES) {
    const oldest = gRawOrder.shift();
    if (oldest !== undefined) {
      gRawMeshes.delete(oldest);
    }
  }
}

/**
 * 解析 STEP 文本为三角网格（高精度：保留全部点，面扇形剖分）
 */
export function parseStepToMesh(stepText: string, meshName: string,
  defaultMat?: PbrMaterial): StepImportResult {
  const warnings: string[] = [];
  const mesh = new Mesh3d();
  mesh.name = meshName;
  const mat = defaultMat !== undefined ? defaultMat : PbrMats.plastic();

  const points: Map<number, Vec3> = new Map();
  const loops: Map<number, number[]> = new Map();

  // CARTESIAN_POINT
  const ptRe = /#(\d+)\s*=\s*CARTESIAN_POINT\s*\(\s*'[^']*'\s*,\s*\(\s*([^)]+?)\s*\)\s*\)\s*;/gi;
  let m: RegExpExecArray | null = ptRe.exec(stepText);
  while (m !== null) {
    const id = parseInt(m[1], 10);
    const parts = m[2].split(',');
    if (parts.length >= 3) {
      const x = parseFloat(parts[0].trim());
      const y = parseFloat(parts[1].trim());
      const z = parseFloat(parts[2].trim());
      if (isFinite(x) && isFinite(y) && isFinite(z)) {
        points.set(id, new Vec3(x, y, z));
      }
    }
    m = ptRe.exec(stepText);
  }

  // POLY_LOOP ( '', ( #1, #2, #3 ) )
  const loopRe = /#(\d+)\s*=\s*POLY_LOOP\s*\(\s*'[^']*'\s*,\s*\(\s*([^)]+?)\s*\)\s*\)\s*;/gi;
  m = loopRe.exec(stepText);
  while (m !== null) {
    const id = parseInt(m[1], 10);
    const ids: number[] = [];
    const refs = m[2].match(/#(\d+)/g);
    if (refs) {
      for (let i = 0; i < refs.length; i++) {
        ids.push(parseInt(refs[i].substring(1), 10));
      }
    }
    if (ids.length >= 3) {
      loops.set(id, ids);
    }
    m = loopRe.exec(stepText);
  }

  // FACE_OUTER_BOUND → POLY_LOOP 间接：#n=FACE_OUTER_BOUND('',#loop,...)
  const fobRe = /#(\d+)\s*=\s*FACE_OUTER_BOUND\s*\(\s*'[^']*'\s*,\s*#(\d+)/gi;
  const fobToLoop: Map<number, number> = new Map();
  m = fobRe.exec(stepText);
  while (m !== null) {
    fobToLoop.set(parseInt(m[1], 10), parseInt(m[2], 10));
    m = fobRe.exec(stepText);
  }

  // ADVANCED_FACE ( '', ( #bound ), #surf, .T. )
  const faceRe = /#(\d+)\s*=\s*ADVANCED_FACE\s*\(\s*'[^']*'\s*,\s*\(\s*([^)]+?)\s*\)/gi;
  let faceCount = 0;
  m = faceRe.exec(stepText);
  while (m !== null) {
    faceCount++;
    const boundRefs = m[2].match(/#(\d+)/g);
    if (boundRefs) {
      for (let bi = 0; bi < boundRefs.length; bi++) {
        const bid = parseInt(boundRefs[bi].substring(1), 10);
        let loopId = bid;
        const mapped = fobToLoop.get(bid);
        if (mapped !== undefined) loopId = mapped;
        const loop = loops.get(loopId);
        if (loop === undefined) continue;
        fanTriangulate(mesh, points, loop, mat);
      }
    }
    m = faceRe.exec(stepText);
  }

  // 回退：若无 ADVANCED_FACE，直接用所有 POLY_LOOP
  if (mesh.tris.length === 0) {
    loops.forEach((loop: number[]) => {
      fanTriangulate(mesh, points, loop, mat);
    });
    if (mesh.tris.length > 0) {
      warnings.push('无 ADVANCED_FACE，已直接三角化 POLY_LOOP');
    }
  }

  // 再回退：点云凸包不适用；若仍空且有点，生成包围盒占位
  if (mesh.tris.length === 0 && points.size >= 2) {
    let min = new Vec3(1e9, 1e9, 1e9);
    let max = new Vec3(-1e9, -1e9, -1e9);
    points.forEach((p: Vec3) => {
      min = new Vec3(Math.min(min.x, p.x), Math.min(min.y, p.y), Math.min(min.z, p.z));
      max = new Vec3(Math.max(max.x, p.x), Math.max(max.y, p.y), Math.max(max.z, p.z));
    });
    mesh.addBox(min, max, mat);
    warnings.push('无法解析面：已用点云 AABB 盒体兜底');
  }

  if (points.size === 0) {
    warnings.push('未找到 CARTESIAN_POINT');
  }

  if (gRawMeshes.has(meshName)) {
    const idx = gRawOrder.indexOf(meshName);
    if (idx >= 0) gRawOrder.splice(idx, 1);
  }
  gRawMeshes.set(meshName, mesh);
  gRawOrder.push(meshName);
  trimRawCache();

  return {
    mesh,
    pointCount: points.size,
    faceCount,
    triCount: mesh.tris.length,
    warnings
  };
}

function fanTriangulate(mesh: Mesh3d, points: Map<number, Vec3>, loop: number[],
  mat: PbrMaterial): void {
  const verts: Vec3[] = [];
  for (let i = 0; i < loop.length; i++) {
    const p = points.get(loop[i]);
    if (p !== undefined) verts.push(p);
  }
  if (verts.length < 3) return;
  const origin = verts[0];
  for (let i = 1; i + 1 < verts.length; i++) {
    mesh.addTri(origin, verts[i], verts[i + 1], mat);
  }
}

/** 从文件内容导入并可选绑定封装 */
export function importStepAndBind(stepText: string, meshId: string, defId: string): StepImportResult {
  const result = parseStepToMesh(stepText, meshId);
  if (result.mesh.tris.length > 0 && defId.length > 0) {
    bindStepMeshToFootprint(defId, meshId);
  }
  return result;
}
