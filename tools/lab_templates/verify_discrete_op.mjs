/**
 * lab_discrete-like DC OP — mirrors AnalogEngine after companion/gm/pnLim fixes.
 * Usage: node tools/lab_templates/verify_discrete_op.mjs
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

const EXP_CLAMP = 40;

function stampDiode(G, rhs, ni, nj, n, v, d) {
  const vdRaw = (v[ni] ?? 0) - (v[nj] ?? 0);
  const vThermal = d.n * d.vt;
  // Cap forward evaluation so exp never latches at EXP_CLAMP during early Newton
  const vdMax = d.n * (d.is < 1e-16 ? 1.4 : 0.85);
  const vd = Math.max(-5, Math.min(vdRaw, vdMax));
  let id, gd;
  if (vd > -10 * vThermal) {
    const expArg = Math.min(vd / vThermal, EXP_CLAMP);
    id = d.is * (Math.exp(expArg) - 1);
    gd = d.is * Math.exp(expArg) / vThermal;
  } else {
    id = -d.is;
    gd = 1e-12;
  }
  if (d.rs > 0 && gd > 0) {
    const denom = 1 + gd * d.rs;
    gd /= denom;
    id /= denom;
  }
  gd = Math.max(gd, 1e-12);
  stampG(G, ni, nj, gd, n);
  const ieq = id - gd * vd;
  rhs[ni] -= ieq;
  rhs[nj] += ieq;
}

function stampBjt(G, rhs, nc, nb, ne, n, v, bjt) {
  const vb = v[nb] ?? 0;
  const ve = v[ne] ?? 0;
  const vc = v[nc] ?? 0;
  const vt = bjt.nf * 0.02585;
  const alpha = bjt.bf / (bjt.bf + 1);
  const pnp = bjt.type === 'pnp';
  let vbe = pnp ? (ve - vb) : (vb - ve);
  let vbc = pnp ? (vc - vb) : (vb - vc);
  vbe = Math.max(-5, Math.min(vbe, 0.85));
  vbc = Math.max(-5, Math.min(vbc, 0.85));

  let ibe, gbe, ibc, gbc;
  if (vbe > -10 * vt) {
    const e = Math.exp(Math.min(vbe / vt, EXP_CLAMP));
    ibe = (bjt.is / bjt.bf) * (e - 1);
    gbe = (bjt.is / bjt.bf) * e / vt;
  } else {
    ibe = -bjt.is / bjt.bf;
    gbe = 1e-12;
  }
  if (vbc > -10 * vt) {
    const e = Math.exp(Math.min(vbc / vt, EXP_CLAMP));
    ibc = bjt.is * (e - 1);
    gbc = bjt.is * e / vt;
  } else {
    ibc = -bjt.is;
    gbc = 1e-12;
  }
  gbe = Math.max(gbe, 1e-12);
  gbc = Math.max(gbc, 1e-12);
  const expBe = Math.exp(Math.min(Math.max(vbe / vt, -40), EXP_CLAMP));
  const It = alpha * bjt.is * (expBe - 1);
  const gm = Math.max(alpha * bjt.is * expBe / vt, 0);
  const ieqbe = ibe - gbe * vbe;
  const ieqbc = ibc - gbc * vbc;
  const ieqt = It - gm * vbe;

  if (!pnp) {
    stampG(G, nb, ne, gbe, n);
    stampG(G, nb, nc, gbc, n);
    rhs[nb] -= ieqbe + ieqbc;
    rhs[ne] += ieqbe;
    rhs[nc] += ieqbc;
    G[nc * n + nb] += gm;
    G[nc * n + ne] -= gm;
    G[ne * n + nb] -= gm;
    G[ne * n + ne] += gm;
    rhs[nc] -= ieqt;
    rhs[ne] += ieqt;
  } else {
    stampG(G, ne, nb, gbe, n);
    stampG(G, nc, nb, gbc, n);
    rhs[ne] -= ieqbe;
    rhs[nb] += ieqbe;
    rhs[nc] -= ieqbc;
    rhs[nb] += ieqbc;
    G[ne * n + ne] += gm;
    G[ne * n + nb] -= gm;
    G[nc * n + ne] -= gm;
    G[nc * n + nb] += gm;
    rhs[ne] -= ieqt;
    rhs[nc] += ieqt;
  }
}

function stampMos(G, rhs, nd, ng, ns, n, v, mos) {
  const vd = v[nd] ?? 0;
  const vg = v[ng] ?? 0;
  const vs = v[ns] ?? 0;
  const vgs = vg - vs;
  const vds = Math.max(vd - vs, 0);
  const vt = Math.abs(mos.vto);
  const k = Math.max(mos.kp * (mos.w / Math.max(mos.l, 1e-6)), 1e-4);
  let id = 0, gm = 0, gds = 1e-9;
  if (vgs > vt) {
    const von = vgs - vt;
    if (vds < von) {
      id = k * (von * vds - 0.5 * vds * vds) * (1 + mos.lambda * vds);
      gm = k * vds;
      gds = Math.max(k * (von - vds) + k * mos.lambda * (von * vds - 0.5 * vds * vds), 1e-6);
    } else {
      id = 0.5 * k * von * von * (1 + mos.lambda * vds);
      gm = k * von;
      gds = Math.max(0.5 * k * von * von * mos.lambda, 1e-6);
    }
  }
  stampG(G, nd, ns, gds, n);
  const id0 = id - gm * vgs - gds * vds;
  // Correct gm polarity (previous engine sign was inverted → drain runaway)
  G[nd * n + ng] += gm;
  G[nd * n + ns] -= gm;
  G[ns * n + ng] -= gm;
  G[ns * n + ns] += gm;
  rhs[nd] -= id0;
  rhs[ns] += id0;
}

function runFull() {
  const names = [
    '0', 'VCC',
    'NET_1', 'NET_3', 'NET_6', 'NET_8', 'NET_11', 'NET_14',
    'NET_18', 'NET_19', 'NET_20', 'NET_23', 'NET_25',
    'NET_29', 'NET_30', 'NET_31', 'NET_34', 'NET_36'
  ];
  const idx = Object.fromEntries(names.map((nm, i) => [nm, i]));
  const resistors = [
    ['VCC', 'NET_1', 1000], ['VCC', 'NET_3', 1000], ['VCC', 'NET_6', 1000],
    ['VCC', 'NET_8', 330], ['VCC', 'NET_11', 330], ['VCC', 'NET_14', 330],
    ['VCC', 'NET_18', 10000], ['VCC', 'NET_19', 330],
    ['0', 'NET_23', 10000], ['0', 'NET_25', 1000],
    ['VCC', 'NET_29', 10000], ['VCC', 'NET_30', 330],
    ['0', 'NET_34', 10000], ['VCC', 'NET_36', 330]
  ];
  const diodes = [
    { a: 'NET_1', k: '0', is: 1e-14, n: 1, vt: 0.02585, rs: 0.5 },
    { a: 'NET_3', k: '0', is: 1e-14, n: 1, vt: 0.02585, rs: 0.5 },
    { a: 'NET_6', k: '0', is: 1e-14, n: 1, vt: 0.02585, rs: 0.5 },
    { a: 'NET_8', k: '0', is: 1e-17, n: 2, vt: 0.02585, rs: 10 },
    { a: 'NET_11', k: '0', is: 1e-17, n: 2, vt: 0.02585, rs: 10 },
    { a: 'NET_14', k: '0', is: 1e-17, n: 2, vt: 0.02585, rs: 10 },
    { a: 'NET_19', k: 'NET_20', is: 1e-17, n: 2, vt: 0.02585, rs: 10 },
    { a: 'NET_30', k: 'NET_31', is: 1e-17, n: 2, vt: 0.02585, rs: 10 }
  ];
  const bjts = [
    { c: 'NET_20', b: 'NET_18', e: '0', type: 'npn', is: 1e-14, bf: 200, nf: 1 },
    { c: 'NET_25', b: 'NET_23', e: 'VCC', type: 'pnp', is: 1e-14, bf: 200, nf: 1 }
  ];
  const moss = [
    { d: 'NET_31', g: 'NET_29', s: '0', kp: 0.05, vto: 1.5, lambda: 0.02, w: 1, l: 1 },
    { d: 'NET_36', g: 'NET_34', s: '0', kp: 0.05, vto: 1.5, lambda: 0.02, w: 1, l: 1 }
  ];

  const nNodes = names.length;
  const n = nNodes + 1;
  const v = new Array(nNodes).fill(0);
  v[idx.VCC] = 5;
  let converged = false;
  let iters = 0;

  for (let iter = 0; iter < 80; iter++) {
    iters = iter + 1;
    const G = new Array(n * n).fill(0);
    const rhs = new Array(n).fill(0);
    for (const [a, b, r] of resistors) stampG(G, idx[a], idx[b], 1 / r, n);
    // gmin to ground
    for (let i = 1; i < nNodes; i++) G[i * n + i] += 1e-9;
    for (const d of diodes) stampDiode(G, rhs, idx[d.a], idx[d.k], n, v, d);
    for (const q of bjts) stampBjt(G, rhs, idx[q.c], idx[q.b], idx[q.e], n, v, q);
    for (const m of moss) stampMos(G, rhs, idx[m.d], idx[m.g], idx[m.s], n, v, m);

    const row = nNodes;
    G[idx.VCC * n + row] = 1;
    G[idx['0'] * n + row] = -1;
    G[row * n + idx.VCC] = 1;
    G[row * n + idx['0']] = -1;
    rhs[row] = 5;
    for (let j = 0; j < n; j++) G[idx['0'] * n + j] = 0;
    G[idx['0'] * n + idx['0']] = 1;
    rhs[idx['0']] = 0;

    const x = luSolve(G, rhs, n);
    if (!x) {
      console.log('SINGULAR at', iters);
      process.exit(1);
    }
    let maxDelta = 0;
    for (let i = 0; i < nNodes; i++) maxDelta = Math.max(maxDelta, Math.abs(x[i] - v[i]));
    if (maxDelta < 1e-5) {
      for (let i = 0; i < nNodes; i++) v[i] = x[i];
      converged = true;
      break;
    }
    // Adaptive damp: full Newton once close; hard-limit early junction steps
    const damp = maxDelta < 1e-2 ? 1.0 : 0.6;
    const stepLim = maxDelta < 0.1 ? 2.0 : 0.4;
    for (let i = 0; i < nNodes; i++) {
      let delta = x[i] - v[i];
      if (delta > stepLim) delta = stepLim;
      if (delta < -stepLim) delta = -stepLim;
      v[i] = v[i] + damp * delta;
      if (v[i] > 15) v[i] = 15;
      if (v[i] < -15) v[i] = -15;
    }
    v[idx['0']] = 0;
    v[idx.VCC] = 5;
  }

  const show = ['NET_1', 'NET_8', 'NET_14', 'NET_18', 'NET_19', 'NET_20', 'NET_23', 'NET_25', 'NET_30', 'NET_31', 'NET_36'];
  console.log(converged ? 'OK' : 'FAIL', 'iters=' + iters);
  console.log(show.map((nm) => `${nm}=${v[idx[nm]].toFixed(3)}`).join('  '));
  process.exit(converged ? 0 : 1);
}

runFull();
