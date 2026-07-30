/**
 * Patch export.mjs: replace addBoardAccessories + autoRoute with channel bus router.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, 'export.mjs');
let s = readFileSync(target, 'utf8');
const start = s.indexOf('/** 添加安装孔 + 板边排针');
const end = s.indexOf('function zoneOutlineFromBoard');
if (start < 0 || end < 0) {
  console.error('markers not found', start, end);
  process.exit(1);
}

const neu = `/** 添加安装孔 + 板边排针，提升成品板密度与专业感 */
function addBoardAccessories(doc) {
  const pts = doc.boardOutline.points;
  let maxX = 0, maxY = 0;
  for (const p of pts) {
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const pinCount = Math.min(8, Math.max(4, Math.ceil(Math.max(doc.nets.length, 2) / 2)));
  const hdrDef = \`FP_PINHDR_\${pinCount <= 4 ? 4 : pinCount <= 6 ? 6 : 8}\`;
  const hdrHalfH = ((pinCount - 1) * 100) / 2 + 50;
  const reserve = 380;
  maxX = maxX + reserve;
  maxY = Math.max(maxY, Math.max(900, hdrHalfH * 2 + 480));
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: maxX, y: 0 }, { x: maxX, y: maxY }, { x: 0, y: maxY }
  ];

  const gnd = doc.nets.find(n => isGndNet(n.name));
  const holeInset = 120;
  const hdrX = maxX - 280;
  const hdrY = Math.min(Math.max(maxY / 2, holeInset + hdrHalfH + 120),
    maxY - holeInset - hdrHalfH - 120);
  const holePositions = [
    { x: holeInset, y: holeInset },
    { x: maxX - holeInset, y: holeInset },
    { x: holeInset, y: maxY - holeInset },
    { x: maxX - holeInset, y: maxY - holeInset }
  ];

  const padClearOk = (ax, ay, ar, bx, by, br) =>
    Math.hypot(ax - bx, ay - by) - ar - br >= 12;

  let hi = 1;
  for (const hp of holePositions) {
    let clash = false;
    for (const fp of doc.footprints) {
      const ext = halfExtents(fp.defId);
      if (Math.abs(fp.position.x - hp.x) < ext.halfW + 110 &&
        Math.abs(fp.position.y - hp.y) < ext.halfH + 110) {
        clash = true;
        break;
      }
    }
    for (let pi = 0; pi < pinCount; pi++) {
      const pitch = 100;
      const startY = -((pinCount - 1) * pitch) / 2;
      const py = hdrY + startY + pi * pitch;
      if (!padClearOk(hp.x, hp.y, 80, hdrX, py, 30)) {
        clash = true;
        break;
      }
    }
    if (clash) continue;
    const hole = instantiate('FP_MOUNT', \`H\${hi}\`, 'M3', hp, 0);
    if (gnd) {
      for (const pad of hole.pads) {
        pad.netId = gnd.id;
        pad.netName = gnd.name;
      }
    }
    doc.footprints.push(hole);
    hi++;
  }

  const hdr = instantiate(hdrDef, 'J1', \`1x\${pinCount}\`, { x: hdrX, y: hdrY }, 0);
  const padCountByNet = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      padCountByNet.set(pad.netId, (padCountByNet.get(pad.netId) || 0) + 1);
    }
  }
  const candidateNets = doc.nets.filter(n =>
    !isGndNet(n.name) && (padCountByNet.get(n.id) || 0) >= 1);
  for (let i = 0; i < hdr.pads.length; i++) {
    if (i === 0 && gnd) {
      hdr.pads[i].netId = gnd.id;
      hdr.pads[i].netName = gnd.name;
    } else if (candidateNets.length > 0) {
      const n = candidateNets[(i - 1) % candidateNets.length];
      hdr.pads[i].netId = n.id;
      hdr.pads[i].netName = n.name;
    }
  }
  doc.footprints.push(hdr);
}

/**
 * 通道总线布线：每个网络独占器件下方一条水平总线 + 偏移竖 stub，避免异网交叉。
 */
function autoRoute(doc) {
  const grid = doc.metadata.gridSize || 5;
  const signalW = Math.max(12, doc.metadata.designRules.defaultTrackWidth);
  const powerW = 24;
  const clr = Math.max(6, doc.metadata.designRules?.minClearance ?? 6);

  const groups = new Map();
  for (const fp of doc.footprints) {
    for (const pad of fp.pads) {
      if (!pad.netId) continue;
      let g = groups.get(pad.netId);
      if (!g) {
        g = { netId: pad.netId, netName: pad.netName || '', points: [] };
        groups.set(pad.netId, g);
      }
      g.points.push(padWorld(fp, pad));
    }
  }

  const routeNets = Array.from(groups.values())
    .filter(g => g.points.length >= 2 && !isGndNet(g.netName))
    .sort((a, b) => {
      const ap = isVccNet(a.netName) ? 0 : 1;
      const bp = isVccNet(b.netName) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.points.length - a.points.length;
    });

  let maxContentY = 0;
  let maxContentX = 0;
  for (const fp of doc.footprints) {
    if (/^H\\d+$/.test(fp.refDes)) continue;
    const ext = halfExtents(fp.defId);
    maxContentY = Math.max(maxContentY, fp.position.y + ext.halfH);
    maxContentX = Math.max(maxContentX, fp.position.x + ext.halfW);
  }
  for (const g of routeNets) {
    for (const p of g.points) {
      maxContentY = Math.max(maxContentY, p.y);
      maxContentX = Math.max(maxContentX, p.x);
    }
  }

  const busPitch = Math.max(powerW, signalW) + clr * 2 + 8;
  const stubPitch = Math.max(powerW, signalW) + clr + 4;
  const busStartY = snap(maxContentY + 80, grid);
  const busBottom = busStartY + Math.max(routeNets.length, 1) * busPitch + 60;

  let boardW = Math.max(...doc.boardOutline.points.map(p => p.x));
  let boardH = Math.max(...doc.boardOutline.points.map(p => p.y));
  boardW = Math.max(boardW, maxContentX + 200);
  boardH = Math.max(boardH, busBottom + 80);
  doc.boardOutline.points = [
    { x: 0, y: 0 }, { x: boardW, y: 0 }, { x: boardW, y: boardH }, { x: 0, y: boardH }
  ];

  let trackCount = 0;
  let viaCount = 0;
  const pushSeg = (a, b, layer, netId, netName, width) => {
    if (dist(a, b) < 0.5) return true;
    if (!pathClearOfTracks(doc, [a, b], netId, layer, width, clr)) return false;
    doc.tracks.push({
      id: uid('trk'), layer,
      start: { x: a.x, y: a.y }, end: { x: b.x, y: b.y },
      width, netId, netName
    });
    trackCount++;
    return true;
  };

  for (let i = 0; i < routeNets.length; i++) {
    const g = routeNets[i];
    const width = isVccNet(g.netName) ? powerW : signalW;
    const busY = snap(busStartY + i * busPitch, grid);
    const busLayer = (i % 2 === 0) ? 'F.Cu' : 'B.Cu';
    const baseDx = ((i % 11) - 5) * stubPitch;
    const pts = g.points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const hub = pts[0];
    const hubSx = snap(hub.x + baseDx, grid);

    const attachPad = (p) => {
      const dxTries = [baseDx, 0, baseDx + stubPitch, baseDx - stubPitch,
        baseDx + 2 * stubPitch, baseDx - 2 * stubPitch, baseDx + 3 * stubPitch];
      for (const dx of dxTries) {
        const sx = snap(p.x + dx, grid);
        const atPad = { x: sx, y: snap(p.y, grid) };
        const atBus = { x: sx, y: busY };
        const hubBus = { x: hubSx, y: busY };
        const beforeTrk = doc.tracks.length;
        const beforeVia = doc.vias.length;
        let good = true;

        if (Math.abs(p.x - sx) > 0.5) {
          if (!pushSeg(p, atPad, 'F.Cu', g.netId, g.netName, width)) good = false;
        }
        const stubTop = (Math.abs(p.x - sx) > 0.5) ? atPad : p;

        if (good) {
          if (!pushSeg(stubTop, atBus, 'F.Cu', g.netId, g.netName, width)) good = false;
        }

        if (good && busLayer === 'F.Cu') {
          if (Math.abs(sx - hubSx) > 0.5) {
            if (!pushSeg(atBus, hubBus, 'F.Cu', g.netId, g.netName, width)) good = false;
          }
        } else if (good) {
          doc.vias.push({
            id: uid('via'), position: { x: atBus.x, y: atBus.y },
            drill: 12, diameter: 24, netId: g.netId, netName: g.netName,
            layers: ['F.Cu', 'B.Cu']
          });
          viaCount++;
          if (Math.abs(sx - hubSx) > 0.5) {
            if (!pushSeg(atBus, hubBus, 'B.Cu', g.netId, g.netName, width)) good = false;
          }
        }

        if (good) return true;
        doc.tracks.length = beforeTrk;
        doc.vias.length = beforeVia;
        trackCount = beforeTrk;
        viaCount = beforeVia;
      }
      return false;
    };

    attachPad(hub);
    for (let pi = 1; pi < pts.length; pi++) {
      attachPad(pts[pi]);
    }
  }

  return { trackCount: doc.tracks.length, netCount: routeNets.length, viaCount: doc.vias.length };
}

`;

writeFileSync(target, s.slice(0, start) + neu + s.slice(end));
console.log('Patched export.mjs OK');
