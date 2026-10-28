/* analysis.js — Estimabilidad, ajuste del modelo, ANOVA, Lenth, diagnósticos, Box-Cox y optimización */
(function (G) {
  'use strict';
  const S = G.Stats, D = G.Design;
  const A = {};

  A.masksSorted = k => { const a = []; for (let w = 1; w < (1 << k); w++) a.push(w); return a.sort(D.cmpWord); };
  A.termCol = (X, w) => X.map(x => { let v = 1; for (let j = 0; j < x.length; j++) if ((w >> j) & 1) v *= x[j]; return v; });
  A.termName = w => D.wname(w);

  /** Columnas base: intercepto, bloques (suma cero) y curvatura (indicador de punto central) */
  A.baseCols = function (prep, opts) {
    const n = prep.n; const cols = [new Array(n).fill(1)]; const info = [{ kind: 'int', name: 'Constante' }];
    if (opts.blocks && prep.blocks && prep.blocks.length > 1) {
      const B = prep.blocks; const last = B[B.length - 1];
      for (let b = 0; b < B.length - 1; b++) {
        cols.push(prep.block.map(v => (v === B[b] ? 1 : v === last ? -1 : 0)));
        info.push({ kind: 'block', name: `Bloque ${B[b]}`, label: B[b] });
      }
    }
    if (opts.curv && prep.nCenter > 0 && prep.nFact > 0) {
      cols.push(prep.isCenter.map(c => (c ? 1 : 0)));
      info.push({ kind: 'curv', name: 'Pt. central (curvatura)' });
    }
    return { cols, info };
  };

  const sameCol = (a, b, s) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - s * b[i]) > 1e-9) return false; return true; };

  /** Clasifica todos los efectos posibles: estimables, alias de otro, confundidos con bloques o dependientes */
  A.estimability = function (prep, opts) {
    const n = prep.n; const base = A.baseCols(prep, opts);
    const Qb = []; const Q = [];
    const addQ = (list, c) => {
      const v = Float64Array.from(c); const n0 = Math.sqrt(S.dot(v, v)); if (!n0) return false;
      for (let pass = 0; pass < 2; pass++) for (const q of list) { const d = S.dot(q, v); for (let t = 0; t < n; t++) v[t] -= d * q[t]; }
      const nv = Math.sqrt(S.dot(v, v)); if (nv / n0 < 1e-8) return false;
      for (let t = 0; t < n; t++) v[t] /= nv; list.push(v); return true;
    };
    base.cols.forEach(c => { if (addQ(Qb, c)) Q.push(Qb[Qb.length - 1]); });
    const estimable = []; const colMap = new Map(); const status = new Map(); const aliases = new Map();
    const blockConf = [], dependent = [], meanAlias = [];
    for (const w of A.masksSorted(prep.k)) {
      const col = A.termCol(prep.X, w);
      if (col.every(v => v === 0)) { dependent.push(w); status.set(w, { type: 'dep' }); continue; }
      if (addQ(Q, col)) {
        estimable.push(w); colMap.set(w, col); aliases.set(w, [{ w, s: 1 }]); status.set(w, { type: 'est' });
        continue;
      }
      let found = null;
      for (const e of estimable) { const c = colMap.get(e); if (sameCol(col, c, 1)) { found = { rep: e, s: 1 }; break; } if (sameCol(col, c, -1)) { found = { rep: e, s: -1 }; break; } }
      if (found) { aliases.get(found.rep).push({ w, s: found.s }); status.set(w, { type: 'alias', rep: found.rep, s: found.s }); continue; }
      if (col.every(v => Math.abs(v - col[0]) < 1e-9)) { meanAlias.push({ w, s: Math.sign(col[0]) }); status.set(w, { type: 'mean' }); continue; }
      const r = S.project(Qb, col); const nr = Math.sqrt(S.dot(r, r)) / Math.sqrt(S.dot(col, col));
      if (nr < 1e-8) { blockConf.push(w); status.set(w, { type: 'block' }); }
      else { dependent.push(w); status.set(w, { type: 'dep' }); }
    }
    const dfResidualFull = n - Q.length;
    return { estimable, status, aliases, blockConf, dependent, meanAlias, dfResidualFull, baseRank: Qb.length };
  };

  A.aliasText = (est, w, maxOrd) => {
    const list = (est.aliases.get(w) || []).slice().sort((a, b) => D.cmpWord(a.w, b.w));
    const shown = list.filter((m, i) => m.w === w || D.order(m.w) <= maxOrd);
    const rest = list.length - shown.length;
    return shown.filter(m => m.w !== w).map(m => (m.s > 0 ? ' + ' : ' − ') + D.wname(m.w)).join('') + (rest > 0 ? ' + …' : '');
  };

  /** Ajusta el modelo con los términos indicados */
  A.fit = function (prep, terms, opts) {
    const alpha = opts.alpha || 0.05;
    const base = A.baseCols(prep, opts);
    terms = terms.slice().sort(D.cmpWord);
    const cols = base.cols.slice(); const info = base.info.slice();
    terms.forEach(w => { cols.push(A.termCol(prep.X, w)); info.push({ kind: 'term', w, name: D.wname(w), order: D.order(w) }); });
    const f = S.lsfit(cols, prep.y);
    const keptInfo = f.kept.map(j => info[j]);
    const dropped = info.filter((_, j) => !f.kept.includes(j)).filter(i => i.kind === 'term').map(i => i.w);
    const n = prep.n, p = f.rank, dfE = n - p;
    const ybar = S.mean(prep.y); let sst = 0; for (const v of prep.y) sst += (v - ybar) ** 2;
    const sse = Math.max(0, f.rss); const mse = dfE > 0 ? sse / dfE : NaN;
    const tcrit = dfE > 0 ? S.tinv(1 - alpha / 2, dfE) : NaN;
    const coefs = keptInfo.map((inf, i) => {
      const b = f.b[i], vjj = f.V[i][i];
      const se = Math.sqrt(mse * vjj); const t = b / se;
      const pv = dfE > 0 ? S.tp2(t, dfE) : NaN;
      let vif = NaN;
      if (inf.kind !== 'int') { const c = cols[f.kept[i]]; const m = S.mean(c); let ss = 0; for (const v of c) ss += (v - m) ** 2; vif = vjj * ss; }
      return { ...inf, coef: b, se, t, p: pv, lo: b - tcrit * se, hi: b + tcrit * se, vif, effect: inf.kind === 'term' ? 2 * b : NaN, vjj };
    });
    const groupSS = idx => {
      if (!idx.length) return 0;
      if (idx.length === 1) { const i = idx[0]; return f.b[i] ** 2 / f.V[i][i]; }
      const sub = idx.map(i => idx.map(j => f.V[i][j])); const inv = S.inv(sub); if (!inv) return NaN;
      const bb = idx.map(i => f.b[i]); let s = 0;
      for (let a = 0; a < idx.length; a++) for (let c = 0; c < idx.length; c++) s += bb[a] * inv[a][c] * bb[c];
      return s;
    };
    const row = (source, df, ss, level) => {
      const ms = df > 0 ? ss / df : NaN; const F = dfE > 0 && mse > 0 ? ms / mse : NaN;
      return { source, df, ss, ms, F, p: isFinite(F) ? S.fsf(F, df, dfE) : NaN, level };
    };
    const anova = [];
    anova.push(row('Modelo', p - 1, sst - sse, 0));
    const idxOf = pred => keptInfo.map((inf, i) => (pred(inf) ? i : -1)).filter(i => i >= 0);
    const bIdx = idxOf(i => i.kind === 'block');
    if (bIdx.length) anova.push(row('Bloques', bIdx.length, groupSS(bIdx), 1));
    const ordNames = { 1: 'Lineales (efectos principales)', 2: 'Interacciones de 2 factores', 3: 'Interacciones de 3 factores', 4: 'Interacciones de 4 factores', 5: 'Interacciones de 5 factores', 6: 'Interacciones de 6 factores', 7: 'Interacciones de 7 factores', 8: 'Interacciones de 8 factores' };
    for (let o = 1; o <= prep.k; o++) {
      const idx = idxOf(i => i.kind === 'term' && i.order === o); if (!idx.length) continue;
      anova.push(row(ordNames[o], idx.length, groupSS(idx), 1));
      idx.forEach(i => { const r = row(keptInfo[i].name, 1, groupSS([i]), 2); r.w = keptInfo[i].w; anova.push(r); });
    }
    const cIdx = idxOf(i => i.kind === 'curv');
    if (cIdx.length) anova.push(row('Curvatura', 1, groupSS(cIdx), 1));
    anova.push({ source: 'Error', df: dfE, ss: sse, ms: mse, level: 0 });
    // Falta de ajuste / error puro: modelo de medias de celda (+ bloques)
    let lof = null;
    {
      const keyOf = x => x.map(v => Math.round(v * 1e6) / 1e6).join('|');
      const keys = [...new Set(prep.X.map(keyOf))];
      const ccols = [new Array(n).fill(1)];
      if (opts.blocks && prep.blocks && prep.blocks.length > 1) base.info.forEach((inf, j) => { if (inf.kind === 'block') ccols.push(base.cols[j]); });
      keys.forEach(kk => ccols.push(prep.X.map(x => (keyOf(x) === kk ? 1 : 0))));
      const fc = S.lsfit(ccols, prep.y);
      const dfPE = n - fc.rank, ssPE = Math.max(0, fc.rss);
      const dfLOF = dfE - dfPE, ssLOF = Math.max(0, sse - ssPE);
      if (dfPE > 0 && dfLOF > 0) {
        const msL = ssLOF / dfLOF, msP = ssPE / dfPE; const F = msP > 0 ? msL / msP : NaN;
        lof = { dfLOF, ssLOF, msLOF: msL, dfPE, ssPE, msPE: msP, F, p: isFinite(F) ? S.fsf(F, dfLOF, dfPE) : NaN };
        anova.push({ source: 'Falta de ajuste', df: dfLOF, ss: ssLOF, ms: msL, F, p: lof.p, level: 1 });
        anova.push({ source: 'Error puro', df: dfPE, ss: ssPE, ms: msP, level: 1 });
      } else if (dfPE > 0 && dfLOF === 0) {
        lof = { dfLOF: 0, dfPE, ssPE, msPE: ssPE / dfPE, onlyPure: true };
        anova.push({ source: 'Error puro', df: dfPE, ss: ssPE, ms: ssPE / dfPE, level: 1 });
      }
    }
    anova.push({ source: 'Total', df: n - 1, ss: sst, level: 0 });
    // Resumen y residuales
    const e = f.resid, h = f.lev;
    const stdres = e.map((v, i) => (dfE > 0 && h[i] < 1 - 1e-10 ? v / Math.sqrt(mse * (1 - h[i])) : NaN));
    const studres = stdres.map(r => (dfE > 1 && isFinite(r) ? r * Math.sqrt((dfE - 1) / Math.max(1e-12, dfE - r * r)) : NaN));
    const cook = stdres.map((r, i) => (isFinite(r) ? r * r * h[i] / (p * (1 - h[i])) : NaN));
    let press = 0, pressOK = true; e.forEach((v, i) => { if (h[i] > 1 - 1e-10) pressOK = false; else press += (v / (1 - h[i])) ** 2; });
    const summary = {
      n, p, dfE, sse, mse, s: Math.sqrt(mse), sst,
      r2: sst > 0 ? 1 - sse / sst : NaN,
      r2adj: dfE > 0 && sst > 0 ? 1 - (sse / dfE) / (sst / (n - 1)) : NaN,
      press: pressOK ? press : NaN, r2pred: pressOK && sst > 0 ? 1 - press / sst : NaN,
      ybar
    };
    return { terms, coefs, anova, lof, summary, resid: e, fitted: f.fitted, lev: h, stdres, studres, cook, b: f.b, V: f.V, info: keptInfo, Q: f.Q, dropped, alpha, tcrit, opts: { ...opts } };
  };

  /** Método de Lenth (pseudo error estándar) para diseños no replicados */
  A.lenth = function (effects, alpha) {
    alpha = alpha || 0.05;
    const m = effects.length; if (m < 3) return null;
    const abs = effects.map(e => Math.abs(e.effect));
    const s0 = 1.5 * S.median(abs);
    const trimmed = abs.filter(a => a < 2.5 * s0);
    const pse = 1.5 * S.median(trimmed.length ? trimmed : abs);
    const d = m / 3;
    const me = S.tinv(1 - alpha / 2, d) * pse;
    const gamma = (1 + Math.pow(1 - alpha, 1 / m)) / 2;
    const sme = S.tinv(gamma, d) * pse;
    const rows = effects.map(e => { const t = pse > 0 ? e.effect / pse : NaN; return { ...e, tL: t, p: isFinite(t) ? S.tp2(t, d) : NaN, sigME: Math.abs(e.effect) > me, sigSME: Math.abs(e.effect) > sme }; });
    return { pse, s0, me, sme, df: d, rows, m };
  };

  /** Diagnóstico de supuestos sobre los residuales */
  A.diagnostics = function (prep, fit) {
    const alpha = fit.alpha; const e = fit.resid; const n = e.length; const out = { tests: [] };
    if (fit.summary.dfE <= 0) { out.noDf = true; return out; }
    const r = fit.stdres.filter(isFinite);
    const sw = S.shapiroWilk(r);
    if (sw) out.tests.push({ group: 'Normalidad', name: 'Shapiro-Wilk', stat: `W = ${sw.W.toFixed(4)}`, p: sw.p, h0: 'Los residuales provienen de una distribución normal' });
    const ad = S.andersonDarling(r);
    if (ad) out.tests.push({ group: 'Normalidad', name: 'Anderson-Darling', stat: `A² = ${ad.A2.toFixed(4)} (A²* = ${ad.As.toFixed(4)})`, p: ad.p, h0: 'Los residuales provienen de una distribución normal' });
    for (let j = 0; j < prep.k; j++) {
      const lo = [], hi = [];
      prep.X.forEach((x, i) => { if (prep.isFact[i]) { if (x[j] < 0) lo.push(e[i]); else if (x[j] > 0) hi.push(e[i]); } });
      if (lo.length >= 2 && hi.length >= 2) {
        const bf = S.brownForsythe([lo, hi]);
        if (bf) out.tests.push({ group: 'Varianza constante', name: `Levene/Brown-Forsythe — factor ${D.L[j]}`, stat: `F(${bf.df1}, ${bf.df2}) = ${bf.F.toFixed(4)}`, p: bf.p, h0: `Varianza igual en ambos niveles de ${D.L[j]}` });
      }
    }
    { // Breusch-Pagan (Koenker) sobre los valores ajustados
      const e2 = e.map(v => v * v); const fv = fit.fitted;
      const mx = S.mean(fv), my = S.mean(e2); let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < n; i++) { sxy += (fv[i] - mx) * (e2[i] - my); sxx += (fv[i] - mx) ** 2; syy += (e2[i] - my) ** 2; }
      if (sxx > 0 && syy > 0) { const R2 = sxy * sxy / (sxx * syy); const LM = n * R2; out.tests.push({ group: 'Varianza constante', name: 'Breusch-Pagan (Koenker) vs. ajustados', stat: `LM = ${LM.toFixed(4)}, gl = 1`, p: S.chi2sf(LM, 1), h0: 'La varianza no depende del valor ajustado' }); }
    }
    const ord = prep.runOrder.map((o, i) => [o, i]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
    const eo = ord.map(i => e[i]);
    const rt = S.runsTest(eo);
    if (rt) out.tests.push({ group: 'Independencia', name: 'Prueba de rachas (orden de corrida)', stat: `R = ${rt.R} (esperado ${rt.mu.toFixed(2)}), z = ${rt.z.toFixed(3)}`, p: rt.p, h0: 'Los residuales son aleatorios en el orden de corrida' });
    const dw = S.durbinWatson(eo);
    out.dw = dw;
    out.tests.push({ group: 'Independencia', name: 'Durbin-Watson (orden de corrida)', stat: `d = ${dw.d.toFixed(4)}, r₁ = ${dw.r1.toFixed(4)}`, p: NaN, h0: 'd ≈ 2 indica ausencia de autocorrelación (d < 1.5 o > 2.5: sospecha)' });
    // Atípicos e influyentes
    const tB = fit.summary.dfE > 1 ? S.tinv(1 - alpha / (2 * n), fit.summary.dfE - 1) : NaN;
    out.bonf = tB;
    out.points = e.map((v, i) => ({
      i, run: prep.runOrder[i], y: prep.y[i], fit: fit.fitted[i], e: v, r: fit.stdres[i], t: fit.studres[i], h: fit.lev[i], cook: fit.cook[i],
      flagOut: Math.abs(fit.studres[i]) > tB, flagStd: Math.abs(fit.stdres[i]) > 2, flagCook: fit.cook[i] > 4 / n, flagLev: fit.lev[i] > 2 * fit.summary.p / n
    }));
    return out;
  };

  /** Box-Cox: SSE(λ) con la respuesta normalizada por la media geométrica */
  A.boxcox = function (yRaw, fit) {
    if (yRaw.some(v => !(v > 0)) || fit.summary.dfE < 1) return null;
    const lg = yRaw.map(Math.log); const gm = Math.exp(S.mean(lg));
    const sseAt = lam => {
      const z = Math.abs(lam) < 1e-9 ? lg.map(v => gm * v) : yRaw.map(v => (Math.pow(v, lam) - 1) / (lam * Math.pow(gm, lam - 1)));
      const r = S.project(fit.Q, z); return S.dot(r, r);
    };
    const lams = [], sses = [];
    for (let l = -3; l <= 3.0001; l += 0.02) { const ll = Math.round(l * 100) / 100; lams.push(ll); sses.push(sseAt(ll)); }
    let bi = 0; sses.forEach((s, i) => { if (s < sses[bi]) bi = i; });
    let lo = lams[Math.max(0, bi - 1)], hi = lams[Math.min(lams.length - 1, bi + 1)];
    for (let it = 0; it < 60; it++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (sseAt(m1) < sseAt(m2)) hi = m2; else lo = m1; }
    const lhat = (lo + hi) / 2; const smin = sseAt(lhat);
    const dfE = fit.summary.dfE; const t = S.tinv(0.975, dfE);
    const thr = smin * (1 + t * t / dfE);
    let ciLo = NaN, ciHi = NaN;
    for (let i = 0; i < lams.length; i++) if (sses[i] <= thr) { if (isNaN(ciLo)) ciLo = lams[i]; ciHi = lams[i]; }
    const suggestions = [[1, 'sin transformación'], [0.5, 'raíz cuadrada'], [0, 'logaritmo natural'], [-0.5, 'recíproco de la raíz'], [-1, 'recíproco'], [2, 'cuadrado']];
    const inCI = suggestions.filter(s => s[0] >= ciLo && s[0] <= ciHi);
    const rec = inCI.length ? inCI.sort((a, b) => Math.abs(a[0] - lhat) - Math.abs(b[0] - lhat))[0] : null;
    const r = { lams, sses, lhat, smin, thr, ciLo, ciHi, includesOne: ciLo <= 1 && 1 <= ciHi, rec };
    r.recommendation = r.includesOne ? 'λ = 1 está dentro del IC 95 %: no se requiere transformación.' : (rec ? `Se sugiere λ = ${rec[0]} (${rec[1]}).` : `Se sugiere y^${lhat.toFixed(2)}.`);
    return r;
  };

  /** Vector de diseño para un punto x (codificado) */
  A.rowFor = (fit, x) => fit.info.map(inf => {
    if (inf.kind === 'int') return 1;
    if (inf.kind === 'block') return 0;
    if (inf.kind === 'curv') return x.every(v => Math.abs(v) < 1e-9) ? 1 : 0;
    let v = 1; for (let j = 0; j < x.length; j++) if ((inf.w >> j) & 1) v *= x[j]; return v;
  });
  A.predict = function (fit, x) {
    const r = A.rowFor(fit, x); const yhat = S.dot(r, fit.b);
    let q = 0; for (let i = 0; i < r.length; i++) for (let j = 0; j < r.length; j++) q += r[i] * fit.V[i][j] * r[j];
    const mse = fit.summary.mse; const se = Math.sqrt(mse * q); const t = fit.tcrit;
    return { yhat, se, ci: [yhat - t * se, yhat + t * se], pi: [yhat - t * Math.sqrt(mse + se * se), yhat + t * Math.sqrt(mse + se * se)] };
  };
  A.predictFast = (fit, x) => S.dot(A.rowFor(fit, x), fit.b);

  A.optimize = function (fit, k, goal, target, levels) {
    const lv = levels; const total = Math.pow(lv.length, k); const res = [];
    const x = new Array(k).fill(0);
    for (let idx = 0; idx < total; idx++) {
      let t = idx; for (let j = 0; j < k; j++) { x[j] = lv[t % lv.length]; t = Math.floor(t / lv.length); }
      const y = A.predictFast(fit, x);
      const score = goal === 'max' ? -y : goal === 'min' ? y : Math.abs(y - target);
      res.push({ x: x.slice(), y, score });
      if (res.length > 4000) { res.sort((a, b) => a.score - b.score); res.length = 50; }
    }
    res.sort((a, b) => a.score - b.score);
    return res.slice(0, 10);
  };

  /** Ecuación en unidades reales (reparametrización por MC sobre columnas en unidades originales) */
  A.uncoded = function (prep, fit) {
    const terms = fit.terms.filter(w => !fit.dropped.includes(w));
    const cols = [new Array(prep.n).fill(1)]; const names = ['Constante'];
    const base = A.baseCols(prep, fit.opts);
    base.info.forEach((inf, j) => { if (inf.kind !== 'int') { cols.push(base.cols[j]); names.push(inf.name); } });
    terms.forEach(w => { cols.push(A.termCol(prep.R, w)); names.push(w); });
    const f = S.lsfit(cols, prep.y);
    if (f.rank < cols.length) return null;
    return names.map((nm, i) => ({ name: nm, coef: f.b[i] }));
  };

  /** Términos faltantes para mantener la jerarquía */
  A.hierarchyMissing = function (terms, estimable) {
    const set = new Set(terms); const est = new Set(estimable); const miss = new Set();
    terms.forEach(w => { for (let s = (w - 1) & w; s > 0; s = (s - 1) & w) if (est.has(s) && !set.has(s)) miss.add(s); });
    return [...miss].sort(D.cmpWord);
  };
  A.closeHierarchy = (terms, estimable) => [...new Set([...terms, ...A.hierarchyMissing(terms, estimable)])].sort(D.cmpWord);

  /** Eliminación hacia atrás respetando jerarquía */
  A.reduce = function (prep, terms, opts) {
    let cur = terms.slice(); const alpha = opts.alpha || 0.05; const removed = [];
    for (let it = 0; it < 300; it++) {
      const fit = A.fit(prep, cur, opts); if (fit.summary.dfE <= 0) break;
      const cand = fit.coefs.filter(c => c.kind === 'term' && !cur.some(o => o !== c.w && (o & c.w) === c.w));
      const worst = cand.filter(c => c.p > alpha).sort((a, b) => b.p - a.p)[0];
      if (!worst) break;
      cur = cur.filter(w => w !== worst.w); removed.push({ w: worst.w, p: worst.p });
    }
    return { terms: cur, removed };
  };

  /** Arma la estructura de datos codificados que usan todas las funciones */
  A.prepare = function ({ X, R, y, yRaw, block, runOrder }) {
    const n = y.length, k = X[0].length;
    const isCenter = X.map(x => x.every(v => Math.abs(v) < 1e-9));
    const isFact = X.map(x => x.every(v => Math.abs(Math.abs(v) - 1) < 1e-9));
    const blocks = block ? [...new Set(block)].sort((a, b) => (isFinite(a) && isFinite(b) ? a - b : String(a).localeCompare(String(b)))) : null;
    return {
      n, k, X, R: R || X, y, yRaw: yRaw || y, block, blocks: blocks && blocks.length > 1 ? blocks : null,
      runOrder: runOrder || y.map((_, i) => i + 1), isCenter, isFact,
      nCenter: isCenter.filter(Boolean).length, nFact: isFact.filter(Boolean).length
    };
  };

  /** Transformaciones de la respuesta */
  A.transforms = {
    none: { label: 'Ninguna', f: y => y, inv: z => z },
    ln: { label: 'ln(y)', f: y => Math.log(y), inv: z => Math.exp(z), pos: true },
    log10: { label: 'log₁₀(y)', f: y => Math.log10(y), inv: z => Math.pow(10, z), pos: true },
    sqrt: { label: '√y', f: y => Math.sqrt(y), inv: z => z * z, nonneg: true },
    inv: { label: '1/y', f: y => 1 / y, inv: z => 1 / z, pos: true },
    pow: { label: 'y^λ', f: (y, l) => Math.pow(y, l), inv: (z, l) => Math.pow(z, 1 / l), pos: true }
  };

  G.Analysis = A;
  if (typeof module !== 'undefined') module.exports = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
