/** Isolate NMOS+R and LED+R OP companions */
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
  G[ni * n + ni] += g; G[nj * n + nj] += g;
  G[ni * n + nj] -= g; G[nj * n + ni] -= g;
}

function stampMosEngine(G, rhs, nd, ng, ns, n, v, signFlip) {
  const vd = v[nd], vg = v[ng], vs = v[ns];
  const vgs = vg - vs;
  const vds = Math.max(vd - vs, 0);
  const vt = 1.5, k = 0.05, lambda = 0.02;
  let id = 0, gm = 0, gds = 1e-9;
  if (vgs > vt) {
    const von = vgs - vt;
    if (vds < von) {
      id = k * (von * vds - 0.5 * vds * vds) * (1 + lambda * vds);
      gm = k * vds;
      gds = Math.max(k * (von - vds) + k * lambda * (von * vds - 0.5 * vds * vds), 1e-6);
    } else {
      id = 0.5 * k * von * von * (1 + lambda * vds);
      gm = k * von;
      gds = Math.max(0.5 * k * von * von * lambda, 1e-6);
    }
  }
  stampG(G, nd, ns, gds, n);
  const id0 = id - gm * vgs - gds * vds;
  if (signFlip) {
    G[nd * n + ng] += gm; G[nd * n + ns] -= gm;
    G[ns * n + ng] -= gm; G[ns * n + ns] += gm;
  } else {
    // current AnalogEngine
    G[nd * n + ng] -= gm; G[nd * n + ns] += gm;
    G[ns * n + ng] += gm; G[ns * n + ns] -= gm;
  }
  rhs[nd] -= id0; rhs[ns] += id0;
}

function run(label, signFlip) {
  // 0=gnd 1=vcc 2=drain  + vsrc
  const nN = 3, n = 4;
  let v = [0, 5, 2.5];
  v[1] = 5;
  for (let iter = 0; iter < 60; iter++) {
    const G = Array(n * n).fill(0);
    const rhs = Array(n).fill(0);
    stampG(G, 1, 2, 1 / 330, n); // RD
    // Gate tied to VCC: use node 1 as gate
    stampMosEngine(G, rhs, 2, 1, 0, n, v, signFlip);
    const row = 3;
    G[1 * n + row] = 1; G[0 * n + row] = -1;
    G[row * n + 1] = 1; G[row * n + 0] = -1; rhs[row] = 5;
    for (let j = 0; j < n; j++) G[0 * n + j] = 0;
    G[0 * n + 0] = 1; rhs[0] = 0;
    const x = luSolve(G, rhs, n);
    if (!x) { console.log(label, 'singular'); return; }
    let d = 0;
    for (let i = 0; i < nN; i++) d = Math.max(d, Math.abs(x[i] - v[i]));
    if (d < 1e-5) {
      console.log(label, 'OK Vd=', x[2].toFixed(4), 'iters', iter + 1);
      return;
    }
    for (let i = 0; i < nN; i++) v[i] += 0.55 * (x[i] - v[i]);
    v[0] = 0; v[1] = 5;
  }
  console.log(label, 'FAIL Vd=', v[2].toFixed(4));
}

run('engine-sign', false);
run('flipped-gm', true);

// Diode only R+LED
function stampDiode(G, rhs, ni, nj, n, v) {
  const vd = v[ni] - v[nj];
  const vt = 2 * 0.02585;
  const is = 1e-20;
  const expArg = Math.min(vd / vt, 50);
  let id = is * (Math.exp(expArg) - 1);
  let gd = is * Math.exp(expArg) / vt;
  const denom = 1 + gd * 10;
  gd /= denom; id /= denom;
  stampG(G, ni, nj, Math.max(gd, 1e-12), n);
  const ieq = id - gd * vd;
  rhs[ni] -= ieq; rhs[nj] += ieq;
}
function runLed() {
  const nN = 3, n = 4;
  let v = [0, 5, 0];
  for (let iter = 0; iter < 60; iter++) {
    const G = Array(n * n).fill(0);
    const rhs = Array(n).fill(0);
    stampG(G, 1, 2, 1 / 330, n);
    stampDiode(G, rhs, 2, 0, n, v);
    const row = 3;
    G[1 * n + row] = 1; G[0 * n + row] = -1;
    G[row * n + 1] = 1; G[row * n + 0] = -1; rhs[row] = 5;
    for (let j = 0; j < n; j++) G[0 * n + j] = 0;
    G[0 * n + 0] = 1; rhs[0] = 0;
    const x = luSolve(G, rhs, n);
    if (!x) { console.log('LED singular'); return; }
    let d = 0;
    for (let i = 0; i < nN; i++) d = Math.max(d, Math.abs(x[i] - v[i]));
    if (d < 1e-5) {
      console.log('LED OK Va=', x[2].toFixed(4), 'iters', iter + 1);
      return;
    }
    for (let i = 0; i < nN; i++) v[i] += 0.55 * (x[i] - v[i]);
    v[0] = 0; v[1] = 5;
  }
  console.log('LED FAIL Va=', v[2].toFixed(4));
}
runLed();
