/**
 * Smoke: wave ring must keep enough wall-clock span for scope timebase windows.
 * Bug: blunt point-count splice left only ~8ms @ 1µs step → ROLL forever "filling"
 * (waveform piled on the left).
 */
const MAX_WAVE_POINTS = 8192;
const MAX_WAVE_SPAN_SEC = 12.0;
const DIVISIONS = 10;

function trimBlunt(times, volts, maxPts, maxSpan) {
  const t = times.slice();
  const v = volts.slice();
  const n = t.length;
  if (n >= 8) {
    const tEnd = t[n - 1];
    const tKeep = tEnd - maxSpan;
    if (t[0] < tKeep) {
      let cut = 0;
      while (cut < n - 4 && t[cut] < tKeep) cut++;
      if (cut > 0) {
        t.splice(0, cut);
        v.splice(0, cut);
      }
    }
  }
  if (t.length >= maxPts) {
    const drop = t.length - maxPts + 64;
    if (drop > 0) {
      t.splice(0, drop);
      v.splice(0, drop);
    }
  }
  return { t, v };
}

/** Span-preserving decimate: keep last maxSpan, then stride to ≤ maxPts. */
function trimDecimate(times, volts, maxPts, maxSpan) {
  let t = times.slice();
  let v = volts.slice();
  const n0 = t.length;
  if (n0 >= 8) {
    const tEnd = t[n0 - 1];
    const tKeep = tEnd - maxSpan;
    if (t[0] < tKeep) {
      let cut = 0;
      while (cut < n0 - 4 && t[cut] < tKeep) cut++;
      if (cut > 0) {
        t = t.slice(cut);
        v = v.slice(cut);
      }
    }
  }
  if (t.length > maxPts) {
    const stride = Math.ceil(t.length / maxPts);
    const nt = [];
    const nv = [];
    for (let i = 0; i < t.length; i += stride) {
      nt.push(t[i]);
      nv.push(v[i]);
    }
    if (nt[nt.length - 1] !== t[t.length - 1]) {
      nt.push(t[t.length - 1]);
      nv.push(v[v.length - 1]);
    }
    t = nt;
    v = nv;
  }
  return { t, v };
}

function rollFilling(availableSpan, windowSec) {
  return availableSpan < windowSec - 1e-15;
}

function buildSeries(dt, totalSec) {
  const t = [];
  const v = [];
  const n = Math.floor(totalSec / dt);
  for (let i = 0; i <= n; i++) {
    const ti = i * dt;
    t.push(ti);
    v.push(Math.sin(2 * Math.PI * 1000 * ti));
  }
  return { t, v };
}

const dt = 1e-6;
const series = buildSeries(dt, 0.25); // 250ms @ 1µs → 250001 pts
const blunt = trimBlunt(series.t, series.v, MAX_WAVE_POINTS, 1.0);
const fixed = trimDecimate(series.t, series.v, MAX_WAVE_POINTS, MAX_WAVE_SPAN_SEC);

const windowMs1 = 1e-3 * DIVISIONS;   // 10ms
const windowMs10 = 10e-3 * DIVISIONS; // 100ms

const bluntSpan = blunt.t[blunt.t.length - 1] - blunt.t[0];
const fixedSpan = fixed.t[fixed.t.length - 1] - fixed.t[0];

console.log(`blunt: pts=${blunt.t.length} span=${bluntSpan.toFixed(6)}s ` +
  `filling@1ms/div=${rollFilling(bluntSpan, windowMs1)} ` +
  `filling@10ms/div=${rollFilling(bluntSpan, windowMs10)}`);
console.log(`fixed: pts=${fixed.t.length} span=${fixedSpan.toFixed(6)}s ` +
  `filling@1ms/div=${rollFilling(fixedSpan, windowMs1)} ` +
  `filling@10ms/div=${rollFilling(fixedSpan, windowMs10)}`);

let failed = false;
if (!rollFilling(bluntSpan, windowMs1)) {
  console.error('EXPECTED FAIL: blunt trim should leave span < 10ms window');
  failed = true;
} else {
  console.log('OK reproduce: blunt trim causes permanent filling (left crowd)');
}

if (rollFilling(fixedSpan, windowMs1) || rollFilling(fixedSpan, windowMs10)) {
  console.error('FAIL: decimate trim still filling at 1ms/div or 10ms/div');
  failed = true;
}
if (fixedSpan + 1e-9 < 0.25 * 0.9) {
  console.error(`FAIL: decimate lost too much span: ${fixedSpan}`);
  failed = true;
}
if (fixed.t.length > MAX_WAVE_POINTS + 2) {
  console.error(`FAIL: decimate exceeded max points: ${fixed.t.length}`);
  failed = true;
}

if (failed) {
  process.exit(1);
}
console.log('PASS osc_wave_trim_smoke');
