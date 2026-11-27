/* rsm.js — Metodología de superficie de respuesta (sin dependencias, usa Stats)
   Diseños central compuesto (CCC, CCI, CCF) y Box-Behnken; ajuste del modelo de
   segundo orden, ANOVA con falta de ajuste, análisis canónico, análisis de cresta,
   optimización en la región y método de la pendiente ascendente/descendente. */
(function (G) {
  'use strict';
  const S = G.Stats || (typeof require !== 'undefined' ? require('./stats.js') : null);
  const R = {};
  R.L = 'ABCDEFGH'.split('');

  /* ============================================================ diseños */
  /** Puntos factoriales ±1 en orden estándar (A cambia más rápido). half: media fracción con la última letra = producto de las demás */
  R.factorialPoints = function (k, half) {
    const kb = half ? k - 1 : k; const pts = [];
    for (let i = 0; i < (1 << kb); i++) {
      const x = []; for (let j = 0; j < kb; j++) x.push(i >> j & 1 ? 1 : -1);
      if (half) x.push(x.reduce((p, v) => p * v, 1));
      pts.push(x);
    }
    return pts;
  };

  /** Distancia axial α del diseño central compuesto (escala de los puntos factoriales = ±1) */
  R.alphaCCD = function ({ k, F, kind, nc, ncf, nca }) {
    if (kind === 'rot') return Math.pow(F, 0.25);
    if (kind === 'orth') { const Q = Math.pow(Math.sqrt(F + 2 * k + nc) - Math.sqrt(F), 2); return Math.pow(Q * F / 4, 0.25); }
    if (kind === 'block') return Math.sqrt(F * (2 * k + nca) / (2 * (F + ncf)));
    if (kind === 'face') return 1;
    throw new Error('Tipo de α desconocido.');
  };

  R.defaultCenters = function (type, k, half, blocks) {
    if (type === 'bbd') return { nc: k <= 4 ? 3 : 6 };
    if (blocks === 2) return k === 2 ? { ncf: 3, nca: 3 } : { ncf: 4, nca: 2 };
    const t = { 2: 5, 3: 6, 4: 7, 5: half ? 6 : 10, 6: half ? 9 : 15 };
    return { nc: t[k] || 6 };
  };

  /**
   * Diseño central compuesto.
   * o: {k, half, variant:'ccc'|'cci'|'ccf', alphaKind:'rot'|'orth'|'block'|'custom', alphaCustom, blocks:1|2, nc, ncf, nca}
   * Devuelve las corridas en unidades codificadas: ±1 corresponde a los niveles bajo/alto que captura el usuario.
   */
  R.ccd = function (o) {
    const k = o.k; if (!(k >= 2 && k <= 6)) throw new Error('El diseño central compuesto admite de 2 a 6 factores.');
    const half = !!o.half && k >= 5; const fp = R.factorialPoints(k, half); const F = fp.length;
    const blocks = o.blocks === 2 ? 2 : 1;
    const ncf = blocks === 2 ? Math.max(0, o.ncf | 0) : 0, nca = blocks === 2 ? Math.max(0, o.nca | 0) : 0;
    const nc = blocks === 2 ? ncf + nca : Math.max(0, o.nc | 0);
    let alpha;
    if (o.variant === 'ccf') alpha = 1;
    else if (o.alphaKind === 'custom') { alpha = +o.alphaCustom; if (!(alpha > 0)) throw new Error('Indique un α mayor que cero.'); }
    else { if (o.alphaKind === 'block' && blocks !== 2) throw new Error('El α de bloqueo ortogonal requiere dos bloques.'); alpha = R.alphaCCD({ k, F, kind: o.alphaKind, nc, ncf, nca }); }
    const sc = o.variant === 'cci' ? 1 / alpha : 1;      // inscrito: los axiales quedan en ±1
    const runs = []; let std = 0;
    const add = (x, type, block) => runs.push({ std: ++std, block, type, x: x.map(v => Math.round(v * sc * 1e12) / 1e12) });
    fp.forEach(x => add(x, 1, 1));
    if (blocks === 2) for (let i = 0; i < ncf; i++) add(new Array(k).fill(0), 0, 1);
    const b2 = blocks === 2 ? 2 : 1;
    for (let j = 0; j < k; j++) for (const s of [-1, 1]) { const x = new Array(k).fill(0); x[j] = s * alpha; add(x, -1, b2); }
    for (let i = 0; i < (blocks === 2 ? nca : nc); i++) add(new Array(k).fill(0), 0, b2);
    return { kind: 'ccd', k, half, F, alpha, axial: alpha * sc, factorialLevel: sc, variant: o.variant, alphaKind: o.variant === 'ccf' ? 'face' : o.alphaKind, blocks, nc, ncf, nca, runs };
  };

  /** Conjuntos de factores que varían juntos en el diseño de Box-Behnken (Box y Behnken, 1960) */
  R.BBD_SETS = {
    3: [[0, 1], [0, 2], [1, 2]],
    4: [[0, 1], [2, 3], [0, 3], [1, 2], [0, 2], [1, 3]],
    5: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]],
    6: [[0, 1, 3], [1, 2, 4], [2, 3, 5], [0, 3, 4], [1, 4, 5], [0, 2, 5]],
    7: [[3, 4, 5], [0, 5, 6], [1, 4, 6], [0, 1, 3], [2, 3, 6], [0, 2, 4], [1, 2, 5]]
  };
  R.bbd = function (o) {
    const k = o.k; const sets = R.BBD_SETS[k]; if (!sets) throw new Error('El diseño de Box-Behnken admite de 3 a 7 factores.');
    const runs = []; let std = 0;
    sets.forEach(set => {
      const m = set.length;
      for (let i = 0; i < (1 << m); i++) { const x = new Array(k).fill(0); set.forEach((f, t) => { x[f] = i >> t & 1 ? 1 : -1; }); runs.push({ std: ++std, block: 1, type: 2, x }); }
    });
    const nc = Math.max(0, o.nc | 0);
    for (let i = 0; i < nc; i++) runs.push({ std: ++std, block: 1, type: 0, x: new Array(k).fill(0) });
    return { kind: 'bbd', k, nc, blocks: 1, runs, alpha: 1, axial: 1, factorialLevel: 1 };
  };

  /** Asigna orden de corrida (aleatorio dentro de bloque si rand) */
  R.randomize = function (des, rand, seed) {
    const rng = S.rng(seed == null ? 2026 : seed); let run = 0;
    const blocks = [...new Set(des.runs.map(r => r.block))].sort((a, b) => a - b);
    blocks.forEach(b => {
      const rs = des.runs.filter(r => r.block === b);
      if (rand) for (let i = rs.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [rs[i], rs[j]] = [rs[j], rs[i]]; }
      rs.forEach(r => { r.run = ++run; });
    });
    return des;
  };

  /* ============================================================ términos */
  R.fullTerms = function (k) {
    const t = [];
    for (let i = 0; i < k; i++) t.push({ type: 'lin', i });
    for (let i = 0; i < k; i++) t.push({ type: 'sq', i });
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) t.push({ type: 'int', i, j });
    return t;
  };
  R.termKey = t => t.type === 'lin' ? 'L' + t.i : t.type === 'sq' ? 'Q' + t.i : 'I' + t.i + '_' + t.j;
  R.termName = (t, names) => { const n = names || R.L; return t.type === 'lin' ? n[t.i] : t.type === 'sq' ? n[t.i] + '²' : n[t.i] + '·' + n[t.j]; };
  R.termVal = (t, x) => t.type === 'lin' ? x[t.i] : t.type === 'sq' ? x[t.i] * x[t.i] : x[t.i] * x[t.j];
  R.parseKey = key => key[0] === 'L' ? { type: 'lin', i: +key.slice(1) } : key[0] === 'Q' ? { type: 'sq', i: +key.slice(1) } : { type: 'int', i: +key.slice(1).split('_')[0], j: +key.split('_')[1] };
  /** Términos que faltan para que el modelo sea jerárquico */
  R.hierarchyMissing = function (terms) {
    const keys = new Set(terms.map(R.termKey)); const miss = new Set();
    terms.forEach(t => {
      if (t.type === 'sq' && !keys.has('L' + t.i)) miss.add('L' + t.i);
      if (t.type === 'int') { if (!keys.has('L' + t.i)) miss.add('L' + t.i); if (!keys.has('L' + t.j)) miss.add('L' + t.j); }
    });
    return [...miss].map(R.parseKey);
  };

  /* ============================================================ ajuste */
  function blockCols(block) {
    if (!block) return { levels: [], cols: [] };
    const lv = [...new Set(block)].sort((a, b) => String(a).localeCompare(String(b), 'es', { numeric: true }));
    if (lv.length < 2) return { levels: lv, cols: [] };
    const last = lv[lv.length - 1]; const cols = [];
    for (let b = 0; b < lv.length - 1; b++) cols.push(block.map(v => (v === lv[b] ? 1 : v === last ? -1 : 0)));
    return { levels: lv, cols };
  }

  /**
   * Ajuste por mínimos cuadrados del modelo polinomial en unidades codificadas.
   * data: {X: filas codificadas, y, block|null}; terms: arreglo de términos; opts: {alpha, blocks}
   */
  R.fit = function (data, terms, opts) {
    opts = Object.assign({ alpha: 0.05, blocks: true }, opts || {});
    const X = data.X, y = data.y, n = y.length, k = X[0].length;
    const useB = opts.blocks && data.block && new Set(data.block).size > 1;
    const bc = useB ? blockCols(data.block) : { levels: [], cols: [] };
    const cols = [new Array(n).fill(1)], info = [{ kind: 'int', name: 'Constante' }];
    bc.cols.forEach((c, b) => { cols.push(c); info.push({ kind: 'block', name: 'Bloque ' + bc.levels[b] }); });
    terms.forEach(t => { cols.push(X.map(x => R.termVal(t, x))); info.push({ kind: 'term', term: t, key: R.termKey(t), name: R.termName(t) }); });
    const ls = S.lsfit(cols, y, 1e-9);
    if (ls.kept.length < cols.length) {
      const lost = cols.map((_, j) => j).filter(j => !ls.kept.includes(j)).map(j => info[j].name);
      throw new Error(`El diseño no permite estimar: ${lost.join(', ')}. Elimine esos términos o agregue corridas (p. ej., puntos axiales o centrales).`);
    }
    const p = ls.rank, dfE = n - p, sse = ls.rss, mse = dfE > 0 ? sse / dfE : NaN;
    const ybar = S.mean(y); let sst = 0; for (const v of y) sst += (v - ybar) ** 2;
    const tcrit = dfE > 0 ? S.tinv(1 - opts.alpha / 2, dfE) : NaN;
    const coefs = info.map((inf, j) => {
      const b = ls.b[j], vjj = ls.V[j][j], se = Math.sqrt(mse * vjj), t = b / se;
      let vif = NaN;
      if (j > 0) { const c = cols[j], m = S.mean(c); let ss = 0; for (const v of c) ss += (v - m) ** 2; vif = vjj * ss; }
      return Object.assign({}, inf, { coef: b, se, t, p: dfE > 0 ? S.tp2(t, dfE) : NaN, lo: b - tcrit * se, hi: b + tcrit * se, vif, vjj });
    });
    // SC ajustadas por grupos: diferencia de SSE entre el modelo completo y el reducido
    const sseWithout = drop => { const keep = cols.filter((_, j) => !drop.includes(j)); return S.lsfit(keep, y, 1e-9).rss; };
    const idxOf = pred => info.map((inf, j) => (pred(inf) ? j : -1)).filter(j => j >= 0);
    const row = (source, idx, level) => {
      const df = idx.length; if (!df) return null;
      const ss = Math.max(0, sseWithout(idx) - sse); const ms = ss / df; const F = dfE > 0 ? ms / mse : NaN;
      return { source, df, ss, ms, F, p: isFinite(F) ? S.fsf(F, df, dfE) : NaN, level };
    };
    const anova = [];
    const ib = idxOf(i => i.kind === 'block'); if (ib.length) anova.push(row('Bloques', ib, 0));
    const it = idxOf(i => i.kind === 'term');
    const mRow = row('Modelo', it, 0); if (mRow) anova.push(mRow);
    [['lin', 'Lineal'], ['sq', 'Cuadrático'], ['int', 'Interacción de 2 factores']].forEach(([ty, lab]) => {
      const idx = idxOf(i => i.kind === 'term' && i.term.type === ty); if (!idx.length) return;
      anova.push(row(lab, idx, 1));
      idx.forEach(j => { const c = coefs[j]; const ss = c.coef * c.coef / c.vjj; const F = dfE > 0 ? ss / mse : NaN; anova.push({ source: c.name, df: 1, ss, ms: ss, F, p: isFinite(F) ? S.fsf(F, 1, dfE) : NaN, level: 2 }); });
    });
    // error puro: corridas con la misma combinación codificada (y el mismo bloque cuando se modelan bloques)
    const groups = new Map();
    X.forEach((x, t) => { const key = x.map(v => Math.round(v * 1e8)).join(',') + (useB ? '|' + data.block[t] : ''); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(y[t]); });
    let sspe = 0, dfPE = 0; groups.forEach(g => { if (g.length > 1) { const m = S.mean(g); g.forEach(v => { sspe += (v - m) ** 2; }); dfPE += g.length - 1; } });
    const dfLOF = dfE - dfPE, sslof = Math.max(0, sse - sspe);
    anova.push({ source: 'Error residual', df: dfE, ss: sse, ms: mse, level: 0, kind: 'err' });
    let lof = null;
    if (dfPE > 0 && dfLOF > 0) {
      const msl = sslof / dfLOF, mspe = sspe / dfPE, F = msl / mspe;
      lof = { df: dfLOF, ss: sslof, ms: msl, F, p: mspe > 0 ? S.fsf(F, dfLOF, dfPE) : NaN, dfPE, sspe, mspe };
      anova.push({ source: 'Falta de ajuste', df: dfLOF, ss: sslof, ms: msl, F, p: lof.p, level: 1 });
      anova.push({ source: 'Error puro', df: dfPE, ss: sspe, ms: mspe, level: 1 });
    } else if (dfPE > 0) anova.push({ source: 'Error puro', df: dfPE, ss: sspe, ms: sspe / dfPE, level: 1 });
    anova.push({ source: 'Total', df: n - 1, ss: sst, level: 0, kind: 'tot' });
    let press = 0; for (let t = 0; t < n; t++) press += (ls.resid[t] / (1 - ls.lev[t])) ** 2;
    const summary = { n, p, dfE, sse, mse, s: Math.sqrt(mse), sst, r2: 1 - sse / sst, r2adj: dfE > 0 ? 1 - mse / (sst / (n - 1)) : NaN, press, r2pred: isFinite(press) ? 1 - press / sst : NaN, dfPE, sspe };
    return { k, terms: terms.slice(), info, coefs, anova, lof, summary, b: ls.b, V: ls.V, fitted: ls.fitted, resid: ls.resid, lev: ls.lev, nBlockCols: bc.cols.length, blockLevels: bc.levels, alpha: opts.alpha, tcrit, data };
  };

  /** Vector del modelo en un punto (bloques en su promedio: contrastes = 0) */
  R.modelRow = function (fit, x) {
    const v = [1]; for (let b = 0; b < fit.nBlockCols; b++) v.push(0);
    fit.terms.forEach(t => v.push(R.termVal(t, x))); return v;
  };
  R.predictFast = (fit, x) => S.dot(R.modelRow(fit, x), fit.b);
  R.predict = function (fit, x) {
    const f = R.modelRow(fit, x), yhat = S.dot(f, fit.b); const sm = fit.summary;
    let q = 0; for (let i = 0; i < f.length; i++) for (let j = 0; j < f.length; j++) q += f[i] * fit.V[i][j] * f[j];
    const se = Math.sqrt(sm.mse * q), sp = Math.sqrt(sm.mse * (1 + q)), tc = fit.tcrit;
    return { yhat, se, ci: [yhat - tc * se, yhat + tc * se], pi: [yhat - tc * sp, yhat + tc * sp], q };
  };

  /** Eliminación hacia atrás respetando jerarquía (no elimina efectos lineales mientras haya términos de orden superior que los contengan) */
  R.reduce = function (data, terms, opts) {
    let cur = terms.slice(); const removed = [];
    for (let it = 0; it < 60; it++) {
      const f = R.fit(data, cur, opts); if (f.summary.dfE <= 0) break;
      const cand = f.coefs.filter(c => c.kind === 'term' && c.p > opts.alpha && !(c.term.type === 'lin' && cur.some(t => (t.type === 'sq' && t.i === c.term.i) || (t.type === 'int' && (t.i === c.term.i || t.j === c.term.i)))));
      if (!cand.length || cur.length <= 1) break;
      const worst = cand.sort((a, b) => b.p - a.p)[0]; removed.push(worst.name);
      cur = cur.filter(t => R.termKey(t) !== worst.key);
    }
    return { terms: cur, removed };
  };

  /* ============================================================ álgebra */
  /** Valores y vectores propios de una matriz simétrica (Jacobi cíclico) */
  R.eigSym = function (M) {
    const n = M.length; const A = M.map(r => r.slice()); const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
      if (off < 1e-26) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let r = 0; r < n; r++) { const arp = A[r][p], arq = A[r][q]; A[r][p] = c * arp - s * arq; A[r][q] = s * arp + c * arq; }
        for (let r = 0; r < n; r++) { const apr = A[p][r], aqr = A[q][r]; A[p][r] = c * apr - s * aqr; A[q][r] = s * apr + c * aqr; }
        for (let r = 0; r < n; r++) { const vrp = V[r][p], vrq = V[r][q]; V[r][p] = c * vrp - s * vrq; V[r][q] = s * vrp + c * vrq; }
      }
    }
    const out = Array.from({ length: n }, (_, i) => {
      const v = V.map(r => r[i]); let big = 0; v.forEach((x, j) => { if (Math.abs(x) > Math.abs(v[big])) big = j; });
      const sg = v[big] < 0 ? -1 : 1; return { value: A[i][i], vector: v.map(x => x * sg) };
    });
    return out.sort((a, b) => b.value - a.value);
  };

  /** Coeficientes b (lineales) y B (cuadráticos) del modelo ajustado */
  R.quadParts = function (fit) {
    const k = fit.k; const b = new Array(k).fill(0); const B = Array.from({ length: k }, () => new Array(k).fill(0));
    let b0 = 0;
    fit.coefs.forEach(c => {
      if (c.kind === 'int') b0 = c.coef;
      if (c.kind !== 'term') return; const t = c.term;
      if (t.type === 'lin') b[t.i] = c.coef; else if (t.type === 'sq') B[t.i][t.i] = c.coef; else { B[t.i][t.j] = B[t.j][t.i] = c.coef / 2; }
    });
    return { b0, b, B };
  };

  /** Análisis canónico: punto estacionario x_s = −½ B⁻¹ b, ŷ_s y valores propios de B */
  R.canonical = function (fit) {
    const { b0, b, B } = R.quadParts(fit); const k = fit.k;
    const hasQuad = fit.terms.some(t => t.type !== 'lin');
    const eig = R.eigSym(B);
    if (!hasQuad) return { b0, b, B, eig, xs: null, nature: 'lineal', note: 'El modelo no tiene términos cuadráticos ni de interacción: no existe punto estacionario. Use la pendiente ascendente/descendente.' };
    const scale = Math.max(...eig.map(e => Math.abs(e.value)), 1e-300);
    const Bi = S.inv(B);
    const nearZero = eig.filter(e => Math.abs(e.value) < 0.05 * scale);
    let xs = null, ys = NaN;
    if (Bi && eig.every(e => Math.abs(e.value) > 1e-10 * scale)) {
      xs = Bi.map(r => -0.5 * S.dot(r, b)); ys = b0 + 0.5 * S.dot(xs, b);
    }
    const pos = eig.filter(e => e.value > 0).length, neg = eig.filter(e => e.value < 0).length;
    const nature = neg === k ? 'max' : pos === k ? 'min' : 'saddle';
    const dist = xs ? Math.sqrt(S.dot(xs, xs)) : NaN;
    return { b0, b, B, eig, xs, ys, nature, dist, ridge: nearZero.length > 0, nearZero };
  };

  /**
   * Análisis de cresta (Hoerl; Myers y Montgomery): para cada radio R, punto sobre la esfera |x| = R
   * con la respuesta máxima (dir=1) o mínima (dir=−1). x(μ) = −½ (B − μI)⁻¹ b.
   */
  R.ridge = function (fit, dir, radii) {
    const { b0, b, B } = R.quadParts(fit); const k = fit.k; const eig = R.eigSym(B);
    const proj = eig.map(e => S.dot(e.vector, b));
    const lamExt = dir > 0 ? eig[0].value : eig[eig.length - 1].value;
    const xOf = mu => { const x = new Array(k).fill(0); eig.forEach((e, i) => { const c = -0.5 * proj[i] / (e.value - mu); e.vector.forEach((v, j) => { x[j] += c * v; }); }); return x; };
    const rad = x => Math.sqrt(S.dot(x, x));
    const yOf = x => b0 + S.dot(b, x) + x.reduce((s, xi, i) => s + xi * S.dot(B[i], x), 0);
    const span = Math.max(1, ...eig.map(e => Math.abs(e.value)), Math.sqrt(S.dot(b, b)));
    return radii.map(Rr => {
      if (Rr === 0) { const x = new Array(k).fill(0); return { R: 0, mu: Infinity, x, y: yOf(x) }; }
      let near = lamExt + dir * 1e-10 * span; let xn = xOf(near);
      if (rad(xn) < Rr) {   // caso degenerado: falta componente sobre el vector propio extremo
        const ve = (dir > 0 ? eig[0] : eig[eig.length - 1]).vector; const r0 = rad(xn); const t = Math.sqrt(Math.max(0, Rr * Rr - r0 * r0));
        const x = xn.map((v, j) => v + t * ve[j]); const x2 = xn.map((v, j) => v - t * ve[j]);
        const best = dir * (yOf(x) - yOf(x2)) >= 0 ? x : x2; return { R: Rr, mu: lamExt, x: best, y: yOf(best) };
      }
      let lo = near, hi = lamExt + dir * span;
      while (rad(xOf(hi)) > Rr) hi = lamExt + (hi - lamExt) * 2;
      for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (rad(xOf(mid)) > Rr) lo = mid; else hi = mid; }
      const mu = (lo + hi) / 2, x = xOf(mu); return { R: Rr, mu, x, y: yOf(x) };
    });
  };

  /** Búsqueda del óptimo en una región (cubo |x_i| ≤ r o esfera |x| ≤ r): malla + búsqueda de patrón */
  R.optimize = function (fit, goal, target, region, r) {
    const k = fit.k; const score = x => { const y = R.predictFast(fit, x); return goal === 'max' ? y : goal === 'min' ? -y : -Math.abs(y - target); };
    const feas = x => { if (region === 'sphere') { const n = Math.sqrt(S.dot(x, x)); return n > r ? x.map(v => v * r / n) : x; } return x.map(v => Math.max(-r, Math.min(r, v))); };
    const lv = k <= 2 ? 41 : k === 3 ? 21 : k === 4 ? 11 : k === 5 ? 7 : 5;
    let best = null, idx = new Array(k).fill(0); const total = Math.pow(lv, k);
    for (let c = 0; c < total; c++) {
      let m = c; for (let j = 0; j < k; j++) { idx[j] = m % lv; m = Math.floor(m / lv); }
      let x = idx.map(i => -r + 2 * r * i / (lv - 1));
      if (region === 'sphere' && Math.sqrt(S.dot(x, x)) > r * (1 + 1e-9)) continue;
      const s = score(x); if (!best || s > best.s) best = { x, s };
    }
    let step = 2 * r / (lv - 1); let x = best.x.slice(), s = best.s;
    while (step > 1e-7 * r) {
      let moved = false;
      for (let j = 0; j < k; j++) for (const d of [-1, 1]) { const z = x.slice(); z[j] += d * step; const zf = feas(z); const sz = score(zf); if (sz > s + 1e-14) { x = zf; s = sz; moved = true; } }
      if (!moved) step /= 2;
    }
    return { x, y: R.predictFast(fit, x) };
  };

  /* ============================================================ pendiente ascendente */
  /**
   * Trayectoria de la pendiente ascendente (dir = +1) o descendente (dir = −1) a partir de un modelo de primer orden.
   * o: {b0, b:[coef. codificados], centers, halves, base, step (Δ del factor base, codificado), dir, nSteps, round (decimales o null)}
   * Δx_j = dir · b_j · step / |b_base|; Δξ_j = Δx_j · h_j (Montgomery, sección 11.2).
   */
  R.steepest = function (o) {
    const k = o.b.length; const bb = Math.abs(o.b[o.base]);
    if (!(bb > 0)) throw new Error('El coeficiente del factor base es cero: elija otro factor base.');
    if (!(o.step > 0)) throw new Error('El incremento del factor base debe ser mayor que cero.');
    const dx = o.b.map(bj => o.dir * bj * o.step / bb);
    let dxi = dx.map((d, j) => d * o.halves[j]);
    if (o.round != null && o.round !== '' && isFinite(o.round)) { const f = Math.pow(10, +o.round); dxi = dxi.map(v => Math.round(v * f) / f); }
    const dxc = dxi.map((v, j) => v / o.halves[j]);   // incremento codificado efectivo (después de redondear)
    const steps = [];
    for (let s = 0; s <= o.nSteps; s++) {
      const x = dxc.map(d => d * s), xi = x.map((v, j) => o.centers[j] + v * o.halves[j]);
      const yhat = o.b0 + S.dot(o.b, x); steps.push({ s, x, xi, yhat, extrap: x.some(v => Math.abs(v) > 1 + 1e-9) });
    }
    const norm = Math.sqrt(S.dot(o.b, o.b)); const dirv = o.b.map(v => o.dir * v / norm);
    return { dx, dxi, dxc, steps, unit: dirv };
  };

  /* ============================================================ ecuación en unidades naturales */
  /** Expande el polinomio codificado con x_i = (ξ_i − c_i)/h_i. Devuelve monomios [{pow:[...], coef}] */
  R.naturalPoly = function (fit, centers, halves) {
    const k = fit.k; const map = new Map();
    const add = (pw, c) => { const key = pw.join(','); map.set(key, (map.get(key) || 0) + c); };
    const zero = () => new Array(k).fill(0);
    const a = halves.map(h => 1 / h), d = centers.map((c, i) => -c / halves[i]);
    fit.coefs.forEach(cf => {
      if (cf.kind === 'int') add(zero(), cf.coef);
      if (cf.kind !== 'term') return; const t = cf.term, b = cf.coef;
      if (t.type === 'lin') { const p = zero(); p[t.i] = 1; add(p, b * a[t.i]); add(zero(), b * d[t.i]); }
      else if (t.type === 'sq') { const p2 = zero(); p2[t.i] = 2; const p1 = zero(); p1[t.i] = 1; add(p2, b * a[t.i] ** 2); add(p1, 2 * b * a[t.i] * d[t.i]); add(zero(), b * d[t.i] ** 2); }
      else { const i = t.i, j = t.j; const pij = zero(); pij[i] = 1; pij[j] = 1; const pi = zero(); pi[i] = 1; const pj = zero(); pj[j] = 1;
        add(pij, b * a[i] * a[j]); add(pi, b * a[i] * d[j]); add(pj, b * d[i] * a[j]); add(zero(), b * d[i] * d[j]); }
    });
    const deg = pw => pw.reduce((s, v) => s + v, 0);
    return [...map.entries()].map(([key, coef]) => ({ pow: key.split(',').map(Number), coef }))
      .sort((p, q) => deg(p.pow) - deg(q.pow) || (deg(p.pow) === 2 && Math.max(...q.pow) - Math.max(...p.pow)) || q.pow.join('').localeCompare(p.pow.join('')));
  };

  /* ============================================================ propiedades del diseño */
  /** Varianza de predicción escalada N·Var(ŷ)/σ² del modelo cuadrático completo en un punto */
  R.spv = function (runs, k, x) {
    const terms = R.fullTerms(k); const f = v => [1, ...terms.map(t => R.termVal(t, v))];
    const Xm = runs.map(r => f(r.x)); const p = Xm[0].length;
    const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => Xm.reduce((s, r) => s + r[i] * r[j], 0)));
    const Vi = S.inv(XtX); if (!Vi) return NaN; const v = f(x); let q = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) q += v[i] * Vi[i][j] * v[j];
    return runs.length * q;
  };
  /** Comprueba si los bloques son ortogonales a los términos del modelo cuadrático */
  R.blockOrthogonality = function (des) {
    if (des.blocks !== 2) return null;
    const bcol = des.runs.map(r => (r.block === 1 ? 1 : -1)); const bm = S.mean(bcol);
    let worst = 0;
    R.fullTerms(des.k).forEach(t => {
      const c = des.runs.map(r => R.termVal(t, r.x)); const m = S.mean(c);
      let sxy = 0, sxx = 0, syy = 0; c.forEach((v, i) => { sxy += (v - m) * (bcol[i] - bm); sxx += (v - m) ** 2; syy += (bcol[i] - bm) ** 2; });
      if (sxx > 1e-12) worst = Math.max(worst, Math.abs(sxy) / Math.sqrt(sxx * syy));
    });
    return worst;
  };

  /** Codificación automática de un factor a partir de sus niveles observados */
  R.autoCoding = function (vals) {
    const lv = [...new Set(vals.map(v => +(+v).toPrecision(10)))].sort((a, b) => a - b);
    if (lv.length >= 5) { const mid = Math.floor(lv.length / 2); const c = lv[mid]; const h = (lv[lv.length - 2] - lv[1]) / 2; if (h > 0 && Math.abs((lv[1] + lv[lv.length - 2]) / 2 - c) < 1e-6 * (Math.abs(c) + h)) return { center: c, half: h, levels: lv, rule: '5' }; }
    const lo = lv[0], hi = lv[lv.length - 1];
    return { center: (lo + hi) / 2, half: (hi - lo) / 2, levels: lv, rule: lv.length === 3 ? '3' : 'range' };
  };

  G.RSM = R;
  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
