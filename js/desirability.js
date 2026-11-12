/* desirability.js — Funciones de deseabilidad de Derringer y Suich (1980) para varias respuestas */
(function (G) {
  'use strict';
  const Ds = {};
  const GOALS = { max: 'Maximizar', min: 'Minimizar', target: 'Valor objetivo' };
  Ds.GOALS = GOALS;

  /** Revisa una especificación {goal, L, T, U, s, t}; devuelve texto de error o '' */
  Ds.check = function (sp) {
    const ok = v => typeof v === 'number' && isFinite(v);
    if (sp.goal === 'max') { if (!ok(sp.L) || !ok(sp.T)) return 'indique L y T'; if (!(sp.L < sp.T)) return 'se requiere L < T'; if (!(sp.s > 0)) return 'el exponente debe ser > 0'; }
    else if (sp.goal === 'min') { if (!ok(sp.T) || !ok(sp.U)) return 'indique T y U'; if (!(sp.T < sp.U)) return 'se requiere T < U'; if (!(sp.t > 0)) return 'el exponente debe ser > 0'; }
    else if (sp.goal === 'target') { if (!ok(sp.L) || !ok(sp.T) || !ok(sp.U)) return 'indique L, T y U'; if (!(sp.L < sp.T && sp.T < sp.U)) return 'se requiere L < T < U'; if (!(sp.s > 0) || !(sp.t > 0)) return 'los exponentes deben ser > 0'; }
    else return 'objetivo no válido';
    if (!(sp.w > 0)) return 'la importancia debe ser > 0';
    return '';
  };

  /** Deseabilidad individual d ∈ [0, 1] */
  Ds.d = function (y, sp) {
    if (y == null || !isFinite(y)) return NaN;
    const { L, T, U, s, t } = sp;
    if (sp.goal === 'max') { if (y <= L) return 0; if (y >= T) return 1; return Math.pow((y - L) / (T - L), s); }
    if (sp.goal === 'min') { if (y <= T) return 1; if (y >= U) return 0; return Math.pow((U - y) / (U - T), t); }
    if (y < L || y > U) return 0;
    if (y <= T) return Math.pow((y - L) / (T - L), s);
    return Math.pow((U - y) / (U - T), t);
  };

  /** Deseabilidad global: media geométrica ponderada; 0 si alguna d es 0 */
  Ds.D = function (ds, ws) {
    let sw = 0, sl = 0;
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i], w = ws ? ws[i] : 1;
      if (!isFinite(d)) return NaN;
      if (d <= 0) return 0;
      sw += w; sl += w * Math.log(d);
    }
    return sw > 0 ? Math.exp(sl / sw) : NaN;
  };

  /** Valores iniciales razonables a partir del rango observado */
  Ds.defaults = function (goal, ys) {
    const v = ys.filter(isFinite); const lo = Math.min(...v), hi = Math.max(...v);
    const r = x => +x.toPrecision(4);
    if (goal === 'max') return { goal, L: r(lo), T: r(hi), U: NaN, s: 1, t: 1, w: 1 };
    if (goal === 'min') return { goal, L: NaN, T: r(lo), U: r(hi), s: 1, t: 1, w: 1 };
    return { goal, L: r(lo), T: r((lo + hi) / 2), U: r(hi), s: 1, t: 1, w: 1 };
  };

  const f4 = v => (isFinite(v) ? +v.toFixed(4) : '—');
  const pw = (e) => (e === 1 ? '' : `^${e}`);
  /** Sustitución numérica de la fórmula usada (texto plano) */
  Ds.explain = function (y, sp) {
    const { L, T, U, s, t } = sp; const d = Ds.d(y, sp); const Y = f4(y);
    if (sp.goal === 'max') {
      if (y <= L) return `y = ${Y} ≤ L = ${L} → d = 0`;
      if (y >= T) return `y = ${Y} ≥ T = ${T} → d = 1`;
      return `d = [(y − L)/(T − L)]${pw(s)} = [(${Y} − ${L})/(${T} − ${L})]${pw(s)} = ${f4(d)}`;
    }
    if (sp.goal === 'min') {
      if (y <= T) return `y = ${Y} ≤ T = ${T} → d = 1`;
      if (y >= U) return `y = ${Y} ≥ U = ${U} → d = 0`;
      return `d = [(U − y)/(U − T)]${pw(t)} = [(${U} − ${Y})/(${U} − ${T})]${pw(t)} = ${f4(d)}`;
    }
    if (y < L || y > U) return `y = ${Y} fuera de [${L}, ${U}] → d = 0`;
    if (y <= T) return `y ≤ T: d = [(y − L)/(T − L)]${pw(s)} = [(${Y} − ${L})/(${T} − ${L})]${pw(s)} = ${f4(d)}`;
    return `y > T: d = [(U − y)/(U − T)]${pw(t)} = [(${U} − ${Y})/(${U} − ${T})]${pw(t)} = ${f4(d)}`;
  };
  Ds.explainD = function (ds, ws) {
    const D = Ds.D(ds, ws); const eq = ws.every(w => w === ws[0]);
    if (ds.some(d => d <= 0)) return `Alguna d = 0 → D = 0`;
    if (eq) return `D = (${ds.map(f4).join(' × ')})^(1/${ds.length}) = ${f4(D)}`;
    const sw = ws.reduce((a, b) => a + b, 0);
    return `D = (${ds.map((d, i) => `${f4(d)}^${ws[i]}`).join(' × ')})^(1/${sw}) = ${f4(D)}`;
  };

  G.Desir = Ds;
  if (typeof module !== 'undefined') module.exports = Ds;
})(typeof window !== 'undefined' ? window : globalThis);
