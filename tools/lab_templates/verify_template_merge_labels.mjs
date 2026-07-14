/**
 * Simulate TemplateMergeUtil: labels must copy with offset and stay near their wires.
 */
import { resetSeq, K } from './kit.mjs';
import { TEMPLATE_DEFS } from './builders.mjs';

function mergeInto(target, source, offset) {
  const compIdMap = new Map();
  const netIdMap = new Map();
  for (const src of source.components) {
    const newId = `c_${src.id}`;
    compIdMap.set(src.id, newId);
    target.components.push({
      ...src,
      id: newId,
      position: { x: src.position.x + offset.x, y: src.position.y + offset.y }
    });
  }
  for (const srcNet of source.nets) {
    const newNetId = `n_${srcNet.id}`;
    netIdMap.set(srcNet.id, newNetId);
    target.nets.push({
      ...srcNet,
      id: newNetId,
      pinIds: srcNet.pinIds.map((r) => {
        const parts = r.split(':');
        return [compIdMap.get(parts[0]), ...parts.slice(1)].join(':');
      })
    });
  }
  for (const w of source.wires) {
    target.wires.push({
      ...w,
      id: `w_${w.id}`,
      netId: netIdMap.get(w.netId),
      points: w.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y }))
    });
  }
  if (!target.netLabels) target.netLabels = [];
  for (const lb of source.netLabels || []) {
    const nid = netIdMap.get(lb.netId);
    if (!nid) continue;
    target.netLabels.push({
      ...lb,
      id: `l_${lb.id}`,
      netId: nid,
      position: { x: lb.position.x + offset.x, y: lb.position.y + offset.y }
    });
  }
}

let fail = 0;
for (const def of TEMPLATE_DEFS) {
  resetSeq();
  const src = K.createDoc(def.name, def.description);
  def.build(src);
  const tgt = K.createDoc('Empty', '');
  mergeInto(tgt, src, { x: 40, y: 40 });
  if (tgt.netLabels.length !== src.netLabels.length || tgt.netLabels.length === 0) {
    console.log(`[FAIL] ${def.id} labels ${tgt.netLabels.length} (src ${src.netLabels.length})`);
    fail++;
    continue;
  }
  let orphan = 0;
  for (const lb of tgt.netLabels) {
    const hit = tgt.wires.some((w) =>
      w.netId === lb.netId &&
      w.points.some((p) => Math.hypot(p.x - lb.position.x, p.y - lb.position.y) <= 24)
    );
    if (!hit) orphan++;
  }
  console.log(`[ok] ${def.id} labels=${tgt.netLabels.length} orphanNearWire=${orphan}`);
  if (orphan > Math.max(2, tgt.netLabels.length * 0.2)) {
    fail++;
  }
}
console.log(fail ? `FAILED ${fail}` : 'MERGE+LABEL CHECK PASSED');
process.exit(fail ? 1 : 0);
