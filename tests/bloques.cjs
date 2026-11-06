// Pruebas de validación de generadores de bloque (node tests/bloques.cjs)
const assert = require('node:assert/strict');
require('../js/stats.js'); const D = require('../js/design.js');
const W = (s, k) => D.parseWord(s, k);
let checks = 0;
const ok = (gens, k, group) => { assert.equal(D.checkBlockGens(gens.map(g => W(g, k)), group || []), null); checks++; };
const bad = (gens, k, re, group) => { const m = D.checkBlockGens(gens.map(g => W(g, k)), group || []); assert.ok(m && re.test(m), m); checks++; };

// Válidos
ok(['ABC', 'ABD'], 4);            // confunde ABC, ABD, CD
ok(['AB', 'CD'], 4);              // confunde AB, CD, ABCD
ok(['ABC', 'CDE', 'BDF'], 6);     // 2^6 en 8 bloques
// Generador individual que es efecto principal no se puede escribir (parseWord lo acepta como palabra de 1 letra)
bad(['A', 'BCD'], 4, /efecto principal A/);
// Interacción generalizada que es efecto principal: ABC × ABCF = F
bad(['ABC', 'ABCF'], 6, /ABC × ABCF = F.*efecto principal F/);
// 2^4 en 8 bloques con ABC, ABD, ACD: ABC × ABD × ACD = A
bad(['ABC', 'ABD', 'ACD'], 4, /= A confunde el efecto principal A/);
// Dependientes
bad(['ABC', 'ABC'], 4, /no son independientes/);
bad(['ABC', 'ABD', 'CD'], 4, /no son independientes/);
// Fraccionado 2^(5-1), E = ABCD: el bloque ABC tiene alias DE (válido); ABCD tiene alias E (inválido)
const gens = D.parseGenerators('E=ABCD', 5, 1); const group = D.definingGroup(gens);
ok(['ABC'], 5, group);
bad(['ABCD'], 5, /efecto principal E/, group);
// La búsqueda automática nunca devuelve una combinación inválida cuando existe una válida
for (const [k, q] of [[4, 2], [5, 2], [5, 3], [6, 3], [7, 3], [8, 4]]) {
  const bg = D.searchBlockGens(k, [], q); assert.ok(bg); assert.equal(D.checkBlockGens(bg, []), null); checks++;
}
// generate() con generadores válidos produce bloques balanceados y la confusión esperada
const des = D.generate({ k: 4, p: 0, gens: [], reps: 1, blockMode: 'conf', blockGens: ['ABC', 'ABD'].map(g => W(g, 4)), centers: 0, randomize: false });
assert.deepEqual(des.confounded.map(c => D.wname(c[0])), ['CD', 'ABC', 'ABD']); checks++;
console.log(`${checks} comprobaciones de generadores de bloque correctas.`);
