/**
 * Smoke: RC/one-shot auto timebase must NOT grow with idle DC history.
 * Gap 10ms→1s/div previously forced a 10s window → waveform piled on the left.
 */
const DIVISIONS = 10;

const TB = {
  MS_1: 1e-3,
  MS_10: 10e-3,
  MS_100: 100e-3,
  S_1: 1,
  S_10: 10
};

function pickTimebase(wantSecPerDiv) {
  const order = [TB.MS_1, TB.MS_10, TB.MS_100, TB.S_1, TB.S_10];
  for (let i = 0; i < order.length; i++) {
    if (order[i] >= wantSecPerDiv * 0.85) return order[i];
  }
  return TB.S_10;
}

/** Old buggy rule: wantWindow = span * 0.8 */
function oldWantWindow(span, freq) {
  let want = freq > 0.5 ? (3.0 / freq) : Math.max(span * 0.8, 1e-3);
  want = Math.min(Math.max(want, 1e-8), 100);
  if (span > 1e-6) want = Math.min(want, span * 0.95);
  return want;
}

/** New: activity-based window for slow/DC */
function estimateActivitySpan(times, volts) {
  const n = Math.min(times.length, volts.length);
  if (n < 2) return 1e-3;
  let minV = volts[0];
  let maxV = volts[0];
  for (let i = 1; i < n; i++) {
    if (volts[i] < minV) minV = volts[i];
    if (volts[i] > maxV) maxV = volts[i];
  }
  const vpp = maxV - minV;
  const full = Math.max(times[n - 1] - times[0], 1e-15);
  if (vpp < 1e-4) return Math.min(full, 50e-3);

  const thr = Math.max(vpp * 0.08, 1e-4);
  const vFinal = volts[n - 1];
  let lastActive = 0;
  for (let i = n - 1; i >= 1; i--) {
    if (Math.abs(volts[i] - vFinal) > thr || Math.abs(volts[i] - volts[i - 1]) > thr) {
      lastActive = i;
      break;
    }
  }
  let firstActive = 0;
  for (let i = 1; i < n; i++) {
    if (Math.abs(volts[i] - volts[0]) > thr) {
      firstActive = i > 0 ? i - 1 : 0;
      break;
    }
  }
  if (lastActive < firstActive) lastActive = firstActive;
  const act = Math.max(times[lastActive] - times[firstActive], 1e-6);
  const settledTail = times[n - 1] - times[lastActive];
  // Long DC tail after a one-shot edge: keep ~2.5× activity, do not use full span
  if (settledTail > act * 0.5) {
    return Math.min(Math.max(act * 2.5, 5e-3), 2.0);
  }
  return Math.min(Math.max(act * 2.0, full * 0.5, 5e-3), 2.0);
}

function newWantWindow(times, volts, freq) {
  const n = Math.min(times.length, volts.length);
  const span = Math.max(times[n - 1] - times[0], 1e-15);
  let want;
  if (freq > 0.5) {
    want = 3.0 / freq;
  } else {
    want = estimateActivitySpan(times, volts);
  }
  want = Math.min(Math.max(want, 1e-8), 100);
  if (span > 1e-6) want = Math.min(want, Math.max(span * 0.95, want));
  // Cap to span so we can fill, but activity already << span for RC
  want = Math.min(want, span * 0.95);
  return want;
}

function buildRcSeries(tau, totalSec, dt) {
  const times = [];
  const volts = [];
  const n = Math.floor(totalSec / dt);
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    times.push(t);
    // charge 0→5V with τ, then flat
    volts.push(5 * (1 - Math.exp(-t / tau)));
  }
  return { times, volts };
}

const rc = buildRcSeries(0.1, 5.0, 1e-3); // τ=100ms, 5s history
const freq = 0;
const oldW = oldWantWindow(5.0, freq);
const newW = newWantWindow(rc.times, rc.volts, freq);
const oldTb = pickTimebase(oldW / DIVISIONS);
const newTb = pickTimebase(newW / DIVISIONS);
const oldWin = oldTb * DIVISIONS;
const newWin = newTb * DIVISIONS;

console.log(`RC τ=100ms, history=5s`);
console.log(`old wantWindow=${oldW.toFixed(3)}s → tb=${oldTb}s/div window=${oldWin.toFixed(3)}s filling=${5.0 < oldWin}`);
console.log(`new wantWindow=${newW.toFixed(3)}s → tb=${newTb}s/div window=${newWin.toFixed(3)}s filling=${5.0 < newWin}`);

let failed = false;
if (oldWin < 5) {
  // Old path with only MS_10/S_1: S_1 → 10s window > 5s span → filling
}
if (!(oldTb >= TB.S_1 - 1e-15)) {
  console.error('EXPECTED: old path jumps to ≥1s/div for long RC history');
  failed = true;
} else {
  console.log('OK reproduce: old auto expands to 1s/div (left crowd)');
}

if (newTb >= TB.S_1 - 1e-15) {
  console.error(`FAIL: new auto still picks ≥1s/div (${newTb})`);
  failed = true;
}
if (newWin > 2.5) {
  console.error(`FAIL: new window too large ${newWin}`);
  failed = true;
}
if (newW < 0.15 || newW > 1.5) {
  console.error(`FAIL: activity window unexpected ${newW}`);
  failed = true;
}

// Growing idle history must not keep expanding
const rc2 = buildRcSeries(0.1, 12.0, 1e-3);
const newW2 = newWantWindow(rc2.times, rc2.volts, freq);
if (Math.abs(newW2 - newW) > 0.15) {
  console.error(`FAIL: idle growth changed wantWindow ${newW} → ${newW2}`);
  failed = true;
} else {
  console.log(`OK: idle growth stable wantWindow ${newW.toFixed(3)} → ${newW2.toFixed(3)}`);
}

if (failed) process.exit(1);
console.log('PASS osc_autoscale_rc_smoke');
