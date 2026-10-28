/* design.js — Construcción de diseños 2^k y 2^(k-p): generadores, relación definidora, alias y bloques */
(function (G) {
  'use strict';
  const S = G.Stats;
  const L = 'ABCDEFGH';
  const D = { L };

  D.wname = w => { let s = ''; for (let i = 0; i < 8; i++) if ((w >> i) & 1) s += L[i]; return s || 'I'; };
  D.order = w => { let c = 0; while (w) { c += w & 1; w >>>= 1; } return c; };
  D.cmpWord = (a, b) => D.order(a) - D.order(b) || (D.wname(a) < D.wname(b) ? -1 : D.wname(a) > D.wname(b) ? 1 : 0);
  D.roman = r => (r === Infinity ? 'Completo' : ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][r] || String(r));

  D.parseWord = function (str, maxIdx) {
    const s = String(str).toUpperCase().replace(/[\s*·×x]/g, '');
    if (!s) throw new Error('Palabra vacía.');
    let w = 0;
    for (const ch of s) {
      const i = L.indexOf(ch);
      if (i < 0 || i >= maxIdx) throw new Error(`Letra no válida "${ch}" (use ${L.slice(0, maxIdx).split('').join(', ')}).`);
      if ((w >> i) & 1) throw new Error(`Letra repetida "${ch}".`);
      w |= 1 << i;
    }
    return w;
  };

  /** Generadores estándar de máxima resolución (Montgomery, tabla 8.14; Box-Hunter-Hunter) */
  D.STD_GENS = {
    '3-1': ['C=AB'],
    '4-1': ['D=ABC'],
    '5-1': ['E=ABCD'], '5-2': ['D=AB', 'E=AC'],
    '6-1': ['F=ABCDE'], '6-2': ['E=ABC', 'F=BCD'], '6-3': ['D=AB', 'E=AC', 'F=BC'],
    '7-1': ['G=ABCDEF'], '7-2': ['F=ABCD', 'G=ABDE'], '7-3': ['E=ABC', 'F=BCD', 'G=ACD'], '7-4': ['D=AB', 'E=AC', 'F=BC', 'G=ABC'],
    '8-1': ['H=ABCDEFG'], '8-2': ['G=ABCD', 'H=ABEF'], '8-3': ['F=ABC', 'G=ABD', 'H=BCDE'], '8-4': ['E=BCD', 'F=ACD', 'G=ABC', 'H=ABD']
  };
  D.fractionOptions = k => [1, 2, 3, 4].filter(p => D.STD_GENS[`${k}-${p}`]);

  D.parseGenerators = function (text, k, p) {
    const m = k - p;
    const parts = String(text || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length !== p) throw new Error(`Se requieren ${p} generador(es) y se escribieron ${parts.length}.`);
    const gens = [], used = new Set();
    for (const part of parts) {
      const mt = part.toUpperCase().replace(/\s+/g, '').match(/^([A-H])=([+-]?)([A-H*·]+)$/);
      if (!mt) throw new Error(`Generador mal escrito: "${part}". Use el formato D=ABC o D=-ABC.`);
      const t = L.indexOf(mt[1]);
      if (t < m || t >= k) throw new Error(`El factor generado ${mt[1]} debe ser uno de: ${L.slice(m, k).split('').join(', ')}.`);
      if (used.has(t)) throw new Error(`El factor ${mt[1]} tiene más de un generador.`);
      used.add(t);
      const w = D.parseWord(mt[3], m);
      if (D.order(w) < 2) throw new Error(`El generador de ${mt[1]} debe ser una interacción de al menos dos factores base (${L.slice(0, m)}).`);
      gens.push({ target: t, word: w, sign: mt[2] === '-' ? -1 : 1 });
    }
    gens.sort((a, b) => a.target - b.target);
    return gens;
  };

  /** Grupo de palabras de la relación definidora (sin I) */
  D.definingGroup = function (gens) {
    const base = gens.map(g => ({ w: g.word | (1 << g.target), s: g.sign }));
    const out = [];
    for (let mask = 1; mask < (1 << base.length); mask++) {
      let w = 0, s = 1;
      base.forEach((b, i) => { if ((mask >> i) & 1) { w ^= b.w; s *= b.s; } });
      out.push({ w, s });
    }
    return out.sort((a, b) => D.cmpWord(a.w, b.w));
  };
  D.resolution = group => (group.length ? Math.min(...group.map(g => D.order(g.w))) : Infinity);
  D.wordLengthPattern = (group, k) => { const a = new Array(k + 1).fill(0); group.forEach(g => a[D.order(g.w)]++); return a.slice(3); };

  /** Clases de alias: para cada efecto estimable, la cadena con signos */
  D.aliasClasses = function (k, group) {
    const seen = new Set(); const classes = [];
    const words = []; for (let w = 1; w < (1 << k); w++) words.push(w);
    words.sort(D.cmpWord);
    const gw = new Set(group.map(g => g.w));
    for (const w of words) {
      if (seen.has(w) || gw.has(w)) continue;
      const members = [{ w, s: 1 }, ...group.map(g => ({ w: w ^ g.w, s: g.s }))];
      members.forEach(mm => seen.add(mm.w));
      members.sort((a, b) => D.cmpWord(a.w, b.w));
      // re-expresar signos respecto al representante (el de menor orden)
      const rep = members[0]; const out = members.map(mm => ({ w: mm.w, s: mm.s * rep.s }));
      classes.push({ rep: rep.w, members: out });
    }
    return classes;
  };
  D.chainText = (cls, maxOrd) => {
    const shown = cls.members.filter((mm, i) => i === 0 || D.order(mm.w) <= maxOrd);
    let t = shown.map((mm, i) => (i === 0 ? '' : (mm.s > 0 ? ' + ' : ' − ')) + D.wname(mm.w)).join('');
    if (shown.length < cls.members.length) t += ' + …';
    return t;
  };

  /** Búsqueda de generadores de bloque que minimizan la confusión de efectos de bajo orden */
  D.searchBlockGens = function (k, group, q) {
    const G0 = [0, ...group.map(g => g.w)]; const G0set = new Set(G0);
    const reps = []; const seen = new Set();
    const words = []; for (let w = 1; w < (1 << k); w++) words.push(w);
    words.sort((a, b) => -D.cmpWord(a, b)); // preferir palabras de orden alto como representantes
    for (const w of words) {
      if (seen.has(w)) continue;
      const cls = G0.map(g => w ^ g); cls.forEach(c => seen.add(c));
      if (G0set.has(w)) continue;
      reps.push(w);
    }
    if (reps.length < (1 << q) - 1) return null;
    const score = chosen => {
      const cnt = new Array(k + 1).fill(0);
      for (let mask = 1; mask < (1 << chosen.length); mask++) {
        let s = 0; chosen.forEach((c, i) => { if ((mask >> i) & 1) s ^= c; });
        if (G0set.has(s)) return null;
        for (const g of G0) cnt[D.order(s ^ g)]++;
      }
      return cnt;
    };
    const better = (a, b) => { if (!b) return true; for (let i = 1; i < a.length; i++) { if (a[i] !== b[i]) return a[i] < b[i]; } return false; };
    let best = null, bestSet = null;
    const nComb = (n, r) => { let c = 1; for (let i = 0; i < r; i++) c = c * (n - i) / (i + 1); return c; };
    if (nComb(reps.length, q) <= 3e5) {
      const rec = (start, chosen) => {
        if (chosen.length === q) { const sc = score(chosen); if (sc && better(sc, best)) { best = sc; bestSet = chosen.slice(); } return; }
        for (let i = start; i < reps.length; i++) { chosen.push(reps[i]); rec(i + 1, chosen); chosen.pop(); }
      };
      rec(0, []);
    } else {
      const chosen = [];
      for (let step = 0; step < q; step++) {
        let b = null, bw = null;
        for (const r of reps) { if (chosen.includes(r)) continue; const sc = score([...chosen, r]); if (sc && better(sc, b)) { b = sc; bw = r; } }
        if (bw === null) return null; chosen.push(bw); best = b;
      }
      bestSet = chosen;
    }
    return bestSet ? bestSet.sort(D.cmpWord) : null;
  };

  /** Efectos confundidos con bloques (con sus alias en diseños fraccionados) */
  D.blockConfounded = function (blockGens, group) {
    const out = []; const G0 = [{ w: 0, s: 1 }, ...group];
    for (let mask = 1; mask < (1 << blockGens.length); mask++) {
      let s = 0; blockGens.forEach((c, i) => { if ((mask >> i) & 1) s ^= c; });
      const members = G0.map(g => s ^ g.w).sort(D.cmpWord);
      out.push(members);
    }
    return out.sort((a, b) => D.cmpWord(a[0], b[0]));
  };

  /**
   * Genera el diseño. cfg: {k, p, gens, reps, blockMode:'none'|'reps'|'conf', blockGens:[w], centers, randomize, seed}
   */
  D.generate = function (cfg) {
    const { k, p, gens, reps, blockMode, centers, randomize, seed } = cfg;
    const blockGens = blockMode === 'conf' ? (cfg.blockGens || []) : [];
    const m = k - p; const nb = 1 << m;
    const group = p ? D.definingGroup(gens) : [];
    const colOf = (x, w) => { let v = 1; for (let j = 0; j < k; j++) if ((w >> j) & 1) v *= x[j]; return v; };
    const base = [];
    for (let i = 0; i < nb; i++) {
      const x = new Array(k).fill(0);
      for (let j = 0; j < m; j++) x[j] = ((i >> j) & 1) ? 1 : -1;
      for (const g of gens) { let v = g.sign; for (let j = 0; j < m; j++) if ((g.word >> j) & 1) v *= x[j]; x[g.target] = v; }
      base.push(x);
    }
    // validar bloques
    if (blockMode === 'conf') {
      for (let mask = 1; mask < (1 << blockGens.length); mask++) {
        let s = 0; blockGens.forEach((c, i) => { if ((mask >> i) & 1) s ^= c; });
        if (s === 0 || group.some(g => g.w === s)) throw new Error('Los generadores de bloque no son independientes o coinciden con la relación definidora.');
      }
    }
    const label = new Map(); let nextLabel = 1;
    const perRep = blockMode === 'conf' ? (1 << blockGens.length) : 1;
    const runs = [];
    for (let r = 0; r < reps; r++) {
      base.forEach((x, i) => {
        let blk = 1;
        if (blockMode === 'reps') blk = r + 1;
        else if (blockMode === 'conf') {
          let b = 0; blockGens.forEach((w, j) => { if (colOf(x, w) > 0) b |= 1 << j; });
          if (!label.has(b)) label.set(b, nextLabel++);
          blk = r * perRep + label.get(b);
        }
        runs.push({ x: x.slice(), block: blk, type: 1, rep: r + 1, base: i + 1 });
      });
    }
    // comprobar balance de bloques
    if (blockMode === 'conf') {
      const counts = {}; runs.forEach(rn => { counts[rn.block] = (counts[rn.block] || 0) + 1; });
      const vals = Object.values(counts); if (vals.length !== reps * perRep || Math.min(...vals) !== Math.max(...vals)) throw new Error('Los generadores de bloque no producen bloques balanceados.');
    }
    const blocks = [...new Set(runs.map(r => r.block))].sort((a, b) => a - b);
    const nc = Math.max(0, centers | 0);
    blocks.forEach(b => { for (let c = 0; c < nc; c++) runs.push({ x: new Array(k).fill(0), block: b, type: 0, rep: 0, base: nb + c + 1 }); });
    runs.sort((a, b) => a.block - b.block || b.type - a.type || a.rep - b.rep || a.base - b.base);
    runs.forEach((r, i) => { r.std = i + 1; });
    const rnd = S.rng(seed || 1);
    let order = 1;
    blocks.forEach(b => {
      const idx = runs.map((r, i) => (r.block === b ? i : -1)).filter(i => i >= 0);
      if (randomize) for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      idx.forEach(i => { runs[i].run = order++; });
    });
    const res = D.resolution(group);
    return {
      k, p, m, reps, blockMode, blockGens, centers: nc, runs, group, resolution: res,
      nBlocks: blocks.length, runsPerRep: nb,
      classes: D.aliasClasses(k, group),
      confounded: blockMode === 'conf' ? D.blockConfounded(blockGens, group) : []
    };
  };

  G.Design = D;
  if (typeof module !== 'undefined') module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
