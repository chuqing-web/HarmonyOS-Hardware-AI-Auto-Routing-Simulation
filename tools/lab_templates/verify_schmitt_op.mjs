/**
 * Schmitt (pos-FB) op-amp must latch to rails — not the unstable Vout≈2·Vin saddle.
 * Mirrors AnalogEngine comparatorMode stamp. Usage: node tools/lab_templates/verify_schmitt_op.mjs
 */
function stampComp(G, rhs, no, np, nn, n, v, vcc, vee, state) {
  const gOut = 1e-2;
  const lo = vee + 0.1;
  const hi = Math.max(lo + 0.2, vcc - 1.5);
  const d = (v[np] || 0) - (v[nn] || 0);
  const eps = 1e-4;
  if (d > eps) state.h = true;
  else if (d < -eps) state.h = false;
  const tgt = state.h ? hi : lo;
  G[no * n + no] += gOut;
  rhs[no] += gOut * tgt;
}

function stampLin(G, rhs, no, np, nn, n, v, gain, vcc, vee) {
  const gOut = 1e-2;
  const A = gain;
  G[no * n + no] += gOut;
  G[no * n + np] -= gOut * A;
  G[no * n + nn] += gOut * A;
  const vOut = v[no] || 0;
  const lo = vee + 0.1;
  const hi = Math.max(lo + 0.2, vcc - 1.5);
  if (vOut < lo) {
    const over = Math.min(lo - vOut, 3);
    const gd = 0.5 + 20 * over;
    G[no * n + no] += gd;
    rhs[no] += gd * lo;
  } else if (vOut > hi) {
    const over = Math.min(vOut - hi, 3);
    const gd = 0.5 + 20 * over;
    G[no * n + no] += gd;
    rhs[no] += gd * hi;
  }
}

function stampG(G, ni, nj, g, n) {
  G[ni * n + ni] += g;
  G[nj * n + nj] += g;
  G[ni * n + nj] -= g;
  G[nj * n + ni] -= g;
}

function luSolve(a, b, n) {
  const A = a.slice();
  const x = b.slice();
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let piv = k;
    let max = Math.abs(A[idx[k] * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[idx[i] * n + k]);
      if (v > max) {
        max = v;
        piv = i;
      }
    }
    if (max < 1e-18) return null;
    [idx[k], idx[piv]] = [idx[piv], idx[k]];
    for (let i = k + 1; i < n; i++) {
      const f = A[idx[i] * n + k] / A[idx[k] * n + k];
      A[idx[i] * n + k] = f;
      for (let j = k + 1; j < n; j++) A[idx[i] * n + j] -= f * A[idx[k] * n + j];
    }
  }
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = x[idx[i]];
    for (let j = 0; j < i; j++) s -= A[idx[i] * n + j] * y[j];
    y[i] = s;
  }
  const sol = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= A[idx[i] * n + j] * sol[j];
    sol[i] = s / A[idx[i] * n + i];
  }
  return sol;
}

function solveLabAmp() {
  const n = 5;
  const v = new Array(4).fill(0);
  v[1] = 0.2;
  for (let iter = 0; iter < 40; iter++) {
    const G = new Array(n * n).fill(0);
    const rhs = new Array(n).fill(0);
    for (let i = 1; i < 4; i++) G[i * n + i] += 1e-9;
    stampG(G, 3, 2, 1 / 1e5, n);
    stampG(G, 2, 0, 1 / 1e4, n);
    stampLin(G, rhs, 3, 1, 2, n, v, 1e4, 5, 0);
    const row = 4;
    G[row * n + 1] += 1;
    G[1 * n + row] += 1;
    G[row * n + 0] -= 1;
    G[0 * n + row] -= 1;
    rhs[row] = 0.2;
    G[0] = 1;
    for (let j = 1; j < n; j++) G[j] = 0;
    rhs[0] = 0;
    const sol = luSolve(G, rhs, n);
    if (!sol) return { ok: false };
    let maxd = 0;
    for (let i = 0; i < 4; i++) {
      maxd = Math.max(maxd, Math.abs(sol[i] - v[i]));
      v[i] = sol[i];
    }
    v[1] = 0.2;
    if (maxd < 1e-5) return { ok: true, Vout: v[3] };
  }
  return { ok: false, Vout: v[3] };
}

