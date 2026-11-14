// Pruebas de la deseabilidad (Derringer y Suich) con el caso de extrusión de botana
const assert = require('node:assert/strict');
require('../js/stats.js'); require('../js/design.js'); require('../js/analysis.js'); require('../js/desirability.js');
const Ds = Desir, A = Analysis; let checks = 0;
const near = (a, b, t = 1e-4) => { assert.ok(Math.abs(a - b) < t, `${a} ≠ ${b}`); checks++; };
const ie = { goal: 'target', L: 1.70, T: 1.80, U: 1.90, s: 1, t: 1, w: 1 };
const de = { goal: 'min', T: 270, U: 320, s: 1, t: 1, w: 1 };
assert.equal(Ds.check(ie), ''); assert.equal(Ds.check(de), ''); checks += 2;
assert.ok(Ds.check({ goal: 'target', L: 2, T: 1.8, U: 1.9, s: 1, t: 1, w: 1 })); checks++;
// casos límite de cada tipo
near(Ds.d(1.70, ie), 0); near(Ds.d(1.80, ie), 1); near(Ds.d(1.91, ie), 0); near(Ds.d(1.75, ie), 0.5);
near(Ds.d(260, de), 1); near(Ds.d(320, de), 0); near(Ds.d(295, de), 0.5);
const mx = { goal: 'max', L: 10, T: 20, s: 2, t: 1, w: 1 };
near(Ds.d(15, mx), 0.25); near(Ds.d(25, mx), 1); near(Ds.d(5, mx), 0);
near(Ds.d(1.85, { ...ie, t: 0.5 }), Math.sqrt(0.5));
// caso de la botana: centro (media de 5 réplicas) y corrida 3
const cIE = (1.90 + 1.85 + 1.82 + 1.88 + 1.84) / 5, cD = (271.71 + 308.64 + 301.34 + 289.50 + 296.12) / 5;
near(Ds.d(cIE, ie), 0.42); near(Ds.d(cD, de), 0.53076); near(Ds.D([Ds.d(cIE, ie), Ds.d(cD, de)], [1, 1]), 0.47213);
near(Ds.D([Ds.d(1.72, ie), Ds.d(318.75, de)], [1, 1]), Math.sqrt(0.2 * 0.025));
near(Ds.D([Ds.d(1.98, ie), Ds.d(285.40, de)], [1, 1]), 0);
// ponderación: importancia 2 para densidad
near(Ds.D([0.42, 0.53076], [1, 2]), Math.pow(0.42 * 0.53076 ** 2, 1 / 3));
// modelos ajustados: curvatura significativa en ambas respuestas (α = 0.05)
const rows = [[60, 155, 19.5, 1.94, 436.23], [100, 155, 15.5, 1.98, 285.40], [60, 185, 15.5, 1.72, 318.75], [100, 185, 19.5, 1.40, 348.98],
  [80, 170, 17.5, 1.90, 271.71], [80, 170, 17.5, 1.85, 308.64], [80, 170, 17.5, 1.82, 301.34], [80, 170, 17.5, 1.88, 289.50], [80, 170, 17.5, 1.84, 296.12]];
const code = (v, lo, hi) => (v - (lo + hi) / 2) / ((hi - lo) / 2);
const X = rows.map(r => [code(r[0], 60, 100), code(r[1], 155, 185), code(r[2], 15.5, 19.5)]);
const opts = { alpha: 0.05, blocks: false, curv: true };
[[3, 0.0102, [-0.14, -0.40, -0.18]], [4, 0.0046, [-60.3, -26.95, 90.53]]].forEach(([j, pc, eff]) => {
  const prep = A.prepare({ X, y: rows.map(r => r[j]) });
  const est = A.estimability(prep, opts).estimable; assert.deepEqual(est, [1, 2, 4]); checks++;
  const fit = A.fit(prep, est, opts);
  near(fit.coefs.find(c => c.kind === 'curv').p, pc, 2e-4);
  eff.forEach((e, i) => near(fit.coefs.find(c => c.w === [1, 2, 4][i]).effect, e, 1e-3));
  near(A.predictFast(fit, [0, 0, 0]), j === 3 ? cIE : cD, 1e-9);   // el centro reproduce la media de los centros
});
console.log(`${checks} comprobaciones de deseabilidad correctas.`);
