/**
 * lab_analog_ic signal-chain DC OP (mirrors AnalogEngine stampOpAmp).
 * Expect M1 ≈ 2.2V with Vin=0.2V and gain 11.
 * Usage: node tools/lab_templates/verify_analog_ic_op.mjs
 */
function stampOpAmp(G, rhs, no, np, nn, n, v, gain, vcc, vee, nodeOutIdx) {
  const gOut = 1e-2;
  const A = gain;
  G[no * n + no] += gOut;
  G[no * n + np] -= gOut * A;
  G[no * n + nn] += gOut * A;
  const vOut = v[nodeOutIdx] || 0;
  const vSatLo = vee + 0.1;
  const vSatHi = Math.max(vSatLo + 0.2, vcc - 1.5);
  if (vOut < vSatLo) {
    const over = Math.min(vSatLo - vOut, 3);
    const gd = 0.5 + 20 * over;
    G[no * n + no] += gd;
    rhs[no] += gd * vSatLo;
  } else if (vOut > vSatHi) {
    const over = Math.min(vOut - vSatHi, 3);
    const gd = 0.5 + 20 * over;
    G[no * n + no] += gd;
    rhs[no] += gd * vSatHi;
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
      if (v > max) { max = v; piv = i; }
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

function solveChain() {
  const NNODE = 6;
  const n = NNODE + 1;
  const v = new Array(NNODE).fill(0);
  v[1] = 0.2;
  let ok = false;
  let last = 0;
  for (let iter = 0; iter < 40; iter++) {
    last = iter;
    const G = new Array(n * n).fill(0);
    const rhs = new Array(n).fill(0);
    for (let i = 1; i < NNODE; i++) G[i * n + i] += 1e-9;
    stampOpAmp(G, rhs, 2, 1, 2, n, v, 1e4, 5, 0, 2);
    stampOpAmp(G, rhs, 3, 2, 3, n, v, 1e4, 5, 0, 3);
    stampG(G, 5, 4, 1 / 1e5, n);
    stampG(G, 4, 0, 1 / 1e4, n);
    stampOpAmp(G, rhs, 5, 3, 4, n, v, 1e4, 5, 0, 5);
    stampG(G, 5, 0, 1 / 1e7, n);
    const row = NNODE;
    G[row * n + 1] += 1; G[1 * n + row] += 1;
    G[row * n + 0] -= 1; G[0 * n + row] -= 1;
    rhs[row] = 0.2;
    G[0] = 1;
    for (let j = 1; j < n; j++) G[j] = 0;
    rhs[0] = 0;
    const sol = luSolve(G, rhs, n);
    if (!sol) return { ok: false, last, err: 'singular' };
    let maxd = 0;
    for (let i = 0; i < NNODE; i++) {
      maxd = Math.max(maxd, Math.abs(sol[i] - v[i]));
      v[i] = sol[i];
    }
    v[1] = 0.2;
    if (maxd < 1e-5) { ok = true; break; }
  }
  return { ok, last, o1: v[2], o2: v[3], M1: v[5], expect: 2.2 };
}

function solveLabAmp() {
  const n = 5;
  const v = new Array(4).fill(0);
  v[1] = 0.2;
  let ok = false;
  let last = 0;
  for (let iter = 0; iter < 40; iter++) {
    last = iter;
    const G = new Array(n * n).fill(0);
    const rhs = new Array(n).fill(0);
    for (let i = 1; i < 4; i++) G[i * n + i] += 1e-9;
    stampG(G, 3, 2, 1 / 1e5, n);
    stampG(G, 2, 0, 1 / 1e4, n);
    stampOpAmp(G, rhs, 3, 1, 2, n, v, 1e4, 5, 0, 3);
    const row = 4;
    G[row * n + 1] += 1; G[1 * n + row] += 1;
    G[row * n + 0] -= 1; G[0 * n + row] -= 1;
    rhs[row] = 0.2;
    G[0] = 1;
    for (let j = 1; j < n; j++) G[j] = 0;
    rhs[0] = 0;
    const sol = luSolve(G, rhs, n);
    if (!sol) return { ok: false, err: 'singular' };
    let maxd = 0;
    for (let i = 0; i < 4; i++) {
      maxd = Math.max(maxd, Math.abs(sol[i] - v[i]));
      v[i] = sol[i];
    }
    v[1] = 0.2;
    if (maxd < 1e-5) { ok = true; break; }
  }
  return { ok, last, Vout: v[3], expect: 2.2 };
}

const chain = solveChain();
const amp = solveLabAmp();
console.log('chain', chain);
console.log('lab_amp', amp);
if (!chain.ok || Math.abs(chain.M1 - 2.2) > 0.05) {
  console.error('FAIL analog_ic chain');
  process.exit(1);
}
if (!amp.ok || Math.abs(amp.Vout - 2.2) > 0.05) {
  console.error('FAIL lab_amp');
  process.exit(1);
}
console.log('PASS');