/** From unstable saddle Vout=2·Vin — must leave and rail. */
function solveSchmittFromStuck(vin) {
  const n = 5;
  const v = [0, vin, 2 * vin, vin];
  const st = { h: false };
  for (let iter = 0; iter < 80; iter++) {
    const G = new Array(n * n).fill(0);
    const rhs = new Array(n).fill(0);
    for (let i = 1; i < 4; i++) G[i * n + i] += 1e-9;
    stampG(G, 2, 3, 1 / 1e4, n);
    stampG(G, 3, 0, 1 / 1e4, n);
    stampComp(G, rhs, 2, 3, 1, n, v, 5, -12, st);
    const row = 4;
    G[row * n + 1] += 1;
    G[1 * n + row] += 1;
    G[row * n + 0] -= 1;
    G[0 * n + row] -= 1;
    rhs[row] = vin;
    G[0] = 1;
    for (let j = 1; j < n; j++) G[j] = 0;
    rhs[0] = 0;
    const sol = luSolve(G, rhs, n);
    if (!sol) return { ok: false };
    let maxd = 0;
    for (let i = 0; i < 4; i++) {
      maxd = Math.max(maxd, Math.abs(sol[i] - v[i]));
      v[i] = sol[i];
    }
    v[1] = vin;
    if (maxd < 1e-5) {
      const nearRail = Math.abs(v[2] - 3.5) < 0.2 || Math.abs(v[2] + 11.9) < 0.2;
      const notSaddle = Math.abs(v[2] - 2 * vin) > 0.5;
      return { ok: nearRail && notSaddle, Vout: v[2], st };
    }
  }
  return { ok: false, Vout: v[2] };
}

/**
 * Lab Rf=100k Rg=10k β≈0.091 → Vth≈+0.95/−1.08V (Vsat +10.5/−11.9).
 * 2V-peak sine must toggle; 1V-peak cannot cross Vth− (stuck LO).
 */
function schmittToggleSweep() {
  const st = { h: false };
  let v = [0, 0, 0, 0];
  const outs = [];
  for (const vin of [-2, 0, 2, 0, -2]) {
    const n = 5;
    for (let it = 0; it < 50; it++) {
      const G = new Array(n * n).fill(0);
      const rhs = new Array(n).fill(0);
      for (let i = 1; i < 4; i++) G[i * n + i] += 1e-9;
      stampG(G, 2, 3, 1 / 1e5, n);
      stampG(G, 3, 0, 1 / 1e4, n);
      stampComp(G, rhs, 2, 3, 1, n, v, 12, -12, st);
      const row = 4;
      G[row * n + 1] += 1;
      G[1 * n + row] += 1;
      G[row * n + 0] -= 1;
      G[0 * n + row] -= 1;
      rhs[row] = vin;
      G[0] = 1;
      for (let j = 1; j < n; j++) G[j] = 0;
      rhs[0] = 0;
      const sol = luSolve(G, rhs, n);
      for (let i = 0; i < 4; i++) {
        const d = sol[i] - v[i];
        v[i] += Math.max(-1, Math.min(1, d));
      }
      v[1] = vin;
    }
    outs.push({ vin, Vout: +v[2].toFixed(2), h: st.h });
  }
  const flipped =
    outs[0].h === true &&
    outs[2].h === false &&
    outs[4].h === true;
  return { ok: flipped, outs };
}

const amp = solveLabAmp();
const stuck = solveSchmittFromStuck(1);
const sweep = schmittToggleSweep();
console.log('lab_amp', amp);
console.log('schmitt_stuck', stuck);
console.log('schmitt_toggle', sweep);
if (!amp.ok || Math.abs(amp.Vout - 2.2) > 0.05) {
  console.error('FAIL lab_amp');
  process.exit(1);
}
if (!stuck.ok) {
  console.error('FAIL schmitt must leave Vout=2·Vin saddle');
  process.exit(1);
}
if (!sweep.ok) {
  console.error('FAIL schmitt toggle');
  process.exit(1);
}
console.log('PASS');
