function luSolve(a, b, n) {
  const A = a.slice(), x = b.slice(), idx = Array.from({ length: n }, (_, i) => i);
  for (let k = 0; k < n; k++) {
    let piv = k, max = Math.abs(A[idx[k] * n + k]);
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

function newton(damp, limitJunction) {
  const nN = 3, n = 4; // 0 gnd, 1 vcc, 2 anode
  let v = [0, 5, 0];
  const is = 1e-14, nIdeality = 1, vt = 0.02585, rs = 0.5, R = 1000;
  for (let iter = 0; iter < 40; iter++) {
    const G = Array(n * n).fill(0);
    const rhs = Array(n).fill(0);
    stampG(G, 1, 2, 1 / R, n);
    let vd = v[2] - v[0];
    if (limitJunction) vd = Math.min(vd, 0.9);
    const expArg = Math.min(vd / (nIdeality * vt), 40);
    let id = is * (Math.exp(expArg) - 1);
    let gd = is * Math.exp(expArg) / (nIdeality * vt);
    if (rs > 0) {
      const denom = 1 + gd * rs;
      gd /= denom; id /= denom;
    }
    stampG(G, 2, 0, Math.max(gd, 1e-12), n);
    const ieq = id - gd * (v[2] - v[0]); // use actual node vd for Ieq
    rhs[2] -= ieq; rhs[0] += ieq;
    const row = 3;
    G[1 * n + row] = 1; G[0 * n + row] = -1;
    G[row * n + 1] = 1; G[row * n + 0] = -1; rhs[row] = 5;
    for (let j = 0; j < n; j++) G[0 * n + j] = 0;
    G[0 * n + 0] = 1; rhs[0] = 0;
    const x = luSolve(G, rhs, n);
    if (!x) return `singular@${iter}`;
    const d = Math.abs(x[2] - v[2]);
    if (iter < 8 || d < 1e-4) {
      console.log(`  it ${iter}: Va ${v[2].toFixed(6)} -> ${x[2].toFixed(6)} d=${d.toExponential(2)}`);
    }
    if (d < 1e-5) return `OK Va=${x[2].toFixed(4)} iters=${iter + 1}`;
    v[2] = v[2] + damp * (x[2] - v[2]);
    if (limitJunction && v[2] > 0.9) v[2] = 0.9;
    v[0] = 0; v[1] = 5;
  }
  return `FAIL Va=${v[2].toFixed(4)}`;
}

console.log('damp1', newton(1, false));
console.log('damp0.55', newton(0.55, false));
console.log('damp1+lim', newton(1, true));
console.log('damp0.55+lim', newton(0.55, true));
