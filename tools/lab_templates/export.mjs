#!/usr/bin/env node
/**
 * 导出 15 个实验模板为 .schsim 工程文件
 * 用法: node tools/lab_templates/export.mjs
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { K, resetSeq } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_DIRS = [
  join(ROOT, 'Test_Template'),
  join(ROOT, 'entry', 'src', 'main', 'resources', 'rawfile', 'Test_Template')
];

const MAP_MARKER = '__map__';

function mapJsonReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && typeof value.set === 'function') {
    const mapObj = { [MAP_MARKER]: '1' };
    value.forEach((v, k) => { mapObj[k] = v; });
    return mapObj;
  }
  return value;
}

function mapAwareStringify(obj, pretty = false) {
  return JSON.stringify(obj, mapJsonReplacer, pretty ? 2 : undefined);
}

function emptyMap() {
  return { [MAP_MARKER]: '1' };
}

function docToTopology(doc) {
  return {
    schUuid: doc.id,
    schName: doc.name,
    layerDepth: 0,
    deviceList: doc.components.map(c => ({
      instUuid: c.id,
      libDevId: c.libraryId,
      refName: c.refDes,
      x: c.position.x,
      y: c.position.y,
      rotate: c.rotation,
      mirrorH: c.mirrored,
      mirrorV: false,
      params: emptyMap(),
      pinVoltage: emptyMap(),
      hidden: false,
      subCircuitRef: '',
      ercErrorMsg: ''
    })),
    netList: doc.nets.map(n => ({
      netUuid: n.id,
      netName: n.name,
      displayName: n.name,
      nodeList: n.pinIds.map(pinRef => {
        const parts = pinRef.split(':');
        if (parts.length >= 2 && parts[0].length > 0) {
          return { devUuid: parts[0], pinId: parts[1] };
        }
        return { devUuid: '', pinId: pinRef };
      }),
      isPower: n.type === 'power' || n.type === 'ground',
      isAnalog: false,
      isBusMember: n.type === 'bus',
      busParentUuid: '',
      defaultVoltage: n.type === 'power' ? 5.0 : 0.0,
      ercWarning: false,
      connectedProbeIds: []
    })),
    busList: [],
    wireList: doc.wires.map(w => ({
      netUuid: w.netId,
      points: w.points,
      isBus: false
    })),
    subCircuitList: [],
    probeList: [],
    textAnnotate: [],
    ercErrorList: [],
    gridStep: doc.metadata.gridSize,
    bgColor: '#0a0a1a'
  };
}

function defaultSimConfig() {
  return {
    simMode: 'mixed',
    transientTotalTime: 0.01,
    minTimeStep: 1e-9,
    maxTimeStep: 1e-6,
    dcVoltageScan: { start: 0, end: 5, step: 0.1 },
    acFreqStart: 10,
    acFreqEnd: 1e6,
    acPoints: 1000,
    monteCarloCount: 100,
    enableGpuSpice: false,
    freezeIdleSubcircuit: true,
    waveSampleInterval: 1e-7,
    syncMcuSpicePrecision: 'ns',
    mcuClockHz: 11059200,
    temperature: 27,
    convergence: 1e-6
  };
}

function buildHashPayload(data) {
  return mapAwareStringify({
    version: data.version,
    name: data.name,
    topology: data.topology,
    simConfig: data.simConfig,
    aiConfigs: data.aiConfigs,
    createdAt: data.createdAt,
    modifiedAt: data.modifiedAt
  });
}

function buildProjectData(def) {
  resetSeq();
  const now = new Date().toISOString();
  const doc = K.createDoc(def.name, def.description);
  def.build(doc);
  doc.name = def.name;
  const topology = docToTopology(doc);
  const data = {
    magic: 'SCHSIM',
    version: '2.0.0',
    name: def.name,
    topology,
    simConfig: defaultSimConfig(),
    aiConfigs: [],
    createdAt: now,
    modifiedAt: now,
    collaboration: { annotations: [], snapshots: [], changeLog: [] }
  };
  data.integrityHash = createHash('sha256').update(buildHashPayload(data)).digest('hex');
  return data;
}

function exportAll() {
  for (const dir of OUT_DIRS) {
    mkdirSync(dir, { recursive: true });
  }
  let count = 0;
  for (const def of TEMPLATE_DEFS) {
    const data = buildProjectData(def);
    const json = mapAwareStringify(data, true);
    const fileName = `${def.id}.schsim`;
    for (const dir of OUT_DIRS) {
      const outPath = join(dir, fileName);
      writeFileSync(outPath, json, 'utf8');
      console.log(`  ✓ ${outPath}`);
    }
    count += 1;
  }
  const manifestSrc = join(ROOT, 'Test_Template', 'template_manifest.json');
  if (existsSync(manifestSrc)) {
    for (const dir of OUT_DIRS) {
      if (dir !== join(ROOT, 'Test_Template')) {
        copyFileSync(manifestSrc, join(dir, 'template_manifest.json'));
      }
    }
  }
  console.log(`\n导出完成: ${count} 个模板 → ${OUT_DIRS.join(', ')}`);
}

exportAll();
