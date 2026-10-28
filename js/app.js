/* app.js — Interfaz de DOE 2^k */
(function () {
  'use strict';
  const S = Stats, D = Design, A = Analysis, P = Plots;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v, d) => {
    d = d == null ? 4 : d;
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v); if (a !== 0 && (a >= 1e6 || a < Math.pow(10, -d))) return v.toExponential(3);
    return v.toFixed(d);
  };
  const fmtP = p => (!isFinite(p) ? '—' : p < 0.0001 ? '&lt;0.0001' : p.toFixed(4));
  const fmtPtxt = p => (!isFinite(p) ? '' : p < 0.0001 ? '<0.0001' : p.toFixed(4));
  const msg = (el, type, html) => { $(el).innerHTML = html ? `<div class="msg ${type}">${html}</div>` : ''; };
  const num = s => { if (s == null) return NaN; const t = String(s).trim().replace(/\s/g, ''); if (t === '') return NaN; const v = Number(t.replace(/,(?=\d+$)/, '.')); return isFinite(v) ? v : NaN; };
  const sup = n => String(n).replace(/[0-9-−]/g, c => ({ '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻' }[c]));

  const state = {
    design: null, factors: [], dataset: null, prep: null, est: null, terms: [], fit: null, full: null, lenth: null,
    opts: { alpha: 0.05, aliasOrd: 3, blocks: true, curv: true }
  };
  const STORE = 'doe2k.v1';

  /* ------------------------------------------------------------ pestañas */
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  function showTab(t) {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('active', s.id === 'tab-' + t));
    window.scrollTo({ top: 0 });
  }

  /* ============================================================ DISEÑO */
  const dK = $('dK');
  for (let k = 2; k <= 8; k++) dK.insertAdjacentHTML('beforeend', `<option value="${k}" ${k === 3 ? 'selected' : ''}>${k}</option>`);
  const defaultFactor = i => ({ name: D.L[i], low: '-1', high: '1', unit: '' });

  function readFactorTable() {
    const k = +dK.value;
    for (let i = 0; i < k; i++) {
      const g = f => { const e = $(`f_${f}_${i}`); return e ? e.value : undefined; };
      if (g('name') === undefined) continue;
      state.factors[i] = { name: g('name').trim(), low: g('low').trim(), high: g('high').trim(), unit: g('unit').trim() };
    }
  }
  function buildFactorTable() {
    readFactorTable();
    const k = +dK.value;
    for (let i = 0; i < k; i++) if (!state.factors[i]) state.factors[i] = defaultFactor(i);
    let h = '<thead><tr><th>Letra</th><th class="l">Nombre</th><th>Nivel bajo (−1)</th><th>Nivel alto (+1)</th><th class="l">Unidades</th></tr></thead><tbody>';
    for (let i = 0; i < k; i++) {
      const f = state.factors[i];
      h += `<tr><td><b>${D.L[i]}</b></td><td class="l"><input id="f_name_${i}" value="${esc(f.name)}" style="width:160px;text-align:left"></td>
      <td><input id="f_low_${i}" value="${esc(f.low)}"></td><td><input id="f_high_${i}" value="${esc(f.high)}"></td>
      <td class="l"><input id="f_unit_${i}" value="${esc(f.unit)}" style="width:90px;text-align:left"></td></tr>`;
    }
    $('factorTable').innerHTML = h + '</tbody>';
  }
  function updateDesignControls() {
    const k = +dK.value; const opts = D.fractionOptions(k);
    const fracOpt = $('dType').querySelector('option[value="frac"]');
    fracOpt.disabled = !opts.length; if (!opts.length) $('dType').value = 'full';
    const frac = $('dType').value === 'frac';
    $('wrapP').hidden = !frac; $('genWrap').hidden = !frac;
    if (frac) {
      const cur = +$('dP').value || opts[0];
      $('dP').innerHTML = opts.map(p => {
        const g = D.definingGroup(D.parseGenerators(D.STD_GENS[`${k}-${p}`].join(','), k, p));
        return `<option value="${p}">2${sup(k + '-' + p)} · ${1 << (k - p)} corridas · Res ${D.roman(D.resolution(g))}</option>`;
      }).join('');
      $('dP').value = opts.includes(cur) ? cur : opts[0];
      if (!$('dGens').value || $('dGens').dataset.k !== `${k}-${$('dP').value}`) setStdGens();
    }
    const p = frac ? +$('dP').value : 0; const runs = 1 << (k - p);
    const conf = $('dBlockMode').value === 'conf';
    $('wrapNB').hidden = !conf; $('bgWrap').hidden = !conf;
    const cur = +$('dNB').value || 2;
    const nbOpts = [2, 4, 8, 16].filter(b => b <= runs / 2);
    $('dNB').innerHTML = nbOpts.map(b => `<option value="${b}">${b} bloques (${runs / b} corridas c/u)</option>`).join('');
    $('dNB').value = nbOpts.includes(cur) ? cur : nbOpts[0];
  }
  function setStdGens() {
    const k = +dK.value, p = +$('dP').value;
    $('dGens').value = (D.STD_GENS[`${k}-${p}`] || []).join(', ');
    $('dGens').dataset.k = `${k}-${p}`;
    $('dBGens').value = '';
  }
  function currentGroup() {
    const k = +dK.value; const frac = $('dType').value === 'frac'; const p = frac ? +$('dP').value : 0;
    const gens = p ? D.parseGenerators($('dGens').value, k, p) : [];
    return { k, p, gens, group: p ? D.definingGroup(gens) : [] };
  }
  function autoBlockGens() {
    const { k, group } = currentGroup(); const q = Math.log2(+$('dNB').value);
    const bg = D.searchBlockGens(k, group, q);
    if (!bg) throw new Error('No existe una asignación válida de bloques para este diseño.');
    $('dBGens').value = bg.map(D.wname).join(', ');
    return bg;
  }
  dK.addEventListener('change', () => { buildFactorTable(); $('dGens').value = ''; updateDesignControls(); });
  $('dType').addEventListener('change', updateDesignControls);
  $('dP').addEventListener('change', () => { setStdGens(); updateDesignControls(); });
  $('dBlockMode').addEventListener('change', updateDesignControls);
  $('dNB').addEventListener('change', () => { $('dBGens').value = ''; });
  $('btnStdGens').addEventListener('click', setStdGens);
  $('btnAutoBG').addEventListener('click', () => { try { autoBlockGens(); msg('designMsg'); } catch (e) { msg('designMsg', 'err', esc(e.message)); } });
  $('btnGen').addEventListener('click', () => { try { generateDesign(); } catch (e) { msg('designMsg', 'err', esc(e.message)); } });

  function generateDesign(silent) {
    readFactorTable();
    const { k, p, gens, group } = currentGroup();
    const reps = Math.max(1, Math.min(20, +$('dReps').value || 1));
    const blockMode = $('dBlockMode').value;
    const centers = Math.max(0, +$('dCP').value || 0);
    if (blockMode === 'reps' && reps < 2) throw new Error('Para usar cada réplica como bloque se necesitan al menos 2 réplicas.');
    let blockGens = [];
    if (blockMode === 'conf') {
      const q = Math.log2(+$('dNB').value);
      const txt = $('dBGens').value.trim();
      blockGens = txt ? txt.split(/[,;\s]+/).filter(Boolean).map(w => D.parseWord(w, k)) : autoBlockGens();
      if (blockGens.length !== q) throw new Error(`Para ${1 << q} bloques se requieren ${q} generador(es) de bloque.`);
      for (const w of blockGens) { const conf = D.blockConfounded([w], group)[0]; if (conf.some(x => D.order(x) === 1)) throw new Error(`El generador de bloque ${D.wname(w)} confunde un efecto principal con los bloques.`); }
    }
    const factors = state.factors.slice(0, k).map((f, i) => {
      const lo = num(f.low), hi = num(f.high); const numeric = isFinite(lo) && isFinite(hi);
      if (numeric && lo === hi) throw new Error(`El factor ${D.L[i]} tiene niveles iguales.`);
      if (!numeric && (!f.low || !f.high || f.low === f.high)) throw new Error(`Defina dos niveles distintos para el factor ${D.L[i]}.`);
      return { letter: D.L[i], name: f.name || D.L[i], low: numeric ? lo : f.low, high: numeric ? hi : f.high, numeric, unit: f.unit };
    });
    if (centers > 0) { const bad = factors.filter(f => !f.numeric); if (bad.length) throw new Error(`Los puntos centrales requieren factores numéricos (revise ${bad.map(f => f.letter).join(', ')}).`); }
    const names = factors.map(f => f.name); if (new Set(names).size !== names.length) throw new Error('Los nombres de los factores deben ser distintos.');
    const des = D.generate({ k, p, gens, reps, blockMode, blockGens, centers, randomize: $('dRand').checked, seed: +$('dSeed').value || 1 });
    const prev = state.design && state.design.sig === sigOf(des, factors) ? state.design.runs : null;
    des.runs.forEach((r, i) => { r.y = prev && prev[i] ? prev[i].y : ''; });
    des.factors = factors; des.gens = gens; des.sig = sigOf(des, factors); des.sortBy = 'run';
    state.design = des;
    renderDesign(); if (!silent) msg('designMsg', 'ok', `Diseño generado: ${des.runs.length} corridas.`);
    save();
  }
  const sigOf = (des, factors) => JSON.stringify([des.k, des.p, des.reps, des.blockMode, des.blockGens, des.centers, des.runs.map(r => r.run), factors.map(f => [f.name, f.low, f.high])]);
  const realOf = (f, x) => (f.numeric ? +(f.low + (x + 1) / 2 * (f.high - f.low)).toPrecision(10) : (x < 0 ? f.low : f.high));

  function renderDesign() {
    const d = state.design; if (!d) { $('designOut').innerHTML = ''; return; }
    const title = d.p ? `2${sup(d.k + '-' + d.p)} fraccionado` : `2${sup(d.k)} completo`;
    let h = `<div class="card"><h2>Resumen del diseño</h2><div class="kv">
      <div><span>Diseño</span><b>${title}</b></div>
      <div><span>Resolución</span><b>${d.p ? D.roman(d.resolution) : 'Completo'}</b></div>
      <div><span>Corridas por réplica</span><b>${d.runsPerRep}</b></div>
      <div><span>Réplicas</span><b>${d.reps}</b></div>
      <div><span>Bloques</span><b>${d.nBlocks}</b></div>
      <div><span>Puntos centrales</span><b>${d.centers * d.nBlocks}</b></div>
      <div><span>Corridas totales</span><b>${d.runs.length}</b></div>
      <div><span>gl para el error (modelo saturado)</span><b>${dfFullEstimate(d)}</b></div></div>`;
    if (d.p) {
      h += `<p><b>Generadores:</b> <span class="mono">${d.gens.map(g => `${D.L[g.target]} = ${g.sign < 0 ? '−' : ''}${D.wname(g.word)}`).join(', ')}</span></p>`;
      h += `<p><b>Relación definidora:</b> <span class="mono">I = ${d.group.map(g => (g.s < 0 ? '−' : '') + D.wname(g.w)).join(' = ')}</span></p>`;
      h += `<p class="hint">Patrón de longitud de palabras (A₃, A₄, …): ${D.wordLengthPattern(d.group, d.k).join(', ')}. ${resText(d.resolution)}</p>`;
    }
    if (d.blockMode === 'conf') {
      h += `<p><b>Generadores de bloque:</b> <span class="mono">${d.blockGens.map(D.wname).join(', ')}</span></p>`;
      h += `<p><b>Efectos confundidos con bloques:</b> <span class="mono">${d.confounded.map(c => c.filter(w => D.order(w) <= 4).map(D.wname).join(' = ')).join(' ; ')}</span></p>`;
    } else if (d.blockMode === 'reps') h += `<p><b>Bloques:</b> cada réplica es un bloque (ningún efecto confundido).</p>`;
    h += '</div>';
    if (d.p) {
      h += `<div class="card"><h2>Estructura de alias</h2><div class="inline hint">Mostrar alias hasta orden <select id="aliasOrdD"><option>2</option><option selected>3</option><option>4</option><option value="9">todo</option></select></div>
      <div class="table-wrap short"><table class="tbl" id="aliasTbl"></table></div></div>`;
    }
    h += `<div class="card"><h2>Hoja de trabajo</h2>
      <div class="inline"><label class="check" style="margin:0"><input type="radio" name="dsort" value="run" ${d.sortBy === 'run' ? 'checked' : ''}> Orden de corrida</label>
      <label class="check" style="margin:0"><input type="radio" name="dsort" value="std" ${d.sortBy === 'std' ? 'checked' : ''}> Orden estándar</label></div>
      <div class="table-wrap short" style="max-height:520px"><table class="tbl" id="sheet"></table></div>
      <div class="actions"><button class="primary" id="btnUseDesign">Analizar con estas respuestas</button><button class="ghost" id="btnDlDesign">Descargar hoja (CSV)</button><button class="ghost" id="btnClearY">Borrar respuestas</button></div>
      <p class="hint">Escriba las respuestas directamente o descargue la hoja, complétela en Excel y cárguela en la pestaña Datos.</p></div>`;
    $('designOut').innerHTML = h;
    renderSheet();
    if (d.p) { const f = () => renderAliasTable(+$('aliasOrdD').value); $('aliasOrdD').addEventListener('change', f); f(); }
    document.querySelectorAll('input[name=dsort]').forEach(r => r.addEventListener('change', e => { d.sortBy = e.target.value; renderSheet(); }));
    $('btnUseDesign').addEventListener('click', useDesignForAnalysis);
    $('btnDlDesign').addEventListener('click', () => download('diseno_2k.csv', toCSV(designDataset())));
    $('btnClearY').addEventListener('click', () => { if (confirm('¿Borrar todas las respuestas capturadas?')) { d.runs.forEach(r => { r.y = ''; }); renderSheet(); save(); } });
  }
  function dfFullEstimate(d) {
    try {
      const prep = A.prepare({ X: d.runs.map(r => r.x), y: d.runs.map(() => 0), block: d.nBlocks > 1 ? d.runs.map(r => String(r.block)) : null });
      return A.estimability(prep, { blocks: true, curv: true }).dfResidualFull;
    } catch (e) { return '—'; }
  }
  const resText = r => ({ 3: 'Resolución III: los efectos principales están confundidos con interacciones de dos factores.', 4: 'Resolución IV: los efectos principales están libres de interacciones de dos factores, pero éstas se confunden entre sí.', 5: 'Resolución V: efectos principales e interacciones de dos factores libres entre sí.' }[r] || (r > 5 ? 'Resolución alta: efectos principales e interacciones de dos factores prácticamente libres.' : ''));
  function renderAliasTable(maxOrd) {
    const d = state.design;
    const rows = d.classes.filter(c => D.order(c.rep) <= Math.max(2, Math.min(maxOrd, d.k)));
    $('aliasTbl').innerHTML = '<thead><tr><th>Efecto estimable</th><th class="l">Cadena de alias</th></tr></thead><tbody>' +
      rows.map(c => `<tr><td><b>${D.wname(c.rep)}</b></td><td class="l mono">${esc(D.chainText(c, maxOrd))}</td></tr>`).join('') + '</tbody>';
  }
  function renderSheet() {
    const d = state.design; const runs = d.runs.slice().sort((a, b) => (d.sortBy === 'run' ? a.run - b.run : a.std - b.std));
    let h = `<thead><tr><th>Est.</th><th>Corrida</th><th>Tipo</th>${d.nBlocks > 1 ? '<th>Bloque</th>' : ''}${d.factors.map(f => `<th>${esc(f.letter)}: ${esc(f.name)}${f.unit ? ` (${esc(f.unit)})` : ''}</th>`).join('')}<th>Respuesta</th></tr></thead><tbody>`;
    runs.forEach(r => {
      const i = d.runs.indexOf(r);
      h += `<tr class="${r.type === 0 ? 'ctr' : ''}"><td>${r.std}</td><td>${r.run}</td><td>${r.type ? 'Factorial' : 'Centro'}</td>${d.nBlocks > 1 ? `<td>${r.block}</td>` : ''}` +
        d.factors.map((f, j) => `<td>${esc(realOf(f, r.x[j]))} <span class="alias">(${r.x[j] > 0 ? '+1' : r.x[j] < 0 ? '−1' : '0'})</span></td>`).join('') +
        `<td><input data-i="${i}" class="yin" inputmode="decimal" value="${esc(r.y)}"></td></tr>`;
    });
    $('sheet').innerHTML = h + '</tbody>';
    $('sheet').querySelectorAll('.yin').forEach(inp => {
      inp.addEventListener('input', e => { d.runs[+e.target.dataset.i].y = e.target.value; saveSoon(); });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const all = [...$('sheet').querySelectorAll('.yin')]; const nx = all[all.indexOf(e.target) + 1]; if (nx) nx.focus(); } });
      inp.addEventListener('paste', e => {
        const t = (e.clipboardData || window.clipboardData).getData('text'); const vals = t.split(/[\r\n\t]+/).map(s => s.trim()).filter(Boolean);
        if (vals.length > 1) { e.preventDefault(); const all = [...$('sheet').querySelectorAll('.yin')]; let k = all.indexOf(e.target); vals.forEach(v => { if (all[k]) { all[k].value = v; d.runs[+all[k].dataset.i].y = v; } k++; }); save(); }
      });
    });
  }
  function designDataset() {
    const d = state.design; const runs = d.runs.slice().sort((a, b) => a.run - b.run);
    const headers = ['OrdenEst', 'OrdenCorrida', 'TipoPt', 'Bloque', ...d.factors.map(f => f.name), 'Respuesta'];
    const rows = runs.map(r => [r.std, r.run, r.type, r.block, ...d.factors.map((f, j) => realOf(f, r.x[j])), r.y].map(String));
    const meta = {}; d.factors.forEach(f => { meta[f.name] = { low: f.low, high: f.high, unit: f.unit }; });
    return { headers, rows, meta, source: 'design' };
  }
  function useDesignForAnalysis() {
    const ds = designDataset(); const filled = ds.rows.filter(r => isFinite(num(r[r.length - 1]))).length;
    if (filled < 3) { msg('designMsg', 'warn', 'Capture las respuestas en la hoja de trabajo antes de analizar.'); return; }
    loadDataset(ds, 'Datos tomados de la hoja de trabajo del diseño.');
    analyzeFromMapping();
  }

  /* ============================================================ DATOS */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const first = text.split('\n').find(l => l.trim()) || '';
    const cnt = ch => (first.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
    const delim = ['\t', ';', ','].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur.trim()); cur = ''; }
      else if (c === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
    return tableToDataset(rows);
  }
  /** Convierte una tabla (arreglo de filas) en conjunto de datos: detecta la fila de encabezados y quita columnas vacías */
  function tableToDataset(rows) {
    let clean = rows.map(r => r.map(v => (v == null ? '' : String(v).trim()))).filter(r => r.some(v => v !== ''));
    if (clean.length < 2) throw new Error('El archivo debe tener encabezados y al menos una fila de datos.');
    const filled = r => r.filter(v => v !== '').length;
    const maxW = Math.max(...clean.map(filled));
    const hi = clean.findIndex(r => filled(r) >= Math.max(2, Math.ceil(maxW * 0.6)));
    clean = clean.slice(Math.max(0, hi));
    const width = Math.max(...clean.map(r => r.length));
    const keep = [...Array(width).keys()].filter(j => clean.some(r => (r[j] || '') !== ''));
    clean = clean.map(r => keep.map(j => r[j] || ''));
    if (clean.length < 2) throw new Error('No se encontraron filas de datos debajo de los encabezados.');
    let headers = clean[0].map((h, i) => h || `Col${i + 1}`);
    const seen = {}; headers = headers.map(h => { if (seen[h]) { seen[h]++; return `${h}_${seen[h]}`; } seen[h] = 1; return h; });
    return { headers, rows: clean.slice(1).map(r => headers.map((_, i) => (r[i] == null ? '' : r[i]))) };
  }
  let xlsxReady = null;
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    if (!xlsxReady) xlsxReady = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'js/xlsx.full.min.js'; s.onload = res;
      s.onerror = () => { xlsxReady = null; rej(new Error('No se pudo cargar el lector de Excel.')); }; document.head.appendChild(s);
    });
    return xlsxReady;
  }
  let workbook = null, workbookName = '';
  function sheetDataset(name) {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
    return tableToDataset(rows.map(r => r.map(v => (typeof v === 'number' ? String(+v.toPrecision(15)) : v instanceof Date ? v.toISOString().slice(0, 10) : v))));
  }
  async function readExcel(f) {
    msg('dataMsg', 'info', `Leyendo ${esc(f.name)}…`);
    await loadXLSX();
    const buf = await f.arrayBuffer();
    workbook = XLSX.read(buf, { type: 'array', cellDates: true }); workbookName = f.name;
    const names = workbook.SheetNames;
    const usable = names.filter(n => { try { sheetDataset(n); return true; } catch (e) { return false; } });
    if (!usable.length) throw new Error('Ninguna hoja del libro contiene una tabla con encabezados y datos.');
    $('sheetSel').innerHTML = names.map(n => `<option value="${esc(n)}" ${usable.includes(n) ? '' : 'disabled'}>${esc(n)}${usable.includes(n) ? '' : ' (vacía)'}</option>`).join('');
    $('sheetSel').value = usable[0]; $('sheetWrap').hidden = names.length < 2;
    loadDataset(sheetDataset(usable[0]), `Archivo cargado: ${esc(f.name)}${names.length > 1 ? `, hoja “${esc(usable[0])}”` : ''}.`);
  }
  $('sheetSel').addEventListener('change', () => {
    try { const n = $('sheetSel').value; loadDataset(sheetDataset(n), `Archivo ${esc(workbookName)}, hoja “${esc(n)}”.`); } catch (err) { msg('dataMsg', 'err', esc(err.message)); }
  });
  $('fileInput').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(f.name)) { readExcel(f).catch(err => msg('dataMsg', 'err', esc(err.message))); e.target.value = ''; return; }
    $('sheetWrap').hidden = true;
    const rd = new FileReader();
    rd.onload = ev => { try { loadDataset(parseCSV(ev.target.result), `Archivo cargado: ${esc(f.name)}`); } catch (err) { msg('dataMsg', 'err', esc(err.message)); } };
    rd.readAsText(f); e.target.value = '';
  });
  $('btnPaste').addEventListener('click', () => { try { loadDataset(parseCSV($('pasteArea').value), 'Datos pegados.'); } catch (err) { msg('dataMsg', 'err', esc(err.message)); } });
  $('exampleSel').addEventListener('change', e => { const v = e.target.value; if (!v) return; loadDataset(EXAMPLES[v](), 'Ejemplo cargado.'); e.target.value = ''; analyzeFromMapping(); });
  $('mTrans').addEventListener('change', () => { $('mLambda').hidden = $('mTrans').value !== 'pow'; });

  const stdRows = k => { const r = []; for (let i = 0; i < 1 << k; i++) r.push([...Array(k)].map((_, j) => ((i >> j) & 1 ? 1 : -1))); return r; };
  const EXAMPLES = {
    filt: () => { const y = [45, 71, 48, 65, 68, 60, 80, 65, 43, 100, 45, 104, 75, 86, 70, 96]; return { headers: ['Temperatura', 'Presion', 'Concentracion', 'Agitacion', 'Filtracion'], rows: stdRows(4).map((x, i) => [...x, y[i]].map(String)) }; },
    filtBlk: () => { const y = [45, 71, 48, 65, 68, 60, 80, 65, 43, 100, 45, 104, 75, 86, 70, 96]; return { headers: ['Bloque', 'Temperatura', 'Presion', 'Concentracion', 'Agitacion', 'Filtracion'], rows: stdRows(4).map((x, i) => { const b = x.reduce((a, c) => a * c, 1) > 0 ? 1 : 2; return [b, ...x, b === 1 ? y[i] - 20 : y[i]].map(String); }) }; },
    frac: () => { const y = [45, 100, 45, 65, 75, 60, 80, 96]; return { headers: ['Temperatura', 'Presion', 'Concentracion', 'Agitacion', 'Filtracion'], rows: stdRows(3).map((x, i) => [...x, x[0] * x[1] * x[2], y[i]].map(String)) }; },
    etch: () => {
      const y = [[550, 604], [669, 650], [633, 601], [642, 635], [1037, 1052], [749, 868], [1075, 1063], [729, 860]]; const rows = [];
      [0, 1].forEach(r => stdRows(3).forEach((x, i) => rows.push([r + 1, x[0] < 0 ? 0.8 : 1.2, x[1] < 0 ? 125 : 200, x[2] < 0 ? 275 : 325, y[i][r]].map(String))));
      return { headers: ['Replica', 'Separacion_cm', 'Flujo_C2F6_sccm', 'Potencia_W', 'TasaGrabado'], rows };
    },
    center: () => {
      const rows = [[30, 150, 39.3], [40, 150, 40.9], [30, 160, 40.0], [40, 160, 41.5], [35, 155, 40.3], [35, 155, 40.5], [35, 155, 40.7], [35, 155, 40.2], [35, 155, 40.6]];
      return { headers: ['Tiempo_min', 'Temperatura_F', 'Rendimiento'], rows: rows.map(r => r.map(String)) };
    }
  };

  function colInfo(ds, j) {
    const vals = ds.rows.map(r => r[j]).filter(v => v !== ''); const nums = vals.map(num);
    const numeric = vals.length > 0 && nums.every(isFinite);
    const distinct = [...new Set(numeric ? nums : vals)];
    return { numeric, distinct: distinct.length, vals: distinct };
  }
  function loadDataset(ds, note) {
    state.dataset = ds; const H = ds.headers; const info = H.map((_, j) => colInfo(ds, j));
    const find = re => H.findIndex(h => re.test(h));
    let iBlock = find(/^(bloque|block)s?$/i); if (iBlock >= 0 && info[iBlock].distinct < 2) iBlock = -1;
    const iRun = find(/^(orden ?corrida|ordencorrida|run ?order|runorder|corrida)$/i);
    const skip = /^(orden ?est|ordenest|std ?order|stdorder|tipo ?pt|tipopt|pttype|cen?ter ?pt|r[eé]plica|replicate|rep)$/i;
    let iResp = find(/^(respuesta|response|y)$/i);
    const factorLike = j => j !== iBlock && j !== iRun && !skip.test(H[j]) && ((info[j].numeric && info[j].distinct >= 2 && info[j].distinct <= 3) || (!info[j].numeric && info[j].distinct === 2));
    if (iResp < 0) { for (let j = H.length - 1; j >= 0; j--) if (info[j].numeric && !factorLike(j) && j !== iBlock && j !== iRun && !skip.test(H[j])) { iResp = j; break; } }
    if (iResp < 0) iResp = H.length - 1;
    const factors = H.map((_, j) => j).filter(j => j !== iResp && factorLike(j));
    const opt = (sel, none) => (none ? '<option value="-1">— ninguna —</option>' : '') + H.map((h, j) => `<option value="${j}" ${j === sel ? 'selected' : ''}>${esc(h)}</option>`).join('');
    $('mResp').innerHTML = opt(iResp, false); $('mBlock').innerHTML = opt(iBlock, true); $('mRun').innerHTML = opt(iRun, true);
    if (iBlock < 0) $('mBlock').value = '-1'; if (iRun < 0) $('mRun').value = '-1';
    $('mFactors').innerHTML = H.map((h, j) => `<label data-j="${j}"><input type="checkbox" value="${j}" ${factors.includes(j) ? 'checked' : ''}><span class="ltr"></span>${esc(h)}</label>`).join('');
    $('mFactors').querySelectorAll('input').forEach(c => c.addEventListener('change', updateChips));
    updateChips();
    $('preview').innerHTML = `<table class="tbl"><thead><tr>${H.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${ds.rows.slice(0, 60).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${ds.rows.length > 60 ? `<p class="hint">… ${ds.rows.length - 60} filas más</p>` : ''}`;
    $('mapCard').hidden = false;
    msg('dataMsg', 'ok', `${note || ''} ${ds.rows.length} filas × ${H.length} columnas. Revise la asignación de columnas.`);
    save();
  }
  function updateChips() {
    let k = 0;
    $('mFactors').querySelectorAll('label').forEach(l => {
      const c = l.querySelector('input'); l.classList.toggle('on', c.checked);
      l.querySelector('.ltr').textContent = c.checked ? (D.L[k++] || '×') : '';
    });
  }
  $('btnAnalyze').addEventListener('click', analyzeFromMapping);

  function analyzeFromMapping() {
    try {
      const ds = state.dataset; if (!ds) throw new Error('No hay datos cargados.');
      const jy = +$('mResp').value, jb = +$('mBlock').value, jr = +$('mRun').value;
      const fj = [...$('mFactors').querySelectorAll('input:checked')].map(c => +c.value);
      if (fj.length < 2) throw new Error('Seleccione al menos dos factores.');
      if (fj.length > 8) throw new Error('El máximo es de 8 factores.');
      if (fj.includes(jy)) throw new Error('La respuesta no puede ser también un factor.');
      const tr = $('mTrans').value; const lam = +$('mLambda').value; const T = A.transforms[tr];
      if (tr === 'pow' && !(lam !== 0 && isFinite(lam))) throw new Error('Indique un λ distinto de cero.');
      const rows = ds.rows.filter(r => isFinite(num(r[jy])));
      const skipped = ds.rows.length - rows.length;
      if (rows.length < 4) throw new Error('Se requieren al menos 4 observaciones con respuesta numérica.');
      const yRaw = rows.map(r => num(r[jy]));
      if (T.pos && yRaw.some(v => !(v > 0))) throw new Error(`La transformación ${T.label} requiere respuestas positivas.`);
      if (T.nonneg && yRaw.some(v => v < 0)) throw new Error('La transformación √y requiere respuestas no negativas.');
      const y = yRaw.map(v => T.f(v, lam));
      const factors = fj.map((j, i) => {
        const name = ds.headers[j]; const vals = rows.map(r => r[j]); const nums = vals.map(num);
        const meta = ds.meta && ds.meta[name];
        if (nums.every(isFinite)) {
          let lo = Math.min(...nums), hi = Math.max(...nums);
          if (meta && isFinite(meta.low) && isFinite(meta.high)) { lo = +meta.low; hi = +meta.high; }
          if (lo === hi) throw new Error(`El factor ${name} tiene un solo nivel.`);
          const c = (lo + hi) / 2, h = (hi - lo) / 2;
          return { letter: D.L[i], name, numeric: true, center: c, half: h, low: lo, high: hi, unit: meta ? meta.unit : '', coded: nums.map(v => Math.round((v - c) / h * 1e9) / 1e9), real: nums };
        }
        const lv = [...new Set(vals)].sort();
        let lowL = lv[0], highL = lv[1];
        if (meta && lv.includes(meta.low) && lv.includes(meta.high)) { lowL = meta.low; highL = meta.high; }
        if (lv.length !== 2) throw new Error(`El factor de texto ${name} debe tener exactamente 2 niveles (tiene ${lv.length}).`);
        const coded = vals.map(v => (v === lowL ? -1 : 1));
        return { letter: D.L[i], name, numeric: false, low: lowL, high: highL, center: 0, half: 1, coded, real: coded };
      });
      const X = rows.map((_, t) => factors.map(f => f.coded[t]));
      const R = rows.map((_, t) => factors.map(f => f.real[t]));
      const odd = X.filter(x => x.some(v => Math.abs(v) > 1 + 1e-9 || (Math.abs(v) > 1e-9 && Math.abs(Math.abs(v) - 1) > 1e-9))).length;
      const block = jb >= 0 ? rows.map(r => String(r[jb]).trim()) : null;
      const runOrder = jr >= 0 ? rows.map((r, t) => (isFinite(num(r[jr])) ? num(r[jr]) : t + 1)) : rows.map((_, t) => t + 1);
      const prep = A.prepare({ X, R, y, yRaw, block, runOrder });
      prep.factors = factors; prep.respName = ds.headers[jy]; prep.trans = { key: tr, lam, label: tr === 'pow' ? `y^${lam}` : T.label };
      prep.notes = []; if (skipped) prep.notes.push(`${skipped} fila(s) sin respuesta numérica fueron omitidas.`);
      if (odd) prep.notes.push(`${odd} corrida(s) tienen niveles distintos de −1, 0, +1 (se tratan como puntos adicionales en la regresión).`);
      state.prep = prep; state.mapping = { jy, jb, jr, fj, tr, lam };
      state.opts.blocks = $('oBlocks').checked = true;
      refreshEstimability(true);
      showTab('analysis');
      save();
    } catch (e) { msg('dataMsg', 'err', esc(e.message)); showTab('data'); }
  }

  /* ============================================================ ANÁLISIS */
  function refreshEstimability(resetTerms) {
    const prep = state.prep; state.est = A.estimability(prep, state.opts);
    const est = state.est.estimable;
    if (resetTerms || !state.terms.length) state.terms = est.slice();
    else { state.terms = state.terms.filter(w => est.includes(w)); if (!state.terms.length) state.terms = est.filter(w => D.order(w) === 1); }
    state.full = A.fit(prep, est, state.opts);
    const eff = state.full.coefs.filter(c => c.kind === 'term').map(c => ({ w: c.w, name: c.name, effect: c.effect }));
    state.lenth = A.lenth(eff, state.opts.alpha);
    runModel();
  }
  function runModel() {
    state.fit = A.fit(state.prep, state.terms, state.opts);
    state.lenth = A.lenth(state.full.coefs.filter(c => c.kind === 'term').map(c => ({ w: c.w, name: c.name, effect: c.effect })), state.opts.alpha);
    renderAnalysis(); renderPlots(); renderDiag(); renderOpt();
    ['anEmpty', 'plEmpty', 'dgEmpty', 'opEmpty'].forEach(id => { $(id).hidden = true; });
    ['anBody', 'plBody', 'dgBody', 'opBody'].forEach(id => { $(id).hidden = false; });
    saveSoon();
  }
  $('oAlpha').addEventListener('change', () => { const a = +$('oAlpha').value; if (a > 0 && a < 0.5) { state.opts.alpha = a; if (state.prep) refreshEstimability(false); } });
  $('oAliasOrd').addEventListener('change', () => { state.opts.aliasOrd = +$('oAliasOrd').value; if (state.prep) renderAnalysis(); });
  $('oBlocks').addEventListener('change', () => { state.opts.blocks = $('oBlocks').checked; if (state.prep) refreshEstimability(false); });
  $('oCurv').addEventListener('change', () => { state.opts.curv = $('oCurv').checked; if (state.prep) refreshEstimability(false); });
  document.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => {
    if (!state.prep) return; const est = state.est.estimable; const v = b.dataset.sel; msg('anMsg');
    if (v === 'all') state.terms = est.slice();
    else if (/^\d$/.test(v)) state.terms = est.filter(w => D.order(w) <= +v);
    else if (v === 'lenth') {
      const sig = state.lenth ? state.lenth.rows.filter(r => r.sigME).map(r => r.w) : [];
      if (!sig.length) { msg('anMsg', 'warn', 'Ningún efecto supera el margen de error de Lenth.'); return; }
      state.terms = A.closeHierarchy(sig, est);
    } else if (v === 'reduce') {
      if (state.fit.summary.dfE <= 0) { msg('anMsg', 'warn', 'El modelo actual no tiene grados de libertad para el error. Seleccione primero los efectos significativos según Lenth o elimine términos de orden alto.'); return; }
      const r = A.reduce(state.prep, state.terms, state.opts); state.terms = r.terms;
      runModel();
      msg('anMsg', 'info', r.removed.length ? `Eliminación hacia atrás (respetando jerarquía): se retiraron ${r.removed.map(x => `${D.wname(x.w)} (p = ${fmtPtxt(x.p)})`).join(', ')}.` : 'Todos los términos removibles son significativos.');
      return;
    }
    runModel();
  }));

  function renderTermList() {
    const est = state.est; const set = new Set(state.terms); const mo = state.opts.aliasOrd;
    let h = ''; let lastO = 0;
    est.estimable.forEach(w => {
      const o = D.order(w); if (o !== lastO) { h += `<div class="grp">${o === 1 ? 'Efectos principales' : `Interacciones de ${o} factores`}</div>`; lastO = o; }
      const al = A.aliasText(est, w, mo);
      h += `<label title="${esc(D.wname(w) + al)}"><input type="checkbox" value="${w}" ${set.has(w) ? 'checked' : ''}><span class="tn">${D.wname(w)}</span><span class="ta">${esc(al)}</span></label>`;
    });
    $('termList').innerHTML = h;
    $('termList').querySelectorAll('input').forEach(c => c.addEventListener('change', () => {
      state.terms = [...$('termList').querySelectorAll('input:checked')].map(x => +x.value);
      if (!state.terms.length) { c.checked = true; state.terms = [+c.value]; }
      runModel();
    }));
    let notes = '';
    if (est.meanAlias.length) notes += `<p><b>Alias de la media (relación definidora):</b> <span class="mono">I = ${est.meanAlias.map(m => (m.s < 0 ? '−' : '') + D.wname(m.w)).join(' = ')}</span></p>`;
    if (est.blockConf.length) notes += `<p><b>Confundidos con bloques:</b> <span class="mono">${est.blockConf.filter(w => D.order(w) <= Math.max(mo, 3)).map(D.wname).join(', ')}</span></p>`;
    if (est.dependent.length) notes += `<p>${est.dependent.length} efecto(s) no estimable(s) por la estructura de los datos.</p>`;
    $('termNotes').innerHTML = notes;
  }

  const fName = i => state.prep.factors[i].name;
  const termLabel = w => D.wname(w);
  const termLong = w => [...Array(8).keys()].filter(j => (w >> j) & 1).map(fName).join(' × ');

  function renderAnalysis() {
    renderTermList();
    const prep = state.prep, fit = state.fit, est = state.est, sm = fit.summary, a = state.opts.alpha;
    const warn = [];
    prep.notes.forEach(n => warn.push(['info', n]));
    if (sm.dfE <= 0) warn.push(['warn', 'Modelo saturado: no quedan grados de libertad para estimar el error, por lo que no hay pruebas F ni t. Use el método de Lenth y las gráficas normal y semi-normal de efectos para identificar efectos activos; después reduzca el modelo para obtener un error estimado.']);
    if (fit.dropped.length) warn.push(['warn', `Términos no estimables (descartados): ${fit.dropped.map(D.wname).join(', ')}.`]);
    const miss = A.hierarchyMissing(state.terms, est.estimable);
    if (miss.length) warn.push(['warn', `El modelo no es jerárquico; faltan ${miss.map(D.wname).join(', ')}. La ecuación en unidades reales no se reportará.`]);
    const curv = fit.anova.find(r => r.source === 'Curvatura');
    if (curv && curv.p < a) warn.push(['err', `La curvatura es significativa (p = ${fmtPtxt(curv.p)}): el modelo de primer orden con interacciones no describe bien el centro de la región. Considere ampliar a un diseño central compuesto (superficie de respuesta).`]);
    if (fit.lof && fit.lof.p < a) warn.push(['err', `Falta de ajuste significativa (p = ${fmtPtxt(fit.lof.p)}): el modelo no explica adecuadamente la variación entre combinaciones.`]);
    if (prep.trans.key !== 'none') warn.push(['info', `Respuesta analizada en escala transformada: ${esc(prep.trans.label)}.`]);
    $('anMsg').innerHTML = warn.map(([t, m]) => `<div class="msg ${t}">${m}</div>`).join('');

    // información
    const cells = new Set(prep.X.map(x => x.join('|'))).size;
    let h = `<h2>Información del diseño y de los datos</h2><div class="kv">
      <div><span>Observaciones</span><b>${prep.n}</b></div><div><span>Puntos factoriales</span><b>${prep.nFact}</b></div>
      <div><span>Puntos centrales</span><b>${prep.nCenter}</b></div><div><span>Combinaciones distintas</span><b>${cells}</b></div>
      <div><span>Bloques</span><b>${prep.blocks ? prep.blocks.length : 1}</b></div><div><span>Efectos estimables</span><b>${est.estimable.length}</b></div>
      <div><span>gl error (modelo completo)</span><b>${est.dfResidualFull}</b></div><div><span>Respuesta</span><b>${esc(prep.respName)}</b></div></div>`;
    h += `<div class="table-wrap"><table class="tbl"><thead><tr><th>Factor</th><th class="l">Nombre</th><th>Bajo (−1)</th><th>Alto (+1)</th><th>Centro (0)</th></tr></thead><tbody>` +
      prep.factors.map(f => `<tr><td><b>${f.letter}</b></td><td class="l">${esc(f.name)}</td><td>${esc(f.low)}</td><td>${esc(f.high)}</td><td>${f.numeric ? fmt(f.center, 4).replace(/\.?0+$/, '') : '—'}</td></tr>`).join('') + '</tbody></table></div>';
    const aliased = est.estimable.filter(w => est.aliases.get(w).length > 1);
    if (aliased.length) h += `<h3>Estructura de alias detectada</h3><div class="table-wrap short"><table class="tbl"><thead><tr><th>Efecto</th><th class="l">Alias</th></tr></thead><tbody>${aliased.map(w => `<tr><td><b>${D.wname(w)}</b></td><td class="l mono">${esc(D.wname(w) + A.aliasText(est, w, state.opts.aliasOrd))}</td></tr>`).join('')}</tbody></table></div>`;
    if (est.meanAlias.length) h += `<p><b>Relación definidora detectada:</b> <span class="mono">I = ${est.meanAlias.map(m => (m.s < 0 ? '−' : '') + D.wname(m.w)).join(' = ')}</span> (resolución ${D.roman(Math.min(...est.meanAlias.map(m => D.order(m.w))))})</p>`;
    if (est.blockConf.length) h += `<p><b>Efectos confundidos con bloques:</b> <span class="mono">${est.blockConf.map(D.wname).join(', ')}</span></p>`;
    $('anInfo').innerHTML = h;

    // coeficientes
    const sig = p => (isFinite(p) && p < a ? 'sig' : '');
    h = `<h2>Efectos y coeficientes codificados</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Término</th><th>Efecto</th><th>Coeficiente</th><th>EE coef.</th><th>t</th><th>Valor p</th><th>IC ${Math.round((1 - a) * 100)} % coef.</th><th>FIV</th></tr></thead><tbody>`;
    fit.coefs.forEach(c => {
      const nm = c.kind === 'term' ? `<b>${c.name}</b> <span class="alias">${esc(A.aliasText(est, c.w, state.opts.aliasOrd))}</span>` : esc(c.name);
      h += `<tr><td title="${c.kind === 'term' ? esc(termLong(c.w)) : ''}">${nm}</td><td>${c.kind === 'term' ? fmt(c.effect) : ''}</td><td>${fmt(c.coef)}</td><td>${fmt(c.se)}</td><td>${fmt(c.t, 3)}</td><td class="${sig(c.p)}">${fmtP(c.p)}</td><td>${sm.dfE > 0 ? `${fmt(c.lo)} ; ${fmt(c.hi)}` : '—'}</td><td>${c.kind === 'int' ? '' : fmt(c.vif, 2)}</td></tr>`;
    });
    h += '</tbody></table></div><p class="hint">Efecto = 2 × coeficiente (cambio medio en la respuesta al pasar de −1 a +1). FIV = 1 indica ortogonalidad; valores mayores aparecen con confusión parcial o datos faltantes.</p>';
    $('anCoef').innerHTML = h;

    // ANOVA
    h = `<h2>Análisis de varianza</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Fuente</th><th>gl</th><th>SC ajustada</th><th>CM ajustado</th><th>F</th><th>Valor p</th></tr></thead><tbody>`;
    fit.anova.forEach(r => {
      const cls = `l${r.level}${r.source === 'Total' || r.source === 'Modelo' || r.source === 'Error' ? ' sum' : ''}`;
      h += `<tr class="${cls}"><td>${esc(r.source)}${r.w ? ` <span class="alias">${esc(termLong(r.w))}</span>` : ''}</td><td>${r.df}</td><td>${fmt(r.ss)}</td><td>${fmt(r.ms)}</td><td>${fmt(r.F, 3)}</td><td class="${sig(r.p)}">${fmtP(r.p)}</td></tr>`;
    });
    h += `</tbody></table></div><h3>Resumen del modelo</h3><div class="kv">
      <div><span>S (√CM error)</span><b>${fmt(sm.s)}</b></div><div><span>R²</span><b>${fmt(sm.r2 * 100, 2)} %</b></div>
      <div><span>R² ajustado</span><b>${fmt(sm.r2adj * 100, 2)} %</b></div><div><span>R² predicción</span><b>${fmt(sm.r2pred * 100, 2)} %</b></div>
      <div><span>PRESS</span><b>${fmt(sm.press)}</b></div><div><span>Media general</span><b>${fmt(sm.ybar)}</b></div></div>
      <p class="hint">SC ajustadas (tipo III). En diseños ortogonales coinciden con las secuenciales. La falta de ajuste se separa del error puro cuando existen réplicas o puntos centrales.</p>`;
    $('anAnova').innerHTML = h;

    // Lenth
    const L = state.lenth;
    if (L) {
      h = `<h2>Método de Lenth (efectos del modelo completo)</h2><div class="kv"><div><span>PSE</span><b>${fmt(L.pse)}</b></div><div><span>ME (margen de error)</span><b>${fmt(L.me)}</b></div><div><span>SME (margen simultáneo)</span><b>${fmt(L.sme)}</b></div><div><span>gl (m/3)</span><b>${fmt(L.df, 2)}</b></div></div>
        <div class="table-wrap short"><table class="tbl"><thead><tr><th>Efecto</th><th>Estimación</th><th>t de Lenth</th><th>p aprox.</th><th>&gt; ME</th><th>&gt; SME</th></tr></thead><tbody>` +
        L.rows.slice().sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect)).map(r => `<tr><td><b>${r.name}</b> <span class="alias">${esc(A.aliasText(est, r.w, state.opts.aliasOrd))}</span></td><td>${fmt(r.effect)}</td><td>${fmt(r.tL, 3)}</td><td class="${sig(r.p)}">${fmtP(r.p)}</td><td>${r.sigME ? '<span class="pill bad">sí</span>' : ''}</td><td>${r.sigSME ? '<span class="pill bad">sí</span>' : ''}</td></tr>`).join('') +
        `</tbody></table></div><p class="hint">PSE = 1.5 × mediana de |efectos| menores a 2.5·s₀ (s₀ = 1.5 × mediana |efectos|). ME = t(1−α/2, m/3)·PSE; SME controla el error de tipo I conjunto. Útil sobre todo en diseños sin réplicas.</p>`;
      $('anLenth').innerHTML = h;
    } else $('anLenth').innerHTML = '';

    // ecuaciones
    const tv = prep.trans.key === 'none' ? 'ŷ' : esc(prep.trans.label.replace('y', 'ŷ'));
    const terms = fit.coefs.filter(c => c.kind === 'term');
    const icp = fit.coefs.find(c => c.kind === 'int');
    let eq = `${tv} = ${fmt(icp.coef)}` + terms.map(c => ` ${c.coef < 0 ? '−' : '+'} ${fmt(Math.abs(c.coef))}·${c.name}`).join('');
    h = `<h2>Ecuación del modelo</h2><p><b>Unidades codificadas:</b></p><p class="mono">${eq}</p>`;
    if (fit.coefs.some(c => c.kind === 'curv')) h += '<p class="hint">El término de curvatura sólo aplica en el punto central; no se incluye en la ecuación.</p>';
    if (fit.coefs.some(c => c.kind === 'block')) h += '<p class="hint">Los efectos de bloque se omiten (ecuación promediada sobre bloques).</p>';
    if (!miss.length && prep.factors.some(f => f.numeric && (f.center !== 0 || f.half !== 1))) {
      const un = A.uncoded(prep, fit);
      if (un) {
        const nm = w => [...Array(8).keys()].filter(j => (w >> j) & 1).map(j => prep.factors[j].name).join('·');
        const cs = un.filter(u => typeof u.name === 'number' || u.name === 'Constante');
        eq = `${tv} = ${fmt(cs[0].coef, 6)}` + cs.slice(1).map(u => ` ${u.coef < 0 ? '−' : '+'} ${fmt(Math.abs(u.coef), 6)}·${esc(nm(u.name))}`).join('');
        h += `<p><b>Unidades reales:</b></p><p class="mono">${eq}</p>`;
      }
    }
    $('anEq').innerHTML = h;
  }

  /* ============================================================ GRÁFICAS */
  const effTerms = () => state.full.coefs.filter(c => c.kind === 'term');
  function sigFull() {
    const full = state.full, a = state.opts.alpha;
    if (full.summary.dfE > 0) return new Set(full.coefs.filter(c => c.kind === 'term' && c.p < a).map(c => c.w));
    return new Set(state.lenth ? state.lenth.rows.filter(r => r.sigME).map(r => r.w) : []);
  }
  function renderPlots() {
    const fit = state.fit, full = state.full, prep = state.prep, L = state.lenth, a = state.opts.alpha;
    // Pareto
    if (fit.summary.dfE > 0) {
      $('plPareto').innerHTML = P.pareto({ items: fit.coefs.filter(c => c.kind === 'term').map(c => ({ label: c.name, v: Math.abs(c.t) })), crit: fit.tcrit, critLabel: `t = ${fit.tcrit.toFixed(3)}`, title: 'Pareto de efectos estandarizados', xlabel: `|t| (α = ${a})` });
    } else if (L) {
      $('plPareto').innerHTML = P.pareto({ items: fit.coefs.filter(c => c.kind === 'term').map(c => ({ label: c.name, v: Math.abs(c.effect) / L.pse })), crit: L.me / L.pse, critLabel: `ME/PSE = ${(L.me / L.pse).toFixed(3)}`, title: 'Pareto de efectos (Lenth)', xlabel: '|efecto| / PSE' });
    } else $('plPareto').innerHTML = '';
    // Normal y semi-normal
    const eff = effTerms(); const sig = sigFull();
    if (eff.length >= 3) {
      const sorted = eff.slice().sort((x, y) => x.effect - y.effect); const m = sorted.length;
      const z = sorted.map((_, i) => S.norminv((i + 0.5) / m));
      const scale = full.summary.dfE > 0 ? 2 * Math.sqrt(full.summary.mse * sorted[0].vjj) : (L ? L.pse : 0);
      const col = sorted.map(c => (sig.has(c.w) ? 'var(--danger)' : 'var(--accent)'));
      const zr = Math.max(...z.map(Math.abs)) * 1.1;
      $('plNormal').innerHTML = P.chart({ id: 'nrm', title: 'Gráfica normal de efectos', xlabel: 'Efecto', ylabel: 'Puntuación normal (z)', series: [{ x: sorted.map(c => c.effect), y: z, colors: col, labels: sorted.map(c => (sig.has(c.w) ? c.name : '')), tips: sorted.map(c => `${c.name}: ${c.effect.toFixed(4)}`) }], lines: scale > 0 ? [{ x1: -zr * scale, y1: -zr, x2: zr * scale, y2: zr, color: 'var(--muted)', dash: '5 4', noScale: true }] : [] }) + legendSig(full);
      const sa = eff.slice().sort((x, y) => Math.abs(x.effect) - Math.abs(y.effect));
      const zh = sa.map((_, i) => S.norminv(0.5 + 0.5 * (i + 0.5) / m));
      $('plHalf').innerHTML = P.chart({ id: 'hlf', title: 'Gráfica semi-normal de efectos', xlabel: '|Efecto|', ylabel: 'Puntuación semi-normal', series: [{ x: sa.map(c => Math.abs(c.effect)), y: zh, colors: sa.map(c => (sig.has(c.w) ? 'var(--danger)' : 'var(--accent)')), labels: sa.map(c => (sig.has(c.w) ? c.name : '')) }], lines: scale > 0 ? [{ x1: 0, y1: 0, x2: zh[m - 1] * 1.1 * scale, y2: zh[m - 1] * 1.1, color: 'var(--muted)', dash: '5 4', noScale: true }] : [] }) + legendSig(full);
    } else { $('plNormal').innerHTML = ''; $('plHalf').innerHTML = ''; }
    // Efectos principales
    const fact = prep.X.map((x, i) => i).filter(i => prep.isFact[i]);
    const meanAt = (cond) => { const v = fact.filter(cond).map(i => prep.y[i]); return v.length ? S.mean(v) : NaN; };
    const cMean = prep.nCenter ? S.mean(prep.y.filter((_, i) => prep.isCenter[i])) : NaN;
    const me = prep.factors.map((f, j) => [meanAt(i => prep.X[i][j] < 0), meanAt(i => prep.X[i][j] > 0)]);
    const allv = me.flat().concat(isFinite(cMean) ? [cMean] : []).filter(isFinite); const yd = [Math.min(...allv), Math.max(...allv)]; const pd = (yd[1] - yd[0]) * 0.12 || 1;
    $('plMain').innerHTML = `<h2>Efectos principales (medias de datos)</h2><div class="plot-grid small">` + prep.factors.map((f, j) => P.chart({
      id: 'me' + j, W: 300, H: 230, title: `${f.letter}: ${f.name}`, ylabel: j === 0 ? 'Media' : '', xcats: [{ v: -1, label: String(f.low) }, { v: 1, label: String(f.high) }], xdom: [-1.4, 1.4], ydom: [yd[0] - pd, yd[1] + pd],
      series: [{ type: 'line', x: [-1, 1], y: me[j], marker: true }].concat(isFinite(cMean) ? [{ x: [0], y: [cMean], shape: 'diamond', color: 'var(--danger)', tips: ['Media de puntos centrales'] }] : [])
    })).join('') + `</div>${isFinite(cMean) ? '<p class="hint">◆ media de los puntos centrales; si se aleja de la línea hay indicios de curvatura.</p>' : ''}`;
    // Interacciones
    let pairs = state.fit.terms.filter(w => D.order(w) === 2);
    if (!pairs.length) { pairs = []; for (let i = 0; i < prep.k; i++) for (let j = i + 1; j < prep.k; j++) pairs.push((1 << i) | (1 << j)); pairs = pairs.slice(0, 6); }
    pairs = pairs.slice(0, 15);
    $('plInter').innerHTML = pairs.map(w => {
      const [i, j] = [...Array(8).keys()].filter(t => (w >> t) & 1); const fi = prep.factors[i], fj = prep.factors[j];
      const m = s => [-1, 1].map(v => meanAt(t => prep.X[t][i] === v && prep.X[t][j] === s));
      return P.chart({ id: 'in' + w, W: 320, H: 240, title: `${fi.letter}×${fj.letter}`, xlabel: fi.name, ylabel: 'Media', xcats: [{ v: -1, label: String(fi.low) }, { v: 1, label: String(fi.high) }], xdom: [-1.3, 1.3],
        series: [{ type: 'line', x: [-1, 1], y: m(-1), marker: true, color: 'var(--accent)', dash: '6 4' }, { type: 'line', x: [-1, 1], y: m(1), marker: true, color: 'var(--danger)' }],
        legend: [{ label: `${fj.letter} = ${fj.low}`, color: 'var(--accent)', dash: '6 4' }, { label: `${fj.letter} = ${fj.high}`, color: 'var(--danger)' }] });
    }).join('') || '<p class="hint">No hay interacciones de dos factores en el modelo.</p>';
    setupCubeContour();
  }
  const legendSig = full => `<p class="hint">En rojo: efectos activos según ${full.summary.dfE > 0 ? 'la prueba t del modelo completo' : 'el margen de error de Lenth'}. La línea punteada representa efectos nulos (ruido).</p>`;

  function factorSelect(id, sel) { $(id).innerHTML = state.prep.factors.map((f, j) => `<option value="${j}" ${j === sel ? 'selected' : ''}>${f.letter}: ${esc(f.name)}</option>`).join(''); }
  function setupCubeContour() {
    const k = state.prep.k;
    if (k >= 3) {
      ['cubeA', 'cubeB', 'cubeC'].forEach((id, i) => { const cur = $(id).value; factorSelect(id, cur !== '' && +cur < k ? +cur : i); $(id).onchange = drawCube; });
      drawCube();
    } else { $('plCube').innerHTML = '<p class="hint">Requiere al menos 3 factores.</p>'; ['cubeA', 'cubeB', 'cubeC'].forEach(id => { $(id).innerHTML = ''; }); }
    ['ctX', 'ctY'].forEach((id, i) => { const cur = $(id).value; factorSelect(id, cur !== '' && +cur < k ? +cur : i); $(id).onchange = () => { buildHolds(); drawContour(); }; });
    buildHolds(); drawContour();
  }
  const backT = v => { const t = state.prep.trans; return t.key === 'none' ? v : A.transforms[t.key].inv(v, t.lam); };
  function drawCube() {
    const ids = ['cubeA', 'cubeB', 'cubeC'].map(id => +$(id).value);
    if (new Set(ids).size < 3) { $('plCube').innerHTML = '<p class="hint">Seleccione tres factores distintos.</p>'; return; }
    const f = state.prep.factors;
    $('plCube').innerHTML = P.cube({ title: 'Respuesta ajustada (otros factores en 0)', names: ids.map(j => `${f[j].letter}: ${f[j].name}`), val: p => { const x = new Array(state.prep.k).fill(0); ids.forEach((j, t) => { x[j] = p[t]; }); return backT(A.predictFast(state.fit, x)); } });
  }
  function buildHolds() {
    const jx = +$('ctX').value, jy = +$('ctY').value; const f = state.prep.factors;
    const prevVals = {}; $('ctHold').querySelectorAll('input').forEach(i => { prevVals[i.dataset.j] = i.value; });
    $('ctHold').innerHTML = f.map((ff, j) => (j === jx || j === jy ? '' : `<label>${ff.letter} fijo en <input type="range" min="-1" max="1" step="0.1" value="${prevVals[j] || 0}" data-j="${j}"><span id="hv${j}"></span></label>`)).join('');
    $('ctHold').querySelectorAll('input').forEach(i => { const upd = () => { const j = +i.dataset.j; $('hv' + j).textContent = `${(+i.value).toFixed(1)}${f[j].numeric ? ` → ${+(f[j].center + f[j].half * i.value).toPrecision(6)}` : ''}`; }; upd(); i.addEventListener('input', () => { upd(); drawContour(); }); });
  }
  function drawContour() {
    const jx = +$('ctX').value, jy = +$('ctY').value; const f = state.prep.factors;
    if (jx === jy) { $('plContour').innerHTML = '<p class="hint">Seleccione dos factores distintos.</p>'; return; }
    const hold = new Array(state.prep.k).fill(0); $('ctHold').querySelectorAll('input').forEach(i => { hold[+i.dataset.j] = +i.value; });
    const rx = j => (f[j].numeric ? v => f[j].center + f[j].half * v : null);
    $('plContour').innerHTML = P.contour({ title: `Contorno de ${state.prep.respName}`, xlabel: `${f[jx].letter}: ${f[jx].name}`, ylabel: `${f[jy].letter}: ${f[jy].name}`, xr: rx(jx), yr: rx(jy),
      fz: (x, y) => { const p = hold.slice(); p[jx] = x; p[jy] = y; if (p.every(v => Math.abs(v) < 1e-9)) p[jx] = 1e-12; return backT(A.predictFast(state.fit, p)); } });
  }

  /* ============================================================ SUPUESTOS */
  function renderDiag() {
    const prep = state.prep, fit = state.fit; const dg = A.diagnostics(prep, fit); state.diag = dg;
    if (dg.noDf) {
      msg('dgMsg', 'warn', 'El modelo no tiene grados de libertad para el error; los residuales son cero. Reduzca el modelo (pestaña Análisis) para verificar los supuestos.');
      ['dgTests', 'dgPlots', 'dgBoxcox', 'dgPoints'].forEach(id => { $(id).innerHTML = ''; }); return;
    }
    msg('dgMsg');
    const a = state.opts.alpha;
    let h = `<h2>Pruebas de supuestos sobre los residuales</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Supuesto</th><th class="l">Prueba</th><th class="l">Estadístico</th><th>Valor p</th><th class="l">Decisión (α = ${a})</th></tr></thead><tbody>`;
    dg.tests.forEach(t => {
      const dec = isFinite(t.p) ? (t.p < a ? '<span class="pill bad">Se rechaza H₀</span>' : '<span class="pill ok">No se rechaza H₀</span>') : (t.name.startsWith('Durbin') ? (dg.dw.d < 1.5 || dg.dw.d > 2.5 ? '<span class="pill bad">Revisar</span>' : '<span class="pill ok">Sin indicios</span>') : '<span class="pill na">—</span>');
      h += `<tr><td>${t.group}</td><td class="l" title="H₀: ${esc(t.h0)}">${esc(t.name)}</td><td class="l mono">${esc(t.stat)}</td><td>${fmtP(t.p)}</td><td class="l">${dec}</td></tr>`;
    });
    h += '</tbody></table></div><p class="hint">Normalidad y homocedasticidad se evalúan con residuales estandarizados/crudos; la independencia, en el orden de corrida (si no se indicó columna de orden, se usa el orden de las filas). Con pocos grados de libertad estas pruebas tienen baja potencia: interprételas junto con las gráficas.</p>';
    $('dgTests').innerHTML = h;
    // gráficas de residuales
    const r = fit.stdres; const idx = r.map((v, i) => i).filter(i => isFinite(r[i]));
    const srt = idx.slice().sort((x, y) => r[x] - r[y]); const n = srt.length; const zq = srt.map((_, i) => S.norminv((i + 0.375) / (n + 0.25)));
    const ord = prep.runOrder.map((o, i) => [o, i]).sort((x, y) => x[0] - y[0]).map(t => t[1]).filter(i => isFinite(r[i]));
    const zr = Math.max(3, ...idx.map(i => Math.abs(r[i]))) * 1.05;
    $('dgPlots').innerHTML = [
      P.chart({ id: 'rq', title: 'Probabilidad normal de residuales', xlabel: 'Residual estandarizado', ylabel: 'Cuantil normal teórico', series: [{ x: srt.map(i => r[i]), y: zq, tips: srt.map(i => `corrida ${prep.runOrder[i]}`) }], lines: [{ x1: -3.5, y1: -3.5, x2: 3.5, y2: 3.5, color: 'var(--muted)', dash: '5 4', noScale: true }] }),
      P.chart({ id: 'rf', title: 'Residuales vs. ajustados', xlabel: 'Valor ajustado', ylabel: 'Residual estandarizado', ydom: [-zr, zr], series: [{ x: idx.map(i => fit.fitted[i]), y: idx.map(i => r[i]), tips: idx.map(i => `corrida ${prep.runOrder[i]}`) }], lines: [{ x1: -1e12, y1: 0, x2: 1e12, y2: 0, color: 'var(--muted)', noScale: true }, { x1: -1e12, y1: 2, x2: 1e12, y2: 2, color: 'var(--danger)', dash: '4 4', noScale: true }, { x1: -1e12, y1: -2, x2: 1e12, y2: -2, color: 'var(--danger)', dash: '4 4', noScale: true }] }),
      P.histogram({ data: idx.map(i => r[i]), title: 'Histograma de residuales', xlabel: 'Residual estandarizado' }),
      P.chart({ id: 'ro', title: 'Residuales vs. orden de corrida', xlabel: 'Orden de corrida', ylabel: 'Residual estandarizado', ydom: [-zr, zr], series: [{ type: 'line', x: ord.map(i => prep.runOrder[i]), y: ord.map(i => r[i]), marker: true, w: 1.2 }], lines: [{ x1: -1e12, y1: 0, x2: 1e12, y2: 0, color: 'var(--muted)', noScale: true }] })
    ].map(s => `<div class="card">${s}</div>`).join('');
    // Box-Cox
    const bc = A.boxcox(prep.yRaw, fit);
    if (bc && prep.trans.key === 'none') {
      const yMax = Math.min(Math.max(...bc.sses), bc.smin * 6);
      h = `<h2>Transformación de Box-Cox</h2>` + P.chart({ id: 'bc', W: 900, H: 320, xdom: [-3, 3], title: 'SC del error vs. λ', xlabel: 'λ', ylabel: 'SC error (normalizada)', ydom: [bc.smin * 0.9, yMax], series: [{ type: 'line', x: bc.lams, y: bc.sses.map(v => Math.min(v, yMax * 1.2)) }], lines: [{ x1: -3, y1: bc.thr, x2: 3, y2: bc.thr, color: 'var(--danger)', dash: '5 4', label: 'límite IC 95 %', noScale: true }, { x1: bc.lhat, y1: bc.smin * 0.9, x2: bc.lhat, y2: yMax, color: 'var(--accent)', dash: '2 3', noScale: true }] }) +
        `<p>λ̂ = <b>${bc.lhat.toFixed(3)}</b>; IC 95 % ≈ [${fmt(bc.ciLo, 2)}, ${fmt(bc.ciHi, 2)}]. ${bc.recommendation}</p>` +
        (!bc.includesOne && bc.rec ? `<div class="actions"><button class="ghost" id="btnApplyBC">Aplicar ${esc(bc.rec[1])} y reanalizar</button></div>` : '');
      $('dgBoxcox').innerHTML = h;
      const btn = $('btnApplyBC'); if (btn) btn.addEventListener('click', () => {
        const l = bc.rec[0]; const map = { 0: 'ln', 0.5: 'sqrt', '-1': 'inv' }; const key = map[l] || 'pow';
        $('mTrans').value = key; $('mLambda').value = l; $('mLambda').hidden = key !== 'pow'; const terms = state.terms.slice(); analyzeFromMapping(); state.terms = terms.filter(w => state.est.estimable.includes(w)); runModel();
      });
    } else $('dgBoxcox').innerHTML = bc ? `<h2>Transformación de Box-Cox</h2><p class="hint">La respuesta ya está transformada (${esc(prep.trans.label)}). Para evaluar otra λ, regrese a “Ninguna” en la pestaña Datos.</p>` : `<h2>Transformación de Box-Cox</h2><p class="hint">No disponible: requiere respuestas estrictamente positivas y grados de libertad para el error.</p>`;
    // puntos
    const flagged = dg.points.filter(p => p.flagOut || p.flagStd || p.flagCook);
    h = `<h2>Residuales, apalancamiento e influencia</h2><p class="hint">Atípico (Bonferroni): |t| &gt; ${fmt(dg.bonf, 3)}. Se marcan también |r| &gt; 2, distancia de Cook &gt; 4/n = ${fmt(4 / prep.n, 3)} y apalancamiento &gt; 2p/n.</p>
      <div class="table-wrap short"><table class="tbl"><thead><tr><th>Corrida</th><th>y</th><th>ŷ</th><th>Residual</th><th>r estand.</th><th>t student.</th><th>h</th><th>Cook</th><th class="l">Observación</th></tr></thead><tbody>` +
      dg.points.slice().sort((x, y) => x.run - y.run).map(p => {
        const fl = [p.flagOut ? 'atípico' : '', p.flagStd && !p.flagOut ? '|r|>2' : '', p.flagCook ? 'influyente' : '', p.flagLev ? 'apalancamiento alto' : ''].filter(Boolean).join(', ');
        return `<tr><td>${p.run}</td><td>${fmt(p.y)}</td><td>${fmt(p.fit)}</td><td>${fmt(p.e)}</td><td class="${Math.abs(p.r) > 2 ? 'sig' : ''}">${fmt(p.r, 3)}</td><td class="${p.flagOut ? 'sig' : ''}">${fmt(p.t, 3)}</td><td>${fmt(p.h, 3)}</td><td class="${p.flagCook ? 'sig' : ''}">${fmt(p.cook, 3)}</td><td class="l">${fl}</td></tr>`;
      }).join('') + '</tbody></table></div>' + (flagged.length ? `<p>${flagged.length} observación(es) señalada(s); revise posibles errores de captura o condiciones especiales de corrida.</p>` : '<p>No se detectan observaciones atípicas ni influyentes.</p>');
    $('dgPoints').innerHTML = h;
  }

  /* ============================================================ PREDICCIÓN */
  function renderOpt() {
    const f = state.prep.factors;
    const prev = {}; $('opInputs').querySelectorAll('input').forEach(i => { prev[i.dataset.j] = i.value; });
    $('opInputs').innerHTML = f.map((ff, j) => `<label>${ff.letter}: ${esc(ff.name)} (codificado)<input type="number" step="0.1" min="-1" max="1" value="${prev[j] != null ? prev[j] : 0}" data-j="${j}"><span class="hint" id="opR${j}"></span></label>`).join('');
    const upd = i => { const j = +i.dataset.j; const v = +i.value; $('opR' + j).textContent = f[j].numeric ? `= ${+(f[j].center + f[j].half * v).toPrecision(6)} ${f[j].unit || ''}` : (v <= -1 ? `= ${f[j].low}` : v >= 1 ? `= ${f[j].high}` : 'nivel intermedio no definido'); };
    $('opInputs').querySelectorAll('input').forEach(i => { upd(i); i.addEventListener('input', () => upd(i)); });
    $('opPred').innerHTML = ''; $('opRes').innerHTML = '';
  }
  $('opGoal').addEventListener('change', () => { $('opTargetWrap').hidden = $('opGoal').value !== 'target'; });
  $('btnPredict').addEventListener('click', () => {
    const fit = state.fit; if (!fit) return;
    const x = [...$('opInputs').querySelectorAll('input')].map(i => +i.value || 0);
    const pr = A.predict(fit, x); const t = state.prep.trans; const back = t.key !== 'none';
    const bt = v => A.transforms[t.key].inv(v, t.lam); const iv = ([lo, hi]) => { const a1 = bt(lo), b1 = bt(hi); return [Math.min(a1, b1), Math.max(a1, b1)]; };
    const ext = x.some(v => Math.abs(v) > 1) ? '<div class="msg warn">Hay factores fuera de la región experimental (|x| &gt; 1): la predicción es una extrapolación.</div>' : '';
    const hasDf = fit.summary.dfE > 0;
    let h = ext + `<div class="kv"><div><span>ŷ${back ? ` (${esc(t.label)})` : ''}</span><b>${fmt(pr.yhat)}</b></div>`;
    if (hasDf) h += `<div><span>EE del ajuste</span><b>${fmt(pr.se)}</b></div><div><span>IC ${Math.round((1 - state.opts.alpha) * 100)} % (media)</span><b>${fmt(pr.ci[0])} ; ${fmt(pr.ci[1])}</b></div><div><span>IP ${Math.round((1 - state.opts.alpha) * 100)} % (nueva obs.)</span><b>${fmt(pr.pi[0])} ; ${fmt(pr.pi[1])}</b></div>`;
    h += '</div>';
    if (back) { h += `<p><b>Escala original:</b> ŷ = ${fmt(bt(pr.yhat))}` + (hasDf ? `; IC ${fmt(iv(pr.ci)[0])} ; ${fmt(iv(pr.ci)[1])}; IP ${fmt(iv(pr.pi)[0])} ; ${fmt(iv(pr.pi)[1])}` : '') + '</p>'; }
    if (!hasDf) h += '<p class="hint">Sin grados de libertad para el error no se calculan intervalos.</p>';
    $('opPred').innerHTML = h;
  });
  $('btnOptimize').addEventListener('click', () => {
    const fit = state.fit; if (!fit) return; const k = state.prep.k;
    let lv = { corners: [-1, 1], grid3: [-1, 0, 1], grid5: [-1, -0.5, 0, 0.5, 1] }[$('opRegion').value];
    if (Math.pow(lv.length, k) > 400000) { lv = [-1, 0, 1]; }
    const goal = $('opGoal').value; let target = +$('opTarget').value;
    const t = state.prep.trans; const back = t.key !== 'none';
    if (goal === 'target' && back) target = A.transforms[t.key].f(target, t.lam);
    const dir = back && (t.key === 'inv' || (t.key === 'pow' && t.lam < 0)) && goal !== 'target' ? (goal === 'max' ? 'min' : 'max') : goal;
    const res = A.optimize(fit, k, dir, target, lv); const f = state.prep.factors;
    const bt = v => (back ? A.transforms[t.key].inv(v, t.lam) : v);
    $('opRes').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th>${f.map(ff => `<th>${ff.letter}: ${esc(ff.name)}</th>`).join('')}<th>ŷ</th></tr></thead><tbody>` +
      res.map((r, i) => `<tr><td>${i + 1}</td>${r.x.map((v, j) => `<td>${f[j].numeric ? +(f[j].center + f[j].half * v).toPrecision(6) : (v < 0 ? esc(f[j].low) : v > 0 ? esc(f[j].high) : '—')} <span class="alias">(${v})</span></td>`).join('')}<td><b>${fmt(bt(r.y))}</b></td></tr>`).join('') +
      `</tbody></table></div><p class="hint">Búsqueda exhaustiva sobre ${Math.pow(lv.length, k).toLocaleString('es-MX')} combinaciones con el modelo ajustado. ${state.prep.nCenter && fit.coefs.some(c => c.kind === 'curv' && c.p < state.opts.alpha) ? 'Atención: la curvatura es significativa, el modelo lineal puede no ser confiable en puntos interiores.' : ''}</p>`;
  });

  /* ============================================================ EXPORTAR / IMPRIMIR */
  const toCSV = ds => [ds.headers, ...ds.rows].map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');
  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('btnExport').addEventListener('click', () => {
    if (!state.fit) { alert('Primero realice un análisis.'); return; }
    const fit = state.fit, sm = fit.summary; const L = [];
    L.push(['RESPUESTA', state.prep.respName, state.prep.trans.label]);
    L.push([]); L.push(['EFECTOS Y COEFICIENTES']); L.push(['Termino', 'Alias', 'Efecto', 'Coeficiente', 'EE', 't', 'p', 'IC_inf', 'IC_sup', 'FIV']);
    fit.coefs.forEach(c => L.push([c.name, c.kind === 'term' ? A.aliasText(state.est, c.w, 9).trim() : '', c.kind === 'term' ? c.effect : '', c.coef, c.se, c.t, fmtPtxt(c.p), c.lo, c.hi, c.vif]));
    L.push([]); L.push(['ANOVA']); L.push(['Fuente', 'gl', 'SC', 'CM', 'F', 'p']);
    fit.anova.forEach(r => L.push([r.source, r.df, r.ss, r.ms, r.F, fmtPtxt(r.p)]));
    L.push([]); L.push(['S', sm.s]); L.push(['R2', sm.r2]); L.push(['R2_ajustado', sm.r2adj]); L.push(['R2_prediccion', sm.r2pred]); L.push(['PRESS', sm.press]);
    if (state.lenth) { L.push([]); L.push(['LENTH', 'PSE', state.lenth.pse, 'ME', state.lenth.me, 'SME', state.lenth.sme]); }
    if (state.diag && state.diag.tests) { L.push([]); L.push(['PRUEBAS DE SUPUESTOS']); L.push(['Supuesto', 'Prueba', 'Estadistico', 'p']); state.diag.tests.forEach(t => L.push([t.group, t.name, t.stat, fmtPtxt(t.p)])); }
    if (state.diag && state.diag.points) { L.push([]); L.push(['RESIDUALES']); L.push(['Corrida', 'y', 'ajustado', 'residual', 'r_estandarizado', 't_studentizado', 'h', 'Cook']); state.diag.points.forEach(p => L.push([p.run, p.y, p.fit, p.e, p.r, p.t, p.h, p.cook])); }
    download('resultados_doe2k.csv', L.map(r => r.map(v => { v = typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(10)) : '') : String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n'));
  });
  $('btnPrint').addEventListener('click', () => {
    const parts = [];
    const take = (title, ids) => { const html = ids.map(id => ($(id) && !$(id).hidden ? $(id).innerHTML : '')).join(''); if (html.trim()) parts.push(`<section><h1>${title}</h1>${html}</section>`); };
    take('Diseño', ['designOut']);
    if (state.fit) { take('Análisis', ['anMsg', 'anInfo', 'anCoef', 'anAnova', 'anLenth', 'anEq']); take('Gráficas', ['plPareto', 'plNormal', 'plHalf', 'plMain', 'plInter', 'plCube', 'plContour']); take('Supuestos', ['dgTests', 'dgPlots', 'dgBoxcox', 'dgPoints']); }
    if (!parts.length) { alert('No hay contenido para imprimir.'); return; }
    $('printArea').innerHTML = `<h1 style="font-size:16pt">Reporte DOE 2ᵏ — ${new Date().toLocaleString('es-MX')}</h1>` + parts.join('');
    $('printArea').querySelectorAll('input').forEach(i => { const s = document.createElement('span'); s.textContent = i.value; i.replaceWith(s); });
    window.print();
  });

  /* ============================================================ PERSISTENCIA */
  let saveTimer = null;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };
  function save() {
    try {
      readFactorTable();
      const form = {}; ['dK', 'dType', 'dP', 'dReps', 'dGens', 'dBlockMode', 'dNB', 'dBGens', 'dCP', 'dSeed'].forEach(id => { form[id] = $(id).value; }); form.dRand = $('dRand').checked;
      const data = { form, factors: state.factors, ys: state.design ? state.design.runs.map(r => r.y) : null, hasDesign: !!state.design, dataset: state.dataset, mapping: state.mapping, terms: state.terms, opts: state.opts, analyzed: !!state.fit };
      localStorage.setItem(STORE, JSON.stringify(data));
    } catch (e) { /* almacenamiento no disponible */ }
  }
  function restore() {
    let data = null; try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { data = null; }
    buildFactorTable(); updateDesignControls();
    if (!data) return;
    try {
      state.factors = data.factors || [];
      $('dK').value = data.form.dK; buildFactorTable();
      $('dType').value = data.form.dType; updateDesignControls();
      if (data.form.dP) $('dP').value = data.form.dP;
      ['dReps', 'dGens', 'dBlockMode', 'dCP', 'dSeed'].forEach(id => { if (data.form[id] != null) $(id).value = data.form[id]; });
      $('dGens').dataset.k = `${data.form.dK}-${data.form.dP}`;
      $('dRand').checked = data.form.dRand !== false; updateDesignControls();
      if (data.form.dNB) $('dNB').value = data.form.dNB; $('dBGens').value = data.form.dBGens || '';
      if (data.hasDesign) { generateDesign(true); if (data.ys) state.design.runs.forEach((r, i) => { r.y = data.ys[i] || ''; }); renderSheet(); }
      if (data.opts) { Object.assign(state.opts, data.opts); $('oAlpha').value = state.opts.alpha; $('oAliasOrd').value = state.opts.aliasOrd; $('oCurv').checked = state.opts.curv; }
      if (data.dataset) {
        loadDataset(data.dataset, 'Sesión anterior restaurada.');
        const m = data.mapping;
        if (m) {
          $('mResp').value = m.jy; $('mBlock').value = m.jb; $('mRun').value = m.jr; $('mTrans').value = m.tr; $('mLambda').value = m.lam; $('mLambda').hidden = m.tr !== 'pow';
          $('mFactors').querySelectorAll('input').forEach(c => { c.checked = m.fj.includes(+c.value); }); updateChips();
          if (data.analyzed) {
            const terms = data.terms || []; const blocks = data.opts ? data.opts.blocks : true;
            analyzeFromMapping(); state.opts.blocks = $('oBlocks').checked = blocks !== false; refreshEstimability(true);
            const ok = terms.filter(w => state.est.estimable.includes(w)); if (ok.length) { state.terms = ok; runModel(); }
            showTab('design');
          }
        }
      }
    } catch (e) { console.warn('No se pudo restaurar la sesión', e); }
  }

  /* ============================================================ AYUDA */
  $('helpContent').innerHTML = `
  <h2>Flujo de trabajo</h2>
  <ol>
    <li><b>Diseño.</b> Elija k, el tipo (completo o fraccionado), réplicas, bloques y puntos centrales. Genere la hoja de trabajo aleatorizada, capture las respuestas o descárguela en CSV.</li>
    <li><b>Datos.</b> Cargue un CSV, pegue celdas o use la hoja del diseño. Asigne respuesta, factores, bloque y orden de corrida. Los niveles se codifican a −1/0/+1.</li>
    <li><b>Análisis.</b> La app detecta qué efectos son estimables, cuáles están en alias y cuáles se confunden con bloques. Seleccione los términos del modelo.</li>
    <li><b>Gráficas y supuestos.</b> Identifique efectos activos y valide normalidad, varianza constante e independencia antes de concluir.</li>
    <li><b>Predicción.</b> Estime la respuesta en una combinación de factores o busque la mejor combinación.</li>
  </ol>
  <h2>Qué prueba usar y cuándo</h2>
  <ul>
    <li><b>Con réplicas o puntos centrales</b> (gl de error &gt; 0): pruebas F del ANOVA y t de los coeficientes. Si hay combinaciones repetidas, el error se divide en <i>falta de ajuste</i> y <i>error puro</i>.</li>
    <li><b>Sin réplicas</b> (modelo saturado): gráfica normal o semi-normal de efectos y método de Lenth (PSE, ME, SME). Después, reduzca el modelo para obtener un error.</li>
    <li><b>Puntos centrales:</b> la prueba de <i>curvatura</i> compara la media de los centros con la de los puntos factoriales. Si es significativa, el modelo de primer orden no basta y conviene un diseño central compuesto.</li>
    <li><b>Bloques:</b> se incluyen como efecto aditivo (codificación de suma cero). Las interacciones confundidas con bloques no se pueden estimar; aparecen como “confundidos con bloques”.</li>
    <li><b>Fraccionados:</b> cada estimación corresponde a una cadena de alias (p. ej. A + BCD). La resolución indica qué tan graves son las confusiones: III (principales con 2FI), IV (2FI entre sí), V (libres hasta 2FI).</li>
  </ul>
  <h2>Supuestos del modelo</h2>
  <ul>
    <li><b>Normalidad:</b> Shapiro-Wilk y Anderson-Darling, más la gráfica de probabilidad normal de residuales.</li>
    <li><b>Varianza constante:</b> Levene modificada (Brown-Forsythe) entre niveles de cada factor y Breusch-Pagan contra valores ajustados.</li>
    <li><b>Independencia:</b> prueba de rachas y estadístico de Durbin-Watson en el orden de corrida.</li>
    <li><b>Atípicos e influencia:</b> residuales estudentizados (criterio de Bonferroni), apalancamiento y distancia de Cook.</li>
    <li><b>Box-Cox:</b> sugiere una transformación de potencia cuando λ = 1 queda fuera del intervalo de confianza.</li>
  </ul>
  <h2>Formato de datos</h2>
  <p>Una fila por corrida. Columnas sugeridas: <code>OrdenCorrida</code>, <code>Bloque</code>, una columna por factor (valores reales o codificados) y la respuesta. Ejemplo:</p>
  <pre class="mono">OrdenCorrida,Bloque,Temperatura,Tiempo,Rendimiento
1,1,150,30,39.3
2,1,160,40,41.5
3,1,155,35,40.3</pre>
  <h2>Referencias</h2>
  <ul>
    <li>Montgomery, D. C. <i>Design and Analysis of Experiments</i>, caps. 6–8.</li>
    <li>Box, G. E. P., Hunter, J. S. y Hunter, W. G. <i>Statistics for Experimenters</i>.</li>
    <li>Lenth, R. V. (1989). Quick and easy analysis of unreplicated factorials. <i>Technometrics</i>, 31(4), 469–473.</li>
    <li>Royston, P. (1995). Algorithm AS R94: Shapiro-Wilk W test. <i>Applied Statistics</i>, 44(4), 547–551.</li>
  </ul>`;

  /* ============================================================ PWA */
  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('btnInstall').hidden = false; });
  $('btnInstall').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('btnInstall').hidden = true; });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });

  restore();
})();
