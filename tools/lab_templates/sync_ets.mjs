/** Convert builders.mjs → LabTemplateBuilders.ets（含 ArkTS 类型修补） */
import { readFileSync, writeFileSync } from 'fs';

const src = readFileSync('tools/lab_templates/builders.mjs', 'utf8');
let body = src
  .replace(/^[\s\S]*?from '\.\/kit\.mjs';\s*/, '')
  .replace(/^function p\([\s\S]*?\r?\n\}\r?\n\r?\n/, '')
  .replace(/export const TEMPLATE_DEFS[\s\S]*$/, '');

body = body.replace(
  /export function (\w+)\(doc\) \{/g,
  'export function $1(doc: SchematicDocument): void {'
);

// ArkTS: nullable ComponentInstance
body = body.replace(
  /let prev = null;/g,
  'let prev: ComponentInstance | null = null;'
);
body = body.replace(
  /let r1 = null;/g,
  'let r1: ComponentInstance | null = null;'
);

// placeXtalCaps helper return type
body = body.replace(
  /function placeXtalCaps\(doc, xtalX, xtalY, tag\) \{/,
  'interface XtalCaps { c1: ComponentInstance; c2: ComponentInstance; }\n' +
  'function placeXtalCaps(doc: SchematicDocument, xtalX: number, xtalY: number, tag: string): XtalCaps {'
);
body = body.replace(
  /function tieUnusedDualOpAmpB\(doc, opa\) \{/,
  'function tieUnusedDualOpAmpB(doc: SchematicDocument, opa: ComponentInstance): void {'
);
body = body.replace(
  /return \{ c1, c2 \};/,
  'const out: XtalCaps = { c1: c1, c2: c2 };\n  return out;'
);

// ArkTS: no object destructuring
body = body.replace(
  /const \{ c1, c2 \} = placeXtalCaps\(([^)]+)\);/g,
  'const _caps = placeXtalCaps($1);\n  const c1 = _caps.c1;\n  const c2 = _caps.c2;'
);
body = body.replace(
  /const \{ c1: cx1, c2: cx2 \} = placeXtalCaps\(([^)]+)\);/g,
  'const _caps = placeXtalCaps($1);\n  const cx1 = _caps.c1;\n  const cx2 = _caps.c2;'
);

// ArkTS: typed gate defs（lab_digital + lab_digital_gates 各一处，须全局替换）
body = body.replace(
  /const gateDefs = \[[\s\S]*?\];/g,
  `const gateDefs: GateDef[] = [
    gate('74HC00', 'U1', true),
    gate('74HC02', 'U2', true),
    gate('74HC04', 'U3', false),
    gate('74HC08', 'U4', true),
    gate('74HC32', 'U5', true),
    gate('74HC74', 'U6', true)
  ];`
);

const header = `/**
 * 实验模板电路构建器 — 与 tools/lab_templates/builders.mjs 对齐
 * 每个模板器件完整、连线正确、可仿真
 */
import { SchematicDocument, ComponentInstance, NetType } from 'common';
import { TemplateSchematicKit as K, PinSpec } from './TemplateSchematicKit';

const R = (doc: SchematicDocument, id: string, ref: string, x: number, y: number): ComponentInstance =>
  K.place(doc, id, ref, { x: x, y: y });
const C = (doc: SchematicDocument, id: string, ref: string, x: number, y: number): ComponentInstance =>
  K.place(doc, id, ref, { x: x, y: y });

function p(comp: ComponentInstance, pinId: string, pinName: string = pinId): PinSpec {
  return { comp: comp, pinId: pinId, pinName: pinName };
}

interface GateDef {
  id: string;
  ref: string;
  dual: boolean;
}

function gate(id: string, ref: string, dual: boolean): GateDef {
  const g: GateDef = { id: id, ref: ref, dual: dual };
  return g;
}

`;

body = body.replace(
  /(\w+)\.parameters\.(\w+)\s*=\s*'([^']+)';/g,
  "$1.parameters.set('$2', '$3');"
);

writeFileSync(
  'features/ai_engine/src/main/ets/algorithms/LabTemplateBuilders.ets',
  header + body
);
console.log('OK LabTemplateBuilders.ets');
