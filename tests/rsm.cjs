/* Pruebas del módulo de superficie de respuesta: node tests/rsm.cjs */
const assert = require('node:assert/strict');
require('../js/stats.js'); const R = require('../js/rsm.js');
let checks = 0; const near = (a, b, t = 1e-6, m = '') => { assert.ok(Math.abs(a - b) <= t, `${m} ${a} ≠ ${b}`); checks++; };

/* 1. Montgomery, ejemplo 11.2: CCD rotable k = 2, 5 centros */
const nat = [[80,170,76.5],[80,180,77.0],[90,170,78.0],[90,180,79.5],[85,175,79.9],[85,175,80.3],[85,175,80.0],[85,175,79.7],[85,175,79.8],[92.07,175,78.4],[77.93,175,75.6],[85,182.07,78.5],[85,167.93,77.0]];
const d1 = { X: nat.map(r => [(r[0]-85)/5, (r[1]-175)/5]), y: nat.map(r => r[2]), block: null };
const f1 = R.fit(d1, R.fullTerms(2), { alpha: 0.05 });
[79.94, 0.9951, 0.5152, -1.3764, -1.0013, 0.25].forEach((v, i) => near(f1.coefs[i].coef, v, 6e-5, 'coef 11.2'));
near(f1.summary.sse, 0.4964, 1e-4, 'SSE'); near(f1.summary.r2, 0.9827, 1e-4, 'R2');
near(f1.lof.F, 1.79, 5e-3, 'F falta de ajuste'); assert.equal(f1.lof.dfPE, 4); assert.equal(f1.lof.df, 3); checks += 2;
const c1 = R.canonical(f1);
near(c1.xs[0], 0.389, 1e-3, 'x1s'); near(c1.xs[1], 0.306, 1e-3, 'x2s'); near(c1.ys, 80.21, 5e-3, 'ys');
near(c1.eig[0].value, -0.9634, 2e-4, 'λ1'); near(c1.eig[1].value, -1.4141, 3e-4, 'λ2'); assert.equal(c1.nature, 'max'); checks++;
const np1 = R.naturalPoly(f1, [85, 175], [5, 5]); const mono = p => np1.find(m => m.pow.join() === p).coef;
near(mono('0,0'), -1430.69, 0.01, 'b0 real'); near(mono('1,0'), 7.809, 1e-3); near(mono('0,1'), 13.272, 1e-3); near(mono('2,0'), -0.05506, 1e-5); near(mono('0,2'), -0.04005, 1e-5); near(mono('1,1'), 0.01, 1e-9);
// ecuación real ≡ codificada en un punto arbitrario
const xi = [83.2, 178.9]; near(np1.reduce((s, m) => s + m.coef * Math.pow(xi[0], m.pow[0]) * Math.pow(xi[1], m.pow[1]), 0), R.predictFast(f1, [(83.2-85)/5, (178.9-175)/5]), 1e-8, 'real vs codificada');
// óptimo restringido y cresta pasan por el punto estacionario interior
const o1 = R.optimize(f1, 'max', 0, 'sphere', Math.SQRT2); near(o1.x[0], c1.xs[0], 1e-5); near(o1.x[1], c1.xs[1], 1e-5);
R.ridge(f1, 1, [0.25, 0.75, 1.2]).forEach(r => near(Math.hypot(...r.x), r.R, 1e-8, 'radio de cresta'));
const rg = R.ridge(f1, 1, [c1.dist]); near(rg[0].x[0], c1.xs[0], 1e-6); near(rg[0].y, c1.ys, 1e-8);

/* 2. Montgomery, ejemplo 11.1: pendiente ascendente con Δ = 5 min → 2 °F */
const st = R.steepest({ b0: 40.44, b: [0.775, 0.325], centers: [35, 155], halves: [5, 5], base: 0, step: 1, dir: 1, nSteps: 12, round: 0 });
assert.deepEqual(st.dxi, [5, 2]); checks++;
assert.deepEqual(st.steps[10].xi, [85, 175]); checks++;
near(st.dx[1], 0.325 / 0.775, 1e-12, 'Δx2 sin redondeo');
const sd = R.steepest({ b0: 0, b: [0.775, -0.325], centers: [0, 0], halves: [1, 1], base: 0, step: 0.5, dir: -1, nSteps: 2 });
near(sd.dx[0], -0.5); near(sd.dx[1], 0.325 / 0.775 * 0.5); assert.throws(() => R.steepest({ b0: 0, b: [0, 1], centers: [0, 0], halves: [1, 1], base: 0, step: 1, dir: 1, nSteps: 2 })); checks++;

