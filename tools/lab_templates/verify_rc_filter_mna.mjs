/**
 * Standalone verification of fixed RC-filter MNA companions
 * (mirrors AnalogEngine trapezoidal + OP seed + ground reassert).
 *
 * Circuit: VAC(1.5±0.5@1kHz) - R(1k) - node2 - C(100n) - GND
 *                          node2 - (ideal follower) → node3 - 10M → GND
 */
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

function stampG(G, ni, nj, g, n) {
  G[ni * n + ni] += g;
  G[nj * n + nj] += g;
  G[ni * n + nj] -= g;
  G[nj * n + ni] -= g;
}

// Nodes: 0=GND, 1=NET1, 2=NET2, 3=NET3  + two voltage sources (VAC, VCC)
// Simplified follower: force NET3 = NET2 via huge G (ideal buffer)
const NODE = 4; // 0..3
const VS = 2;
const N = NODE + VS;

function solveStep({ vac, vcc, R, Rm, C, dt, capV, capI, inTran }) {
  const G = new Array(N * N).fill(0);
  const rhs = new Array(N).fill(0);
  // R: NET1-NET2
  stampG(G, 1, 2, 1 / R, N);
  // Voltmeter 10M: NET3-GND
  stampG(G, 3, 0, 1 / Rm, N);
  // Ideal buffer NET2→NET3
  stampG(G, 2, 3, 1e3, N);

  let geq = 0, ieq = 0;
  if (inTran && C > 0 && dt > 0) {
    geq = Math.min(2 * C / dt, 1e8);
    const J = geq * capV + capI;
    ieq = -J;
    stampG(G, 2, 0, geq, N);
    rhs[2] -= ieq;
    rhs[0] += ieq;
  }

  // VAC between NET1 and 0
  const rowVac = NODE;
  G[1 * N + rowVac] = 1;
  G[0 * N + rowVac] = -1;
  G[rowVac * N + 1] = 1;
  G[rowVac * N + 0] = -1;
  rhs[rowVac] = vac;
  // VCC unused in this reduced circuit but keep size; tie dummy
  const rowVcc = NODE + 1;
  G[rowVcc * N + rowVcc] = 1;
  rhs[rowVcc] = 0;

  // Re-assert ground
  for (let j = 0; j < N; j++) G[0 * N + j] = 0;
  G[0 * N + 0] = 1;
  rhs[0] = 0;

  const x = luSolve(G, rhs, N);
  if (!x) throw new Error('singular');
  return { v: x, geq, ieq };
}

const R = 1000, C = 100e-9, Rm = 10e6;
const dt = 1e-6;
const amp = 0.5, offset = 1.5, f = 1000;

// OP (C open)
let { v } = solveStep({ vac: offset, vcc: 5, R, Rm, C, dt, capV: 0, capI: 0, inTran: false });
let capV = v[2] - v[0];
let capI = 0;
console.log(`OP: NET1=${v[1].toFixed(4)} NET2=${v[2].toFixed(4)} NET3=${v[3].toFixed(4)} (expect ~1.5)`);
if (Math.abs(v[2] - 1.5) > 0.01) {
  console.error('FAIL OP');
  process.exit(1);
}

let sumOut = 0;
let maxIc = 0;
const steps = 5000; // 5 ms
for (let k = 1; k <= steps; k++) {
  const t = k * dt;
  const vac = offset + amp * Math.sin(2 * Math.PI * f * t);
  const sol = solveStep({ vac, vcc: 5, R, Rm, C, dt, capV, capI, inTran: true });
  v = sol.v;
  const vNow = v[2] - v[0];
  const iNow = sol.geq * vNow + sol.ieq;
  capV = vNow;
  capI = iNow;
  maxIc = Math.max(maxIc, Math.abs(iNow));
  sumOut += v[3];
}
const avg = sumOut / steps;
const wRC = 2 * Math.PI * f * R * C;
const hMag = 1 / Math.sqrt(1 + wRC * wRC);
const expectAcPk = amp * hMag;
console.log(`TRAN: avg(NET3)=${avg.toFixed(4)}V (expect ~1.5)`);
console.log(`TRAN: |Ic|_max=${(maxIc * 1000).toFixed(3)}mA (expect <~ few mA)`);
console.log(`TRAN: last NET2=${v[2].toFixed(4)} NET3=${v[3].toFixed(4)} |H|@1kHz=${hMag.toFixed(3)} Vac_pk≈${expectAcPk.toFixed(3)}`);

let fail = false;
if (Math.abs(avg - 1.5) > 0.05) { console.error('FAIL avg'); fail = true; }
if (maxIc > 0.05) { console.error('FAIL Ic explosion'); fail = true; }
if (fail) process.exit(1);
console.log('PASS');