/* 3. Propiedades de los diseños */
near(R.ccd({ k: 2, variant: 'ccc', alphaKind: 'rot', nc: 5 }).alpha, Math.SQRT2, 1e-12, 'α rotable k=2');
near(R.ccd({ k: 4, variant: 'ccc', alphaKind: 'rot', nc: 7 }).alpha, 2, 1e-12, 'α rotable k=4');
near(R.ccd({ k: 5, half: true, variant: 'ccc', alphaKind: 'rot', nc: 6 }).alpha, 2, 1e-12, 'α rotable 2^(5-1)');
near(R.ccd({ k: 2, variant: 'ccc', alphaKind: 'orth', nc: 8 }).alpha, Math.SQRT2, 1e-12, 'α ortogonal k=2, 8 centros');
const db = R.ccd({ k: 3, variant: 'ccc', alphaKind: 'block', blocks: 2, ncf: 4, nca: 2 }); near(db.alpha, 1.633, 1e-3, 'α bloqueo ortogonal k=3'); near(R.blockOrthogonality(db), 0, 1e-10, 'bloques ortogonales');
const dr = R.ccd({ k: 3, variant: 'ccc', alphaKind: 'rot', nc: 6 }); const r3 = 1 / Math.sqrt(3);
near(R.spv(dr.runs, 3, [1, 0, 0]), R.spv(dr.runs, 3, [r3, r3, r3]), 1e-8, 'rotabilidad');
// α ortogonal: columnas cuadráticas centradas ortogonales entre sí
const dor = R.ccd({ k: 3, variant: 'ccc', alphaKind: 'orth', nc: 6 });
const qc = j => { const c = dor.runs.map(r => r.x[j] ** 2); const m = c.reduce((s, v) => s + v, 0) / c.length; return c.map(v => v - m); };
near(qc(0).reduce((s, v, i) => s + v * qc(1)[i], 0), 0, 1e-9, 'ortogonalidad cuadráticos');
const ci = R.ccd({ k: 2, variant: 'cci', alphaKind: 'rot', nc: 5 }); near(Math.max(...ci.runs.flatMap(r => r.x.map(Math.abs))), 1, 1e-12, 'CCI dentro de ±1');
assert.equal(R.ccd({ k: 3, variant: 'ccf', alphaKind: 'rot', nc: 6 }).alpha, 1); checks++;
[[3, 12], [4, 24], [5, 40], [6, 48], [7, 56]].forEach(([k, m]) => { const d = R.bbd({ k, nc: 3 }); assert.equal(d.runs.length, m + 3); assert.ok(d.runs.every(r => r.x.every(v => [-1, 0, 1].includes(v)))); checks += 2; });
// BBD k = 7: cada par de factores aparece exactamente una vez (diseño balanceado)
const pairs = new Map(); R.BBD_SETS[7].forEach(s => s.forEach((a, i) => s.slice(i + 1).forEach(b => { const k = a + '-' + b; pairs.set(k, (pairs.get(k) || 0) + 1); })));
assert.equal(pairs.size, 21); assert.ok([...pairs.values()].every(v => v === 1)); checks += 2;
near(R.spv(R.bbd({ k: 3, nc: 3 }).runs, 3, [0, 0, 0]), 5, 1e-9, 'SPV centro BBD k=3');
const ac = R.autoCoding([77.93, 80, 85, 90, 92.07]); near(ac.center, 85); near(ac.half, 5);

/* 4. Box-Behnken k = 4 con dos bloques contra numpy.linalg.lstsq (referencia independiente) */
const REF = {"y": [46.5, 53.4749944314, 45.7333766939, 47.722555953, 51.4823400534, 52.3954613379, 47.9003759372, 48.1455886633, 50.5774854446, 53.1902217194, 45.1158075244, 51.5530029226, 51.4993787004, 48.1740902137, 45.5846046628, 49.5771750621, 51.437819185, 49.4430879801, 45.0149176965, 55.1199836687, 50.0872480584, 45.7709999845, 47.6159851955, 51.4568008964, 50.122079772, 47.0117404906, 50.6479617986], "coef": [49.36213867236272, -0.30463395583262803, 1.872402721733334, -0.7303569909560187, -0.443158066829383, -0.9763496215674182, 0.32211640020607246, -1.1386390207179138, 0.4335626429075078, 0.3731244649558646, -1.2464537930650263, 3.0249492942671266, 0.9561147808434297, 1.8294647214995803, 2.0392659436833305, -0.1669771395962799], "sse": 38.265347304568756, "df": 11, "press": 231.41722558959708, "xs": [1.3778888176641906, -0.97911303399548, -1.883890787719236, 1.7970343046210253], "ev": [2.000970995738203, 0.7889855114542703, -0.2257090721722241, -2.5740829476687184]};
const bb = R.bbd({ k: 4, nc: 3 }); const d4 = { X: bb.runs.map(r => r.x), y: REF.y, block: bb.runs.map((_, t) => String(t % 2 === 0 ? 1 : 2)) };
const f4 = R.fit(d4, R.fullTerms(4), { alpha: 0.05, blocks: true });
f4.coefs.forEach((c, i) => near(c.coef, REF.coef[i], 1e-8, 'coef BBD ' + c.name));
near(f4.summary.sse, REF.sse, 1e-8, 'SSE BBD'); assert.equal(f4.summary.dfE, REF.df); checks++; near(f4.summary.press, REF.press, 1e-7, 'PRESS');
const c4 = R.canonical(f4); c4.xs.forEach((v, i) => near(v, REF.xs[i], 1e-7, 'xs BBD')); c4.eig.forEach((e, i) => near(e.value, REF.ev[i], 1e-9, 'λ BBD'));
// cada vector propio cumple B v = λ v
c4.eig.forEach(e => e.vector.forEach((_, i) => near(c4.B[i].reduce((s, b, j) => s + b * e.vector[j], 0), e.value * e.vector[i], 1e-10)));

/* 5. Términos no estimables y jerarquía */
const fact = { X: [[-1,-1],[1,-1],[-1,1],[1,1],[0,0],[0,0],[0,0]], y: [1,2,3,4,2.5,2.4,2.6], block: null };
assert.throws(() => R.fit(fact, R.fullTerms(2), {}), /no permite estimar/); checks++;
assert.deepEqual(R.hierarchyMissing([{ type: 'sq', i: 0 }]).map(R.termKey), ['L0']); checks++;
const red = R.reduce(d1, R.fullTerms(2), { alpha: 0.05 }); assert.deepEqual(red.removed, ['A·B']); checks++;

console.log(`rsm.cjs: ${checks} comprobaciones correctas`);
