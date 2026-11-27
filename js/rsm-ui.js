/* rsm-ui.js — Pestaña 8 · Superficie de respuesta (pendiente ascendente/descendente, CCD, Box-Behnken y análisis de 2.º orden) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const S = Stats, R = RSM, P = Plots;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => { if (s == null) return NaN; const t = String(s).trim().replace(/\s/g, '').replace(/^[−–]/, '-'); if (t === '') return NaN; const v = Number(t.replace(/,(?=\d+$)/, '.')); return isFinite(v) ? v : NaN; };
  const fmt = (v, d) => { d = d == null ? 4 : d; if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); if (a !== 0 && (a >= 1e6 || a < Math.pow(10, -d))) return v.toExponential(3); return v.toFixed(d); };
  const fN = v => (v == null || !isFinite(v) ? '—' : String(+(+v).toPrecision(6)));
  const fmtP = p => (!isFinite(p) ? '—' : p < 0.0001 ? '&lt;0.0001' : p.toFixed(4));
  const msg = (el, type, html) => { $(el).innerHTML = html ? `<div class="msg ${type}">${html}</div>` : ''; };
  const sigC = (p, a) => (isFinite(p) && p <= a ? ' class="sig"' : '');
  const L = R.L;
  const STORE = 'doe2k-rsm';

  let app = null;            // estado de la aplicación 2^k
  let cfg = {
    pane: 'A',
    A: { src: 'model', dir: 1, base: null, step: 1, round: '', n: 12, shown: false, manual: null, yobs: { key: '', vals: [] } },
    B: { type: 'ccd', k: 3, variant: 'ccc', alphaKind: 'rot', alphaCustom: '', half: 0, blocks: 1, nc: '', ncf: '', nca: '', rand: true, seed: 2026, factors: [], resp: 'Respuesta', ys: [], sig: '' },
    C: { src: 'design', ds: null, map: null, terms: null, alpha: 0.05, blocks: true }
  };
  try { const sv = JSON.parse(localStorage.getItem(STORE) || '{}'); ['A', 'B', 'C'].forEach(p => { if (sv[p]) cfg[p] = Object.assign(cfg[p], sv[p]); }); if (sv.pane) cfg.pane = sv.pane; } catch (e) { /* sin almacenamiento */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* sin almacenamiento */ } };

  function download(name, text) {
    const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvLine = r => r.map(v => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');

  /* ================================================================ estructura */
  function build() {
    $('rsmRoot').innerHTML = `
    <div class="seg" role="tablist" aria-label="Secciones de superficie de respuesta">
      <button data-pane="A" role="tab">A · Pendiente ascendente / descendente</button>
      <button data-pane="B" role="tab">B · Diseño de 2.º orden</button>
      <button data-pane="C" role="tab">C · Análisis de 2.º orden</button>
    </div>
    <details class="msg info rsm-flow"><summary><b>Secuencia de la metodología de superficie de respuesta</b></summary>
      <ol>
        <li><b>Primer orden lejos del óptimo.</b> Analice un 2ᵏ con puntos centrales (pestañas 1 a 3). Si la curvatura y las interacciones no son significativas, el plano describe bien la región.</li>
        <li><b>A · Pendiente.</b> Muévase en la dirección del gradiente (ascendente para maximizar, descendente para minimizar) y realice corridas a lo largo de la trayectoria hasta que la respuesta deje de mejorar.</li>
        <li><b>Nuevo 2ᵏ</b> alrededor del mejor punto. Si hay curvatura o falta de ajuste, ya está cerca del óptimo.</li>
        <li><b>B · Diseño de 2.º orden.</b> Aumente el 2ᵏ con puntos axiales (CCD) o use un Box-Behnken.</li>
        <li><b>C · Análisis.</b> Ajuste el modelo cuadrático, localice el punto estacionario, clasifíquelo con el análisis canónico y confirme con corridas en las condiciones elegidas.</li>
      </ol></details>
    <div id="rsmA" class="rsm-pane"></div>
    <div id="rsmB" class="rsm-pane" hidden></div>
    <div id="rsmC" class="rsm-pane" hidden></div>`;
    $('rsmRoot').querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => showPane(b.dataset.pane)));
    buildA(); buildB(); buildC();
    showPane(cfg.pane);
  }
  function showPane(p) {
    cfg.pane = p; persist();
    $('rsmRoot').querySelectorAll('.seg button').forEach(b => { b.classList.toggle('active', b.dataset.pane === p); b.setAttribute('aria-selected', b.dataset.pane === p); });
    ['A', 'B', 'C'].forEach(x => { $('rsm' + x).hidden = x !== p; });
  }

  /* ================================================================ A · PENDIENTE */
  const EX111 = { k: 2, b0: 40.44, resp: 'Rendimiento', rows: [{ name: 'Tiempo', center: 35, half: 5, unit: 'min', b: 0.775 }, { name: 'Temperatura', center: 155, half: 5, unit: '°F', b: 0.325 }],
    yobs: [null, 41.0, 42.9, 47.1, 49.7, 53.8, 59.9, 65.0, 70.4, 77.6, 80.3, 76.2, 75.1] };
  function defaultManual() { return { k: 2, b0: '', resp: 'Respuesta', rows: [0, 1].map(i => ({ name: L[i], center: 0, half: 1, unit: '', b: '' })) }; }

  function buildA() {
    if (!cfg.A.manual) cfg.A.manual = defaultManual();
    $('rsmA').innerHTML = `
    <div class="card">
      <h2>Modelo de primer orden</h2>
      <div class="grid4">
        <label>Origen de los coeficientes
          <select id="saSrc"><option value="model">Modelo de la pestaña 3 · Análisis</option><option value="manual">Captura manual</option></select></label>
        <label>Dirección
          <select id="saDir"><option value="1">Ascendente (maximizar la respuesta)</option><option value="-1">Descendente (minimizar la respuesta)</option></select></label>
      </div>
      <div id="saModelMsg"></div>
      <div id="saManual" hidden>
        <div class="grid4">
          <label>Número de factores <select id="saK">${[2, 3, 4, 5, 6, 7, 8].map(k => `<option>${k}</option>`).join('')}</select></label>
          <label>Respuesta <input id="saResp" spellcheck="false"></label>
          <label>b₀ (constante) <input id="saB0" type="number" step="any"></label>
        </div>
        <div class="table-wrap"><table class="tbl" id="saManTbl"></table></div>
        <p class="hint">Coeficientes en <b>unidades codificadas</b> (efecto/2), como los muestra la pestaña Análisis. Centro y semirrango definen la codificación x = (ξ − centro)/semirrango.</p>
        <div class="actions"><button id="saEx" class="ghost">Cargar ejemplo (Montgomery 11.1)</button></div>
      </div>
      <div id="saCoef"></div>
    </div>
    <div class="card">
      <h2>Trayectoria</h2>
      <div class="grid4">
        <label>Factor base <select id="saBase"></select></label>
        <label>Incremento del factor base (codificado) <input id="saStep" type="number" min="0" step="any"></label>
        <label>Redondeo de los incrementos reales
          <select id="saRound"><option value="">Sin redondeo</option><option value="0">A enteros</option><option value="1">1 decimal</option><option value="2">2 decimales</option></select></label>
        <label>Número de pasos <input id="saN" type="number" min="1" max="40"></label>
      </div>
      <p class="hint">Se elige como base el factor con mayor |b|. Su incremento Δx<sub>base</sub> (en unidades codificadas; 1 = un semirrango) fija el tamaño del paso; los demás se mueven en proporción a su coeficiente: Δx<sub>j</sub> = b<sub>j</sub> · Δx<sub>base</sub> / |b<sub>base</sub>|, con signo invertido en la descendente. Δξ<sub>j</sub> = Δx<sub>j</sub> · semirrango<sub>j</sub>. Redondear facilita fijar las condiciones en el laboratorio; la dirección cambia ligeramente.</p>
      <div class="actions"><button id="saCalc" class="primary">Calcular trayectoria</button></div>
      <div id="saOut"></div>
    </div>
    <div class="card" id="saObs" hidden></div>`;
    $('saSrc').value = cfg.A.src; $('saDir').value = String(cfg.A.dir); $('saStep').value = cfg.A.step; $('saRound').value = cfg.A.round; $('saN').value = cfg.A.n;
    $('saSrc').onchange = () => { cfg.A.src = $('saSrc').value; cfg.A.base = null; persist(); refreshA(); };
    $('saDir').onchange = () => { cfg.A.dir = +$('saDir').value; persist(); if (cfg.A.shown) calcA(); };
    ['saStep', 'saRound', 'saN'].forEach(id => $(id).addEventListener('change', () => { readA(); if (cfg.A.shown) calcA(); }));
    $('saBase').onchange = () => { cfg.A.base = +$('saBase').value; persist(); if (cfg.A.shown) calcA(); };
    $('saK').onchange = () => { const m = readManual(); const k = +$('saK').value; while (m.rows.length < k) m.rows.push({ name: L[m.rows.length], center: 0, half: 1, unit: '', b: '' }); m.rows.length = k; m.k = k; persist(); renderManual(); refreshA(); };
    $('saEx').onclick = () => { cfg.A.src = 'manual'; cfg.A.manual = JSON.parse(JSON.stringify(EX111)); delete cfg.A.manual.yobs; cfg.A.base = 0; cfg.A.step = 1; cfg.A.round = '0'; cfg.A.n = 12; cfg.A.dir = 1;
      cfg.A.yobs = { key: '', vals: EX111.yobs.slice() };
      $('saSrc').value = 'manual'; $('saStep').value = 1; $('saRound').value = '0'; $('saN').value = 12; $('saDir').value = '1'; persist(); renderManual(); refreshA(); calcA(); };
    $('saCalc').onclick = () => calcA();
    renderManual(); refreshA();
  }
  function renderManual() {
    const m = cfg.A.manual; $('saK').value = m.k; $('saResp').value = m.resp || ''; $('saB0').value = m.b0;
    $('saManTbl').innerHTML = `<thead><tr><th>Factor</th><th class="l">Nombre</th><th>Centro (x = 0)</th><th>Semirrango (Δ por unidad codificada)</th><th class="l">Unidad</th><th>Coeficiente b</th></tr></thead><tbody>${m.rows.map((r, i) => `<tr><td><b>${L[i]}</b></td><td class="l"><input data-i="${i}" data-f="name" value="${esc(r.name)}" style="width:130px;text-align:left"></td><td><input data-i="${i}" data-f="center" type="number" step="any" value="${esc(r.center)}"></td><td><input data-i="${i}" data-f="half" type="number" step="any" min="0" value="${esc(r.half)}"></td><td class="l"><input data-i="${i}" data-f="unit" value="${esc(r.unit)}" style="width:70px;text-align:left"></td><td><input data-i="${i}" data-f="b" type="number" step="any" value="${esc(r.b)}"></td></tr>`).join('')}</tbody>`;
    $('saManual').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => { readManual(); persist(); refreshA(); if (cfg.A.shown) calcA(); }));
  }
  function readManual() {
    const m = cfg.A.manual; m.resp = $('saResp').value; m.b0 = $('saB0').value;
    $('saManTbl').querySelectorAll('input').forEach(inp => { const r = m.rows[+inp.dataset.i]; if (r) r[inp.dataset.f] = inp.value; });
    return m;
  }
  function readA() { cfg.A.step = +$('saStep').value; cfg.A.round = $('saRound').value; cfg.A.n = Math.max(1, Math.min(40, Math.round(+$('saN').value || 12))); persist(); }

  /** Modelo de primer orden activo: {b0, factors:[{name,unit,center,half,b,letter}], resp, warn:[]} */
  function firstOrder() {
    if (cfg.A.src === 'manual') {
      const m = cfg.A.manual; const fs = m.rows.map((r, i) => ({ letter: L[i], name: r.name || L[i], unit: r.unit || '', center: num(r.center), half: num(r.half), b: num(r.b) }));
      const bad = fs.find(f => !isFinite(f.center) || !(f.half > 0) || !isFinite(f.b));
      if (bad) return { err: `Complete centro, semirrango (&gt; 0) y coeficiente del factor ${bad.letter}.` };
      return { b0: isFinite(num(m.b0)) ? num(m.b0) : 0, b0Known: isFinite(num(m.b0)), factors: fs, resp: m.resp || 'Respuesta', warn: [], trans: null };
    }
    if (!app || !app.fit || !app.prep) return { err: 'Aún no hay un modelo en la pestaña <b>3 · Análisis</b>. Analice un 2ᵏ (de preferencia con puntos centrales) o cambie a <b>Captura manual</b>.' };
    const fit = app.fit, prep = app.prep, a = app.opts.alpha; const warn = [];
    const b0 = (fit.coefs.find(c => c.kind === 'int') || {}).coef || 0;
    const factors = prep.factors.map((f, j) => { const c = fit.coefs.find(c => c.kind === 'term' && c.w === (1 << j)); return { letter: f.letter, name: f.name, unit: f.unit || '', center: f.center, half: f.half, b: c ? c.coef : 0, inModel: !!c, numeric: f.numeric, p: c ? c.p : NaN, low: f.low, high: f.high }; });
    const txt = factors.filter(f => !f.numeric);
    if (txt.length) warn.push(`Factor(es) de texto ${txt.map(f => f.letter).join(', ')}: no tienen escala continua; se dejan fijos (b = 0 en la trayectoria). Use el nivel que favorece la respuesta.`);
    txt.forEach(f => { f.b = 0; });
    const out = factors.filter(f => f.numeric && !f.inModel); if (out.length) warn.push(`Efecto(s) ${out.map(f => f.letter).join(', ')} no incluidos en el modelo: esos factores permanecen en el centro.`);
    const curv = fit.coefs.find(c => c.kind === 'curv');
    if (curv && isFinite(curv.p) && curv.p <= a) warn.push(`<b>La curvatura es significativa</b> (p = ${fmtP(curv.p)}). La región actual probablemente ya contiene el óptimo; en lugar de la pendiente, pase a un diseño de segundo orden (<b>B</b>).`);
    const ints = fit.coefs.filter(c => c.kind === 'term' && c.order >= 2 && isFinite(c.p) && c.p <= a);
    if (ints.length) warn.push(`Interacción(es) significativa(s): ${ints.map(c => c.name).join(', ')}. El método supone que el modelo de primer orden es adecuado; con interacciones fuertes la dirección del gradiente cambia de un punto a otro: use pasos cortos y verifique con corridas.`);
    if (prep.trans && prep.trans.key !== 'none') warn.push(`Respuesta transformada (${esc(prep.trans.label)}): ŷ se expresa en la escala transformada.`);
    if (!prep.nCenter) warn.push('El modelo no tiene puntos centrales: no se puede probar la curvatura antes de moverse.');
    return { b0, b0Known: true, factors, resp: prep.respName, warn, trans: prep.trans };
  }

  function refreshA() {
    const man = cfg.A.src === 'manual'; $('saManual').hidden = !man;
    const fo = firstOrder();
    if (fo.err) { msg('saModelMsg', man ? 'warn' : 'info', fo.err); $('saCoef').innerHTML = ''; $('saBase').innerHTML = ''; $('saOut').innerHTML = ''; $('saObs').hidden = true; return; }
    msg('saModelMsg', fo.warn.length ? 'warn' : '', fo.warn.length ? fo.warn.map(w => `<div>• ${w}</div>`).join('') : '');
    const big = fo.factors.reduce((bi, f, i) => (Math.abs(f.b) > Math.abs(fo.factors[bi].b) ? i : bi), 0);
    if (cfg.A.base == null || cfg.A.base >= fo.factors.length || !(Math.abs(fo.factors[cfg.A.base].b) > 0)) cfg.A.base = big;
    $('saBase').innerHTML = fo.factors.map((f, i) => `<option value="${i}" ${i === cfg.A.base ? 'selected' : ''} ${Math.abs(f.b) > 0 ? '' : 'disabled'}>${f.letter}: ${esc(f.name)}${i === big ? ' (mayor |b|)' : ''}</option>`).join('');
    const eq = `ŷ = ${fmt(fo.b0)} ${fo.factors.map(f => `${f.b < 0 ? '−' : '+'} ${fmt(Math.abs(f.b))}·x<sub>${f.letter}</sub>`).join(' ')}`;
    $('saCoef').innerHTML = `<h3>Modelo usado</h3><p class="mono">${eq}</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Factor</th><th class="l">Nombre</th><th>Centro</th><th>Semirrango</th><th>b (codificado)</th>${man ? '' : '<th>p</th>'}</tr></thead><tbody>${fo.factors.map(f => `<tr><td><b>${f.letter}</b></td><td class="l">${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}</td><td>${fN(f.center)}</td><td>${fN(f.half)}</td><td>${fmt(f.b)}</td>${man ? '' : `<td${sigC(f.p, app.opts.alpha)}>${fmtP(f.p)}</td>`}</tr>`).join('')}</tbody></table></div>`;
    if (cfg.A.shown) calcA();
  }

  let lastPath = null;
  function calcA() {
    readA(); const fo = firstOrder(); if (fo.err) { refreshA(); return; }
    try {
      const st = R.steepest({ b0: fo.b0, b: fo.factors.map(f => f.b), centers: fo.factors.map(f => f.center), halves: fo.factors.map(f => f.half), base: cfg.A.base, step: cfg.A.step, dir: cfg.A.dir, nSteps: cfg.A.n, round: cfg.A.round === '' ? null : +cfg.A.round });
      cfg.A.shown = true; lastPath = { st, fo };
      const key = JSON.stringify([st.dxi, fo.factors.map(f => f.center)]);
      if (cfg.A.yobs.key !== key) { const keep = cfg.A.yobs.key === '' ? cfg.A.yobs.vals : []; cfg.A.yobs = { key, vals: keep || [] }; }
      persist();
      const fs = fo.factors; const u = f => (f.unit ? ' (' + esc(f.unit) + ')' : '');
      let h = `<h3>Incrementos por paso</h3><div class="table-wrap"><table class="tbl"><thead><tr><th class="l"></th>${fs.map(f => `<th>${f.letter}: ${esc(f.name)}</th>`).join('')}</tr></thead><tbody>
        <tr><td class="l">Δx (codificado)</td>${st.dxc.map(v => `<td>${fmt(v)}</td>`).join('')}</tr>
        <tr><td class="l">Δξ (unidades reales)</td>${st.dxi.map((v, j) => `<td>${fN(v)}${u(fs[j])}</td>`).join('')}</tr></tbody></table></div>`;
      const lb = s => (s === 0 ? 'Origen' : `Origen + ${s}Δ`);
      h += `<h3>Condiciones sobre la trayectoria</h3><div class="table-wrap"><table class="tbl" id="saPath"><thead><tr><th class="l">Paso</th>${fs.map(f => `<th>x<sub>${f.letter}</sub></th>`).join('')}${fs.map(f => `<th>${esc(f.name)}${u(f)}</th>`).join('')}<th>ŷ (1.er orden)</th><th>y observada</th></tr></thead><tbody>${st.steps.map(s => `<tr${s.s === 0 ? ' class="ctr"' : ''}><td class="l">${lb(s.s)}</td>${s.x.map(v => `<td>${fmt(v, 3)}</td>`).join('')}${s.xi.map(v => `<td><b>${fN(v)}</b></td>`).join('')}<td>${fo.b0Known ? fmt(s.yhat, 3) : '—'}${s.extrap ? ' <span class="pill na" title="Fuera de la región del diseño: el modelo extrapola">extrap.</span>' : ''}</td><td><input type="text" inputmode="decimal" data-s="${s.s}" value="${esc(cfg.A.yobs.vals[s.s] == null ? '' : cfg.A.yobs.vals[s.s])}"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Realice las corridas en el orden de la trayectoria y capture la respuesta. ŷ sólo es una referencia: fuera de ±1 el modelo extrapola y deja de ser confiable. Puede pegar una columna de valores en la primera celda.</p>
      <div class="actions"><button id="saCSV" class="ghost">Exportar trayectoria (CSV)</button></div>`;
      $('saOut').innerHTML = h;
      const inputs = [...$('saPath').querySelectorAll('input')];
      inputs.forEach(inp => {
        inp.addEventListener('change', () => { cfg.A.yobs.vals[+inp.dataset.s] = inp.value.trim() === '' ? null : inp.value.trim(); persist(); renderObs(); });
        inp.addEventListener('paste', e => { const t = (e.clipboardData || window.clipboardData).getData('text'); const vals = t.split(/[\r\n\t]+/).map(x => x.trim()).filter(Boolean); if (vals.length < 2) return; e.preventDefault(); const s0 = +inp.dataset.s; vals.forEach((v, i) => { const el = inputs[s0 + i]; if (el) { el.value = v; cfg.A.yobs.vals[s0 + i] = v; } }); persist(); renderObs(); });
      });
      $('saCSV').onclick = () => { const rows = [['Paso', ...fs.map(f => 'x_' + f.letter), ...fs.map(f => f.name + (f.unit ? ' (' + f.unit + ')' : '')), 'yhat_primer_orden', fo.resp || 'y']]; st.steps.forEach(s => rows.push([s.s, ...s.x.map(v => +v.toFixed(6)), ...s.xi.map(v => +v.toPrecision(8)), fo.b0Known ? +s.yhat.toFixed(6) : '', cfg.A.yobs.vals[s.s] == null ? '' : cfg.A.yobs.vals[s.s]])); download('trayectoria_pendiente.csv', rows.map(csvLine).join('\r\n')); };
      renderObs();
    } catch (e) { $('saOut').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  }
  function renderObs() {
    const card = $('saObs'); if (!lastPath) { card.hidden = true; return; }
    const { st, fo } = lastPath; const ys = st.steps.map(s => num(cfg.A.yobs.vals[s.s]));
    const have = ys.map((v, i) => [i, v]).filter(p => isFinite(p[1]));
    if (have.length < 2) { card.hidden = true; return; }
    card.hidden = false; const dir = cfg.A.dir;
    const best = have.reduce((b, p) => (dir * (p[1] - b[1]) > 0 ? p : b), have[0]);
    const lastIdx = have[have.length - 1][0]; const bs = st.steps[best[0]];
    const series = [{ type: 'line', x: have.map(p => p[0]), y: have.map(p => p[1]), color: 'var(--accent)', marker: true, r: 4 }];
    if (fo.b0Known) series.push({ type: 'line', x: st.steps.map(s => s.s), y: st.steps.map(s => s.yhat), color: 'var(--muted)', dash: '5 4' });
    let h = `<h2>Respuesta observada a lo largo de la trayectoria</h2><div class="plot-grid"><div>${P.chart({ title: `${fo.resp || 'y'} por paso`, xlabel: 'Paso (Δ)', ylabel: fo.resp || 'y', series, legend: [{ label: 'Observado', color: 'var(--accent)' }].concat(fo.b0Known ? [{ label: 'ŷ 1.er orden', color: 'var(--muted)', dash: '5 4' }] : []), lines: [{ x1: best[0], x2: best[0], y1: Math.min(...have.map(p => p[1])), y2: Math.max(...have.map(p => p[1])), color: 'var(--ok)', dash: '3 3' }] })}<p class="hint">Línea continua: observado. Línea discontinua: predicción del modelo de primer orden.</p></div><div>`;
    const cond = fo.factors.map((f, j) => `${esc(f.name)} = <b>${fN(bs.xi[j])}</b>${f.unit ? ' ' + esc(f.unit) : ''}`).join(', ');
    if (best[0] === lastIdx && best[0] === st.steps.length - 1) h += `<div class="msg warn">La respuesta todavía mejora en el último paso (${best[0]}Δ). Agregue pasos a la trayectoria antes de cambiar de región.</div>`;
    else if (best[0] === lastIdx) h += `<div class="msg info">La mejor respuesta hasta ahora está en el último paso capturado (${best[0]}Δ). Continúe con el siguiente paso para comprobar si sigue mejorando.</div>`;
    else h += `<div class="msg ok">La respuesta ${dir > 0 ? 'aumenta' : 'disminuye'} hasta el paso <b>${best[0]}Δ</b> (y = ${fN(best[1])}) y después empeora. Ese punto es el nuevo centro de la región de experimentación: ${cond}.</div>`;
    h += `<p class="hint">Siguiente paso habitual: un nuevo 2ᵏ con puntos centrales alrededor de ese punto. Si la curvatura o la falta de ajuste son significativas, aumente con puntos axiales (CCD) o use un Box-Behnken.</p>
      <div class="actions"><button id="saUse" class="primary">Usar el paso ${best[0]}Δ como centro del diseño de 2.º orden (B)</button></div></div></div>`;
    card.innerHTML = h;
    $('saUse').onclick = () => {
      const fs = fo.factors.filter(f => f.numeric !== false);
      const k = Math.max(2, Math.min(cfg.B.type === 'bbd' ? 7 : 6, fs.length));
      if (cfg.B.type === 'bbd' && k < 3) cfg.B.type = 'ccd';
      cfg.B.k = k; cfg.B.nc = cfg.B.ncf = cfg.B.nca = ''; cfg.B.factors = fs.slice(0, k).map(f => { const j = fo.factors.indexOf(f); const c = bs.xi[j]; return { name: f.name, low: String(+(c - f.half).toPrecision(8)), high: String(+(c + f.half).toPrecision(8)), unit: f.unit }; });
      cfg.B.sig = ''; persist(); buildB(); showPane('B');
      msg('rbMsg', 'info', `Factores centrados en el paso ${best[0]}Δ de la trayectoria, con los mismos semirrangos. Ajuste los niveles si conviene y presione <b>Generar diseño</b>.`);
    };
  }

  /* ================================================================ B · DISEÑO */
  let des = null;
  function buildB() {
    const c = cfg.B;
    $('rsmB').innerHTML = `
    <div class="card">
      <h2>Tipo de diseño</h2>
      <div class="grid4">
        <label>Diseño <select id="rbType"><option value="ccd">Central compuesto (CCD)</option><option value="bbd">Box-Behnken (BBD)</option></select></label>
        <label>Número de factores (k) <select id="rbK"></select></label>
        <label id="rbVarW">Variante del CCD <select id="rbVar"><option value="ccc">Circunscrito (CCC)</option><option value="cci">Inscrito (CCI)</option><option value="ccf">Centrado en las caras (CCF, α = 1)</option></select></label>
        <label id="rbAlphaW">Distancia axial α <select id="rbAlpha"><option value="rot">Rotable: α = F^¼</option><option value="orth">Ortogonal</option><option value="block">Bloqueo ortogonal</option><option value="custom">Personalizada</option></select></label>
        <label id="rbAlphaCW">α <input id="rbAlphaC" type="number" min="0.1" step="any"></label>
        <label id="rbHalfW">Porción factorial <select id="rbHalf"><option value="0">Completa 2ᵏ</option><option value="1">Media fracción 2ᵏ⁻¹</option></select></label>
        <label id="rbBlocksW">Bloques <select id="rbBlocks"><option value="1">Sin bloques</option><option value="2">2 bloques: factorial | axial</option></select></label>
        <label id="rbNcW">Puntos centrales <input id="rbNc" type="number" min="0" max="40"></label>
        <label id="rbNcfW">Centros en el bloque factorial <input id="rbNcf" type="number" min="0" max="40"></label>
        <label id="rbNcaW">Centros en el bloque axial <input id="rbNca" type="number" min="0" max="40"></label>
        <label>Semilla de aleatorización <input id="rbSeed" type="number"></label>
      </div>
      <label class="check"><input type="checkbox" id="rbRand"> Aleatorizar el orden de corrida (dentro de cada bloque)</label>
      <div id="rbTypeHint" class="msg info" style="margin-top:12px"></div>
    </div>
    <div class="card">
      <h2>Factores</h2>
      <div class="table-wrap"><table class="tbl" id="rbFactors"></table></div>
      <p class="hint" id="rbLevelHint"></p>
      <div class="grid4"><label>Nombre de la respuesta <input id="rbResp" spellcheck="false"></label></div>
      <div class="actions"><button id="rbGen" class="primary">Generar diseño</button></div>
    </div>
    <div id="rbMsg"></div>
    <div id="rbOut"></div>`;
    $('rbType').value = c.type; $('rbVar').value = c.variant; $('rbAlpha').value = c.alphaKind; $('rbAlphaC').value = c.alphaCustom; $('rbHalf').value = String(c.half); $('rbBlocks').value = String(c.blocks);
    $('rbSeed').value = c.seed; $('rbRand').checked = c.rand !== false; $('rbResp').value = c.resp || 'Respuesta';
    const rd = () => { readB(); controlsB(); };
    ['rbType', 'rbK', 'rbVar', 'rbAlpha', 'rbHalf', 'rbBlocks'].forEach(id => $(id).addEventListener('change', () => { if (id !== 'rbVar' && id !== 'rbAlpha') { cfg.B.nc = cfg.B.ncf = cfg.B.nca = ''; } rd(); }));
    ['rbAlphaC', 'rbNc', 'rbNcf', 'rbNca', 'rbSeed', 'rbRand', 'rbResp'].forEach(id => $(id).addEventListener('change', () => { readB(); controlsB(); }));
    $('rbGen').onclick = () => { readB(); genB(false); };
    controlsB();
    if (c.sig) genB(true);
  }
  function readB() {
    const c = cfg.B; c.type = $('rbType').value; c.k = +$('rbK').value || c.k; c.variant = $('rbVar').value; c.alphaKind = $('rbAlpha').value; c.alphaCustom = $('rbAlphaC').value;
    c.half = +$('rbHalf').value; c.blocks = +$('rbBlocks').value; c.nc = $('rbNc').value; c.ncf = $('rbNcf').value; c.nca = $('rbNca').value; c.seed = +$('rbSeed').value || 0; c.rand = $('rbRand').checked; c.resp = $('rbResp').value.trim() || 'Respuesta';
    if ($('rbFactors').querySelector('input')) $('rbFactors').querySelectorAll('input').forEach(inp => { const f = c.factors[+inp.dataset.i]; if (f) f[inp.dataset.f] = inp.value; });
    persist();
  }
  function controlsB() {
    const c = cfg.B, ccd = c.type === 'ccd';
    const ks = ccd ? [2, 3, 4, 5, 6] : [3, 4, 5, 6, 7]; if (!ks.includes(c.k)) c.k = ccd ? Math.min(6, Math.max(2, c.k)) : Math.min(7, Math.max(3, c.k));
    $('rbK').innerHTML = ks.map(k => `<option ${k === c.k ? 'selected' : ''}>${k}</option>`).join('');
    if (!ccd || c.k < 5) c.half = 0; $('rbHalf').value = String(c.half);
    if (!ccd) c.blocks = 1; $('rbBlocks').value = String(c.blocks);
    if (c.variant === 'ccf' && c.alphaKind !== 'custom') { /* α = 1 */ }
    if (c.alphaKind === 'block' && c.blocks !== 2) { c.alphaKind = 'rot'; $('rbAlpha').value = 'rot'; }
    $('rbVarW').hidden = !ccd; $('rbAlphaW').hidden = !ccd || c.variant === 'ccf'; $('rbAlphaCW').hidden = !ccd || c.variant === 'ccf' || c.alphaKind !== 'custom';
    $('rbAlpha').querySelector('option[value="block"]').disabled = c.blocks !== 2;
    $('rbHalfW').hidden = !ccd || c.k < 5; $('rbBlocksW').hidden = !ccd;
    const blk = ccd && c.blocks === 2; $('rbNcW').hidden = blk; $('rbNcfW').hidden = !blk; $('rbNcaW').hidden = !blk;
    const dc = R.defaultCenters(c.type, c.k, c.half, c.blocks);
    if (c.nc === '' || c.nc == null) c.nc = dc.nc != null ? dc.nc : 5; if (c.ncf === '' || c.ncf == null) c.ncf = dc.ncf != null ? dc.ncf : 4; if (c.nca === '' || c.nca == null) c.nca = dc.nca != null ? dc.nca : 2;
    $('rbNc').value = c.nc; $('rbNcf').value = c.ncf; $('rbNca').value = c.nca;
    while (c.factors.length < c.k) { const i = c.factors.length; c.factors.push({ name: L[i], low: '-1', high: '1', unit: '' }); }
    $('rbFactors').innerHTML = `<thead><tr><th>Factor</th><th class="l">Nombre</th><th>Nivel bajo (x = −1)</th><th>Nivel alto (x = +1)</th><th class="l">Unidad</th></tr></thead><tbody>${c.factors.slice(0, c.k).map((f, i) => `<tr><td><b>${L[i]}</b></td><td class="l"><input data-i="${i}" data-f="name" value="${esc(f.name)}" style="width:140px;text-align:left"></td><td><input data-i="${i}" data-f="low" value="${esc(f.low)}"></td><td><input data-i="${i}" data-f="high" value="${esc(f.high)}"></td><td class="l"><input data-i="${i}" data-f="unit" value="${esc(f.unit)}" style="width:70px;text-align:left"></td></tr>`).join('')}</tbody>`;
    $('rbFactors').querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => readB()));
    const hints = {
      ccc: '<b>CCD circunscrito.</b> Los niveles bajo/alto son los del factorial (x = ±1); los puntos axiales quedan en ±α, <b>fuera</b> de ese intervalo: compruebe que sean físicamente posibles. Cinco niveles por factor, región esférica. Con α rotable la varianza de predicción depende sólo de la distancia al centro.',
      cci: '<b>CCD inscrito.</b> Los niveles bajo/alto son los <b>límites extremos</b> permitidos: los axiales quedan en ±1 y el factorial se reduce a ±1/α. Útil cuando los límites de operación no pueden excederse; explora una región menor.',
      ccf: '<b>CCD centrado en las caras.</b> α = 1: tres niveles por factor y región cúbica. No es rotable, pero no sale de los límites y es práctico cuando cada factor sólo admite tres niveles.',
      bbd: '<b>Box-Behnken.</b> Tres niveles por factor; los puntos están en el punto medio de las aristas y no hay corridas en los vértices, lo que evita combinaciones extremas (costosas o riesgosas). Es rotable o casi rotable y requiere pocas corridas para k = 3 y 4. No puede construirse de forma secuencial a partir de un 2ᵏ.'
    };
    $('rbTypeHint').innerHTML = (ccd ? hints[c.variant] : hints.bbd) + (blk ? ' <br><b>Dos bloques:</b> el bloque 1 (factorial + centros) es un 2ᵏ que puede correrse y analizarse primero (pestañas 1 a 3, prueba de curvatura); el bloque 2 agrega los puntos axiales. Con α de bloqueo ortogonal el efecto del bloque no sesga los coeficientes.' : '');
    $('rbLevelHint').innerHTML = c.type === 'ccd' && c.variant === 'cci' ? 'En el inscrito, bajo y alto son los valores extremos (posición de los puntos axiales).' : 'Los factores deben ser cuantitativos y continuos. La codificación es x = (ξ − centro)/semirrango, con centro = (bajo + alto)/2.';
  }
  function factorScales() {
    return cfg.B.factors.slice(0, cfg.B.k).map((f, i) => { const lo = num(f.low), hi = num(f.high); if (!isFinite(lo) || !isFinite(hi) || lo === hi) throw new Error(`Revise los niveles del factor ${L[i]}: deben ser números distintos.`); return { letter: L[i], name: (f.name || L[i]).trim(), unit: (f.unit || '').trim(), center: (lo + hi) / 2, half: (hi - lo) / 2, low: lo, high: hi }; });
  }
  function genB(silent) {
    const c = cfg.B; msg('rbMsg');
    try {
      const fs = factorScales();
      const d = c.type === 'ccd' ? R.ccd({ k: c.k, half: !!c.half, variant: c.variant, alphaKind: c.alphaKind, alphaCustom: num(c.alphaCustom), blocks: c.blocks, nc: +c.nc, ncf: +c.ncf, nca: +c.nca }) : R.bbd({ k: c.k, nc: +c.nc });
      R.randomize(d, c.rand, c.seed); d.factors = fs; d.resp = c.resp;
      const sig = JSON.stringify([c.type, c.k, c.variant, c.alphaKind, c.alphaCustom, c.half, c.blocks, c.nc, c.ncf, c.nca, c.rand, c.seed]);
      if (c.sig !== sig) { if (c.sig && !silent) c.ys = []; c.sig = sig; }
      if (!Array.isArray(c.ys) || c.ys.length !== d.runs.length) c.ys = new Array(d.runs.length).fill('');
      des = d; persist(); renderDesign();
    } catch (e) { msg('rbMsg', 'err', esc(e.message)); $('rbOut').innerHTML = ''; des = null; }
  }
  const natOf = (f, x) => f.center + f.half * x;
  function renderDesign() {
    const d = des, fs = d.factors, k = d.k, c = cfg.B;
    const nF = d.runs.filter(r => r.type === 1).length, nA = d.runs.filter(r => r.type === -1 || r.type === 2).length, nC = d.runs.filter(r => r.type === 0).length;
    const levels = [...new Set(d.runs.flatMap(r => r.x.map(v => +v.toFixed(6))))].sort((a, b) => a - b);
    const rad = Math.max(...d.runs.map(r => Math.sqrt(S.dot(r.x, r.x))));
    // varianza de predicción escalada sobre un eje y sobre la diagonal
    const radii = [0, 0.5, 1, d.kind === 'ccd' ? d.axial : Math.sqrt(2)].filter((v, i, a) => a.indexOf(v) === i && v <= rad + 1e-9);
    const spvRows = radii.map(r => { const ax = new Array(k).fill(0); ax[0] = r; const dg = new Array(k).fill(r / Math.sqrt(k)); return [r, R.spv(d.runs, k, ax), R.spv(d.runs, k, dg)]; });
    const rot = spvRows.every(([, a, b]) => Math.abs(a - b) < 1e-6 * Math.max(1, a));
    const orth = R.blockOrthogonality(d);
    const fact = d.kind === 'ccd' ? (d.half ? `2<sup>${k}−1</sup> (I = ${L.slice(0, k).join('')})` : `2<sup>${k}</sup>`) : '—';
    const axialLbl = d.kind === 'ccd' ? 'Puntos axiales' : 'Puntos en aristas';
    const warn = [];
    fs.forEach((f, j) => { const lo = natOf(f, levels[0]), hi = natOf(f, levels[levels.length - 1]); if (Math.min(f.low, f.high) >= 0 && Math.min(lo, hi) < 0) warn.push(`${esc(f.name)}: el nivel axial ${fN(Math.min(lo, hi))} es negativo. Considere el CCD inscrito o centrado en las caras, o ajuste los niveles.`); });
    let h = `<div class="card"><h2>Propiedades del diseño</h2>
      <div class="kv"><div><span>Corridas totales</span><b>${d.runs.length}</b></div><div><span>Porción factorial</span><b>${d.kind === 'ccd' ? nF + ' · ' : ''}${fact}</b></div><div><span>${axialLbl}</span><b>${nA}</b></div><div><span>Puntos centrales</span><b>${nC}</b></div>
      ${d.kind === 'ccd' ? `<div><span>α (relativo al factorial)</span><b>${fmt(d.alpha, 4)}</b></div>` : ''}<div><span>Niveles por factor</span><b>${levels.length}</b></div><div><span>Parámetros del modelo cuadrático</span><b>${1 + 2 * k + k * (k - 1) / 2}${d.blocks === 2 ? ' + 1 bloque' : ''}</b></div>
      <div><span>Rotable</span><b>${rot ? '<span class="pill ok">sí</span>' : '<span class="pill na">no</span>'}</b></div>${orth != null ? `<div><span>Bloqueo ortogonal</span><b>${orth < 1e-8 ? '<span class="pill ok">sí</span>' : `<span class="pill bad">no</span> <small>r máx = ${fmt(orth, 3)}</small>`}</b></div>` : ''}</div>
      ${warn.length ? `<div class="msg warn">${warn.join('<br>')}</div>` : ''}
      <h3>Niveles en unidades reales</h3><div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Factor</th>${levels.map(v => `<th>x = ${fN(v)}</th>`).join('')}</tr></thead><tbody>${fs.map(f => `<tr><td class="l"><b>${f.letter}</b>: ${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}</td>${levels.map(v => `<td>${fN(natOf(f, v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <details><summary>Varianza de predicción escalada N·Var(ŷ)/σ²</summary><p class="hint">Calculada para el modelo cuadrático completo. En un diseño rotable es igual en todas las direcciones a la misma distancia ρ del centro.</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>ρ</th><th>Sobre un eje</th><th>Sobre la diagonal</th></tr></thead><tbody>${spvRows.map(r => `<tr><td>${fmt(r[0], 3)}</td><td>${fmt(r[1], 3)}</td><td>${fmt(r[2], 3)}</td></tr>`).join('')}</tbody></table></div></details></div>`;
    const sortRun = c.sortStd ? (a, b) => a.std - b.std : (a, b) => a.run - b.run;
    const runs = d.runs.slice().sort(sortRun);
    const tp = { 1: '1', '-1': '−1', 0: '0', 2: '2' };
    h += `<div class="card"><h2>Hoja de trabajo</h2>
      <div class="inline"><label class="check" style="margin:0"><input type="checkbox" id="rbSortStd" ${c.sortStd ? 'checked' : ''}> Ordenar por orden estándar</label></div>
      <div class="table-wrap short" style="max-height:520px"><table class="tbl" id="rbSheet"><thead><tr><th>OrdenEst</th><th>OrdenCorrida</th><th>Bloque</th><th>TipoPunto</th>${fs.map(f => `<th>x<sub>${f.letter}</sub></th>`).join('')}${fs.map(f => `<th>${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}</th>`).join('')}<th>${esc(d.resp)}</th></tr></thead><tbody>${runs.map(r => `<tr${r.type === 0 ? ' class="ctr"' : ''}><td>${r.std}</td><td>${r.run}</td><td>${r.block}</td><td>${tp[r.type]}</td>${r.x.map(v => `<td>${fmt(v, 3)}</td>`).join('')}${r.x.map((v, j) => `<td><b>${fN(natOf(fs[j], v))}</b></td>`).join('')}<td><input type="text" inputmode="decimal" data-std="${r.std}" value="${esc(c.ys[r.std - 1])}"></td></tr>`).join('')}</tbody></table></div>
      <p class="hint"><b>TipoPunto</b> (en Minitab, <i>PtType</i>): 1 = punto factorial, −1 = punto axial, 2 = punto en arista (Box-Behnken), 0 = punto central. Realice las corridas en el <b>OrdenCorrida</b> y capture la respuesta; puede pegar una columna completa en la primera celda.</p>
      <div class="actions"><button id="rbCSV" class="ghost">Exportar hoja (CSV)</button><button id="rbAnalyze" class="primary">Analizar en C · Análisis de 2.º orden</button></div></div>`;
    $('rbOut').innerHTML = h;
    $('rbSortStd').onchange = () => { cfg.B.sortStd = $('rbSortStd').checked; persist(); renderDesign(); };
    const inputs = [...$('rbSheet').querySelectorAll('input')];
    inputs.forEach((inp, idx) => {
      inp.addEventListener('change', () => { cfg.B.ys[+inp.dataset.std - 1] = inp.value.trim(); persist(); });
      inp.addEventListener('paste', e => { const t = (e.clipboardData || window.clipboardData).getData('text'); const vals = t.split(/[\r\n\t]+/).map(x => x.trim()).filter(Boolean); if (vals.length < 2) return; e.preventDefault(); vals.forEach((v, i) => { const el = inputs[idx + i]; if (el) { el.value = v; cfg.B.ys[+el.dataset.std - 1] = v; } }); persist(); });
    });
    $('rbCSV').onclick = () => {
      const rows = [['OrdenEst', 'OrdenCorrida', 'Bloque', 'TipoPunto', ...fs.map(f => f.name), ...fs.map(f => 'x_' + f.letter), d.resp]];
      d.runs.slice().sort((a, b) => a.run - b.run).forEach(r => rows.push([r.std, r.run, r.block, r.type, ...r.x.map((v, j) => +natOf(fs[j], v).toPrecision(8)), ...r.x.map(v => +v.toFixed(6)), cfg.B.ys[r.std - 1] || '']));
      download(`diseno_${d.kind}_k${k}.csv`, rows.map(csvLine).join('\r\n'));
    };
    $('rbAnalyze').onclick = () => {
      const filled = cfg.B.ys.filter(v => isFinite(num(v))).length;
      if (filled < 1 + 2 * k + k * (k - 1) / 2) { msg('rbMsg', 'warn', `Capture al menos ${1 + 2 * k + k * (k - 1) / 2} respuestas (parámetros del modelo cuadrático) antes de analizar; hay ${filled}.`); return; }
      cfg.C.src = 'design'; loadC('design');
      showPane('C');
    };
  }
  function designDataset() {
    const d = des; if (!d) return null; const fs = d.factors;
    const headers = ['OrdenCorrida', 'Bloque', 'TipoPunto', ...fs.map(f => f.name), d.resp];
    const rows = d.runs.slice().sort((a, b) => a.run - b.run).map(r => [String(r.run), String(r.block), String(r.type), ...r.x.map((v, j) => String(+natOf(fs[j], v).toPrecision(10))), String(cfg.B.ys[r.std - 1] == null ? '' : cfg.B.ys[r.std - 1])]);
    const coding = {}; fs.forEach(f => { coding[f.name] = { center: f.center, half: f.half, unit: f.unit }; });
    return { headers, rows, coding, preset: { resp: headers.length - 1, block: d.blocks === 2 ? 1 : -1, factors: fs.map((_, j) => 3 + j), run: 0 }, note: 'Datos tomados de la hoja de trabajo del diseño (B).' };
  }

  /* ================================================================ C · ANÁLISIS */
  const EX112 = () => {
    const rows = [[1, 80, 170, 76.5], [2, 80, 180, 77.0], [3, 90, 170, 78.0], [4, 90, 180, 79.5], [5, 85, 175, 79.9], [6, 85, 175, 80.3], [7, 85, 175, 80.0], [8, 85, 175, 79.7], [9, 85, 175, 79.8], [10, 92.07, 175, 78.4], [11, 77.93, 175, 75.6], [12, 85, 182.07, 78.5], [13, 85, 167.93, 77.0]];
    return { headers: ['OrdenEst', 'Tiempo_min', 'Temperatura_F', 'Rendimiento'], rows: rows.map(r => r.map(String)), coding: { Tiempo_min: { center: 85, half: 5, unit: 'min' }, Temperatura_F: { center: 175, half: 5, unit: '°F' } }, preset: { resp: 3, block: -1, factors: [1, 2], run: 0 }, note: 'Ejemplo 11.2 de Montgomery (CCD rotable, k = 2, α = 1.414, 5 centros). Resultado esperado: punto estacionario en 86.9 min y 176.5 °F, ŷ = 80.21; máximo (λ = −0.963 y −1.414).' };
  };
  const EXBBD = () => {
    // Datos simulados con fines didácticos (no provienen de un experimento real):
    // y = 72 + 4.1A + 2.6B − 1.8C − 3.2A² − 2.4B² − 1.1C² + 1.5AB + error
    const pts = R.bbd({ k: 3, nc: 3 }).runs.map(r => r.x); const e = [0.4, -0.6, 0.3, 0.2, -0.3, 0.5, -0.2, -0.4, 0.6, -0.1, 0.1, -0.5, 0.3, -0.2, 0.2];
    const rows = pts.map((x, i) => { const [a, b, c] = x; const y = 72 + 4.1 * a + 2.6 * b - 1.8 * c - 3.2 * a * a - 2.4 * b * b - 1.1 * c * c + 1.5 * a * b + e[i]; return [i + 1, 60 + 10 * a, 2 + 0.5 * b, 12 + 4 * c, +y.toFixed(2)]; });
    return { headers: ['OrdenEst', 'Temperatura_C', 'pH', 'Tiempo_h', 'Rendimiento_pct'], rows: rows.map(r => r.map(String)), coding: { Temperatura_C: { center: 60, half: 10, unit: '°C' }, pH: { center: 2, half: 0.5, unit: '' }, Tiempo_h: { center: 12, half: 4, unit: 'h' } }, preset: { resp: 4, block: -1, factors: [1, 2, 3], run: 0 }, note: '<b>Datos simulados con fines didácticos</b> (Box-Behnken, k = 3, 3 centros): no corresponden a un experimento real.' };
  };
  function parseCSV(text) {
    text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const first = text.split('\n').find(l => l.trim()) || ''; const cnt = ch => (first.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
    const delim = ['\t', ';', ','].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) { const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === delim) { row.push(cur.trim()); cur = ''; } else if (ch === '\n') { row.push(cur.trim()); rows.push(row); row = []; cur = ''; } else cur += ch; }
    if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
    return toDataset(rows, delim === ';');
  }
  function toDataset(rows, commaDec) {
    let clean = rows.map(r => r.map(v => (v == null ? '' : String(v).trim()))).filter(r => r.some(v => v !== ''));
    if (clean.length < 2) throw new Error('Se requieren encabezados y al menos una fila de datos.');
    const filled = r => r.filter(v => v !== '').length, maxW = Math.max(...clean.map(filled));
    clean = clean.slice(Math.max(0, clean.findIndex(r => filled(r) >= Math.max(2, Math.ceil(maxW * 0.6)))));
    const width = Math.max(...clean.map(r => r.length)); const keep = [...Array(width).keys()].filter(j => clean.some(r => (r[j] || '') !== ''));
    clean = clean.map(r => keep.map(j => (commaDec ? (r[j] || '').replace(',', '.') : r[j] || '')));
    let headers = clean[0].map((h, i) => h || `Col${i + 1}`); const seen = {}; headers = headers.map(h => { if (seen[h]) { seen[h]++; return `${h}_${seen[h]}`; } seen[h] = 1; return h; });
    return { headers, rows: clean.slice(1).map(r => headers.map((_, i) => r[i] || '')) };
  }
  function loadXLSX() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/xlsx.full.min.js'; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel.')); document.head.appendChild(s); });
  }

  function buildC() {
    $('rsmC').innerHTML = `
    <div class="card">
      <h2>Datos</h2>
      <div class="grid3">
        <label>Origen de los datos
          <select id="rcSrc">
            <option value="design">Hoja de trabajo del diseño (B)</option>
            <option value="app">Datos cargados en la pestaña 2 · Datos</option>
            <option value="file">Archivo o celdas pegadas</option>
            <option value="ex1">Ejemplo: CCD k = 2, rendimiento (Montgomery 11.2)</option>
            <option value="ex2">Ejemplo: Box-Behnken k = 3 (datos simulados)</option>
          </select></label>
        <div id="rcFileW" hidden>
          <label>Archivo Excel, ODS, CSV o TXT <input type="file" id="rcFile" accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.tsv"></label>
          <label>O pegue las celdas (con encabezados) <textarea id="rcPaste" rows="3"></textarea></label>
        </div>
      </div>
      <div class="actions"><button id="rcLoad" class="primary">Cargar datos</button></div>
    </div>
    <div id="rcMsg"></div>
    <div class="card" id="rcMap" hidden>
      <h2>Asignar columnas y codificación</h2>
      <div class="grid4"><label>Respuesta (y) <select id="rcResp"></select></label><label>Bloque (opcional) <select id="rcBlock"></select></label></div>
      <p class="lbl">Factores (recibirán las letras A, B, C… en este orden):</p>
      <div id="rcFactors" class="chips"></div>
      <div class="table-wrap"><table class="tbl" id="rcCoding"></table></div>
      <p class="hint">Codificación x = (ξ − centro)/semirrango. Se propone automáticamente: con cinco niveles (−α, −1, 0, +1, +α de un CCD) el segundo nivel menor y el segundo mayor son ±1; con tres niveles (CCF, Box-Behnken) el mínimo y el máximo. Si sus datos tienen otra estructura, corrija centro y semirrango: los coeficientes codificados dependen de esta elección, pero las predicciones en unidades reales no.</p>
      <div class="actions"><button id="rcAnalyze" class="primary">Ajustar modelo de 2.º orden</button></div>
      <h3>Vista previa</h3><div class="table-wrap short" id="rcPreview"></div>
    </div>
    <div id="rcRes" class="an-layout" hidden>
      <aside class="card side">
        <h2>Modelo</h2>
        <div class="opts"><label>α <input type="number" id="rcAlpha" min="0.001" max="0.2" step="0.01"></label><label class="check"><input type="checkbox" id="rcBlocks"> Incluir bloques</label></div>
        <div class="btn-grid">
          <button class="ghost sm" data-m="full">Cuadrático completo</button><button class="ghost sm" data-m="lin">Lineal</button>
          <button class="ghost sm" data-m="li">Lineal + interacciones</button><button class="ghost sm" data-m="lq">Lineal + cuadrados</button>
          <button class="ghost sm" data-m="reduce" style="grid-column:1/-1">Reducir (p &gt; α, con jerarquía)</button>
        </div>
        <div id="rcTerms" class="term-list"></div>
        <div id="rcLegend" class="hint"></div>
      </aside>
      <div class="results">
        <div id="rcModelMsg"></div>
        <div class="card" id="rcSum"></div>
        <div class="card" id="rcAnova"></div>
        <div class="card" id="rcEq"></div>
        <div class="card" id="rcCanon"></div>
        <div class="card" id="rcRidge"></div>
        <div class="card" id="rcOpt"></div>
        <div class="card" id="rcPlots"></div>
        <div class="card" id="rcDiag"></div>
      </div>
    </div>`;
    $('rcSrc').value = cfg.C.src; $('rcFileW').hidden = cfg.C.src !== 'file';
    $('rcSrc').onchange = () => { cfg.C.src = $('rcSrc').value; $('rcFileW').hidden = cfg.C.src !== 'file'; persist(); };
    $('rcLoad').onclick = () => loadC(cfg.C.src);
    $('rcAnalyze').onclick = () => analyzeC();
    $('rcFile').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        let ds;
        if (/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)) { await loadXLSX(); const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); const ws = wb.Sheets[wb.SheetNames[0]]; ds = toDataset(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })); ds.note = `Archivo ${f.name}, hoja «${wb.SheetNames[0]}».`; }
        else { ds = parseCSV(await f.text()); ds.note = `Archivo ${f.name}.`; }
        setDataset(ds);
      } catch (err) { msg('rcMsg', 'err', esc(err.message)); }
    };
    $('rcAlpha').value = cfg.C.alpha; $('rcBlocks').checked = cfg.C.blocks !== false;
    $('rcAlpha').onchange = () => { const a = +$('rcAlpha').value; if (a > 0 && a < 0.5) { cfg.C.alpha = a; persist(); fitC(); } };
    $('rcBlocks').onchange = () => { cfg.C.blocks = $('rcBlocks').checked; persist(); fitC(); };
    $('rcRes').querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => setModel(b.dataset.m)));
    if (cfg.C.ds) { try { setDataset(cfg.C.ds, true); if (cfg.C.map && cfg.C.analyzed) analyzeC(true); } catch (e) { /* sesión anterior inválida */ } }
  }
  function loadC(src) {
    msg('rcMsg');
    try {
      let ds;
      if (src === 'design') { if (!des) throw new Error('Primero genere el diseño en B y capture las respuestas.'); ds = designDataset(); }
      else if (src === 'app') { if (!app || !app.dataset) throw new Error('No hay datos cargados en la pestaña 2 · Datos.'); ds = JSON.parse(JSON.stringify({ headers: app.dataset.headers, rows: app.dataset.rows })); ds.note = 'Datos de la pestaña 2 · Datos.'; }
      else if (src === 'ex1') ds = EX112();
      else if (src === 'ex2') ds = EXBBD();
      else { const t = $('rcPaste').value; if (!t.trim()) throw new Error('Seleccione un archivo o pegue las celdas.'); ds = parseCSV(t); ds.note = 'Datos pegados.'; }
      $('rcSrc').value = src; cfg.C.src = src; $('rcFileW').hidden = src !== 'file';
      setDataset(ds);
      if (ds.preset) analyzeC();
    } catch (e) { msg('rcMsg', 'err', esc(e.message)); }
  }
  const isNumCol = (ds, j) => { const v = ds.rows.map(r => r[j]).filter(x => x !== '' && x != null); return v.length >= 3 && v.every(x => isFinite(num(x))); };
  function setDataset(ds, restoring) {
    if (!restoring) { cfg.C.map = null; cfg.C.terms = null; cfg.C.analyzed = false; }
    cfg.C.ds = ds; persist();
    const H = ds.headers; const pre = (!restoring && ds.preset) || cfg.C.map || null;
    const numCols = H.map((_, j) => j).filter(j => isNumCol(ds, j));
    const skip = /^(orden|run|std|tipopunto|tipopt|pttype|bloque|block)/i;
    const respDefault = pre ? pre.resp : numCols.filter(j => !skip.test(H[j])).slice(-1)[0];
    const blockDefault = pre ? pre.block : H.findIndex(h => /^(bloque|block)/i.test(h));
    $('rcResp').innerHTML = numCols.map(j => `<option value="${j}" ${j === respDefault ? 'selected' : ''}>${esc(H[j])}</option>`).join('');
    $('rcBlock').innerHTML = `<option value="-1">— Ninguno —</option>` + H.map((h, j) => `<option value="${j}" ${j === blockDefault ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const facDefault = pre ? pre.factors : numCols.filter(j => j !== respDefault && !skip.test(H[j]) && !/^x_[A-H]$/.test(H[j]));
    $('rcFactors').innerHTML = numCols.map(j => `<label class="${facDefault.includes(j) ? 'on' : ''}"><input type="checkbox" value="${j}" ${facDefault.includes(j) ? 'checked' : ''}> ${esc(H[j])}</label>`).join('');
    $('rcFactors').querySelectorAll('input').forEach(c => c.addEventListener('change', () => { c.parentElement.classList.toggle('on', c.checked); codingTable(); }));
    $('rcResp').onchange = () => codingTable();
    $('rcPreview').innerHTML = `<table class="tbl"><thead><tr>${H.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${ds.rows.slice(0, 40).map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $('rcMap').hidden = false;
    codingTable(pre && pre.coding, true);
    msg('rcMsg', 'info', `${ds.note || 'Datos cargados.'} ${ds.rows.length} filas, ${H.length} columnas.`);
  }
  function selFactors() { return [...$('rcFactors').querySelectorAll('input:checked')].map(c => +c.value); }
  function codingTable(saved, fresh) {
    const ds = cfg.C.ds; const fj = selFactors();
    const prevInputs = {}; if (!fresh) $('rcCoding').querySelectorAll('input').forEach(i => { prevInputs[i.dataset.j + i.dataset.f] = i.value; });
    $('rcCoding').innerHTML = !fj.length ? '' : `<thead><tr><th>Letra</th><th class="l">Columna</th><th class="l">Niveles observados</th><th>Centro (x = 0)</th><th>Semirrango (x = ±1)</th><th class="l">Unidad</th></tr></thead><tbody>${fj.map((j, i) => {
      const vals = ds.rows.map(r => num(r[j])).filter(isFinite); const ac = R.autoCoding(vals);
      const pc = (ds.coding && ds.coding[ds.headers[j]]) || (saved && saved[j]) || null;
      const c0 = prevInputs[j + 'c'] != null ? prevInputs[j + 'c'] : pc ? pc.center : fN(ac.center), h0 = prevInputs[j + 'h'] != null ? prevInputs[j + 'h'] : pc ? pc.half : fN(ac.half), u0 = prevInputs[j + 'u'] != null ? prevInputs[j + 'u'] : pc && pc.unit ? pc.unit : '';
      return `<tr><td><b>${L[i]}</b></td><td class="l">${esc(ds.headers[j])}</td><td class="l mono">${ac.levels.slice(0, 7).map(fN).join(', ')}${ac.levels.length > 7 ? ' …' : ''}</td><td><input data-j="${j}" data-f="c" type="number" step="any" value="${esc(c0)}"></td><td><input data-j="${j}" data-f="h" type="number" step="any" min="0" value="${esc(h0)}"></td><td class="l"><input data-j="${j}" data-f="u" value="${esc(u0)}" style="width:70px;text-align:left"></td></tr>`;
    }).join('')}</tbody>`;
  }

  let prepC = null, fitRes = null;
  function analyzeC(restoring) {
    try {
      const ds = cfg.C.ds; const jy = +$('rcResp').value, jb = +$('rcBlock').value; const fj = selFactors();
      if (fj.length < 2) throw new Error('Seleccione al menos dos factores.'); if (fj.length > 8) throw new Error('El máximo es de 8 factores.');
      if (fj.includes(jy)) throw new Error('La respuesta no puede ser también un factor.');
      const cod = {}; $('rcCoding').querySelectorAll('input').forEach(i => { (cod[i.dataset.j] = cod[i.dataset.j] || {})[i.dataset.f] = i.value; });
      const factors = fj.map((j, i) => { const c = num(cod[j].c), h = num(cod[j].h); if (!isFinite(c) || !(h > 0)) throw new Error(`Revise centro y semirrango de ${ds.headers[j]}.`); return { letter: L[i], name: ds.headers[j], unit: (cod[j].u || '').trim(), center: c, half: h, col: j }; });
      const rows = ds.rows.filter(r => isFinite(num(r[jy])) && fj.every(j => isFinite(num(r[j]))));
      const k = fj.length, p = 1 + 2 * k + k * (k - 1) / 2;
      if (rows.length < k + 2) throw new Error('Hay muy pocas observaciones completas.');
      const X = rows.map(r => factors.map(f => Math.round((num(r[f.col]) - f.center) / f.half * 1e10) / 1e10));
      const y = rows.map(r => num(r[jy])); const block = jb >= 0 ? rows.map(r => String(r[jb]).trim()) : null;
      prepC = { X, y, block, factors, k, respName: ds.headers[jy], skipped: ds.rows.length - rows.length, p };
      cfg.C.map = { resp: jy, block: jb, factors: fj, coding: Object.fromEntries(factors.map(f => [f.col, { center: f.center, half: f.half, unit: f.unit }])) };
      const saved = restoring && Array.isArray(cfg.C.terms) ? cfg.C.terms.map(R.parseKey).filter(t => (t.i < k) && (t.j == null || t.j < k)) : null;
      cfg.C.terms = (saved && saved.length ? saved : R.fullTerms(k)).map(R.termKey); cfg.C.analyzed = true; persist();
      $('rcRes').hidden = false; fitC();
      if (!restoring) $('rcRes').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { msg('rcMsg', 'err', esc(e.message)); }
  }
  /** Conserva sólo los términos estimables (agrega uno a la vez y verifica el rango) */
  function estimable(terms) {
    const ok = [], lost = [];
    terms.forEach(t => { try { R.fit(prepC, ok.concat([t]), { alpha: cfg.C.alpha, blocks: cfg.C.blocks }); ok.push(t); } catch (e) { lost.push(t); } });
    return { ok, lost };
  }
  function setModel(m) {
    if (!prepC) return; const k = prepC.k; const all = R.fullTerms(k);
    let t;
    if (m === 'full') t = all; else if (m === 'lin') t = all.filter(x => x.type === 'lin'); else if (m === 'li') t = all.filter(x => x.type !== 'sq'); else if (m === 'lq') t = all.filter(x => x.type !== 'int');
    else if (m === 'reduce') {
      if (!fitRes || fitRes.summary.dfE <= 0) { msg('rcModelMsg', 'warn', 'El modelo no tiene grados de libertad para el error.'); return; }
      const r = R.reduce(prepC, cur(), { alpha: cfg.C.alpha, blocks: cfg.C.blocks }); t = r.terms;
      cfg.C.terms = t.map(R.termKey); persist(); fitC(r.removed.length ? `Eliminados (en orden): ${r.removed.join(', ')}. La selección posterior al análisis es exploratoria: confirme con corridas.` : 'Ningún término cumple p &gt; α sin romper la jerarquía.'); return;
    }
    cfg.C.terms = t.map(R.termKey); persist(); fitC();
  }
  const cur = () => cfg.C.terms.map(R.parseKey);
  function fitC(note) {
    if (!prepC) return; const opts = { alpha: cfg.C.alpha, blocks: cfg.C.blocks };
    const { ok, lost } = estimable(cur());
    const notes = [];
    if (lost.length) { notes.push(`No estimables con estos datos: <b>${lost.map(t => R.termName(t)).join(', ')}</b>. Se omiten del modelo${lost.some(t => t.type === 'sq') ? '; para estimar los términos cuadráticos agregue puntos axiales (CCD) o use un Box-Behnken' : ''}.`); cfg.C.terms = ok.map(R.termKey); persist(); }
    if (!ok.length) { msg('rcModelMsg', 'err', 'Ningún término es estimable.'); return; }
    try { fitRes = R.fit(prepC, ok, opts); } catch (e) { msg('rcModelMsg', 'err', esc(e.message)); return; }
    const miss = R.hierarchyMissing(ok); if (miss.length) notes.push(`Modelo no jerárquico: faltan ${miss.map(t => R.termName(t)).join(', ')}. La ecuación en unidades reales y el análisis canónico pueden cambiar con la codificación.`);
    if (prepC.skipped) notes.push(`${prepC.skipped} fila(s) incompletas se omitieron.`);
    if (fitRes.summary.dfE <= 0) notes.push('Modelo saturado: no hay grados de libertad para el error; agregue puntos centrales o reduzca el modelo.');
    if (note) notes.unshift(note);
    msg('rcModelMsg', notes.length ? 'warn' : '', notes.join('<br>'));
    renderTerms(); renderFit();
  }
  function renderTerms() {
    const k = prepC.k; const set = new Set(cfg.C.terms); const all = R.fullTerms(k);
    const grp = (ty, lab) => `<div class="grp">${lab}</div>` + all.filter(t => t.type === ty).map(t => `<label><input type="checkbox" value="${R.termKey(t)}" ${set.has(R.termKey(t)) ? 'checked' : ''}><span class="tn">${R.termName(t)}</span></label>`).join('');
    $('rcTerms').innerHTML = grp('lin', 'Lineales') + grp('sq', 'Cuadráticos') + (k > 1 ? grp('int', 'Interacciones') : '');
    $('rcTerms').querySelectorAll('input').forEach(c => c.addEventListener('change', () => { const keys = [...$('rcTerms').querySelectorAll('input:checked')].map(x => x.value); if (!keys.length) { c.checked = true; return; } cfg.C.terms = keys; persist(); fitC(); }));
    $('rcLegend').innerHTML = prepC.factors.map(f => `<div><b>${f.letter}</b> = ${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}: ${fN(f.center)} ± ${fN(f.half)}</div>`).join('');
  }

  const xiOf = (j, x) => prepC.factors[j].center + prepC.factors[j].half * x;
  function natStr(x) { return prepC.factors.map((f, j) => `${esc(f.name)} = <b>${fN(xiOf(j, x[j]))}</b>${f.unit ? ' ' + esc(f.unit) : ''}`).join(', '); }
  function designRadius() { return Math.max(1, ...prepC.X.map(x => Math.sqrt(S.dot(x, x)))); }
  function designExtent() { return Math.max(1, ...prepC.X.map(x => Math.max(...x.map(Math.abs)))); }

  function renderFit() {
    const f = fitRes, sm = f.summary, a = cfg.C.alpha, fs = prepC.factors;
    $('rcSum').innerHTML = `<h2>Resumen del modelo · ${esc(prepC.respName)}</h2>
      <div class="kv"><div><span>Observaciones</span><b>${sm.n}</b></div><div><span>S</span><b>${fmt(sm.s)}</b></div><div><span>R²</span><b>${fmt(100 * sm.r2, 2)} %</b></div><div><span>R² ajustado</span><b>${fmt(100 * sm.r2adj, 2)} %</b></div><div><span>R² de predicción</span><b>${fmt(100 * sm.r2pred, 2)} %</b></div><div><span>PRESS</span><b>${fmt(sm.press)}</b></div><div><span>gl del error</span><b>${sm.dfE}</b></div></div>
      <h3>Coeficientes (unidades codificadas)</h3><div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Término</th><th>Coef.</th><th>EE</th><th>t</th><th>p</th><th>IC ${Math.round((1 - a) * 100)} %</th><th>FIV</th></tr></thead><tbody>${f.coefs.map(c => `<tr><td class="l"><b>${esc(c.name)}</b></td><td>${fmt(c.coef)}</td><td>${fmt(c.se)}</td><td>${fmt(c.t, 3)}</td><td${sigC(c.p, a)}>${fmtP(c.p)}</td><td>${fmt(c.lo, 3)} ; ${fmt(c.hi, 3)}</td><td>${c.kind === 'int' ? '' : fmt(c.vif, 3)}</td></tr>`).join('')}</tbody></table></div>`;
    const lof = f.lof;
    $('rcAnova').innerHTML = `<h2>Análisis de varianza</h2><div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Fuente</th><th>gl</th><th>SC ajustada</th><th>CM ajustado</th><th>F</th><th>p</th></tr></thead><tbody>${f.anova.map(r => `<tr class="${r.level === 1 ? 'l1' : r.level === 2 ? 'l2' : ''} ${r.kind === 'tot' || r.source === 'Modelo' ? 'sum' : ''}"><td class="l">${esc(r.source)}</td><td>${r.df}</td><td>${fmt(r.ss)}</td><td>${r.ms != null ? fmt(r.ms) : ''}</td><td>${r.F != null && isFinite(r.F) ? fmt(r.F, 3) : ''}</td><td${sigC(r.p, a)}>${r.p != null ? fmtP(r.p) : ''}</td></tr>`).join('')}</tbody></table></div>
      ${lof ? `<p class="hint">${lof.p <= a ? `<b>Falta de ajuste significativa</b> (p = ${fmtP(lof.p)}): el modelo no describe adecuadamente la superficie. Revise transformaciones, términos de orden superior o datos atípicos.` : `Falta de ajuste no significativa (p = ${fmtP(lof.p)}): no hay evidencia de que el modelo sea inadecuado.`} El error puro proviene de ${lof.dfPE + 1 > 1 ? 'las corridas repetidas (puntos centrales)' : 'réplicas'}.</p>` : '<p class="hint">Sin réplicas no es posible separar falta de ajuste y error puro.</p>'}
      <p class="hint">SC ajustadas: cada grupo se prueba como el incremento de la suma de cuadrados del error al quitarlo del modelo completo.</p>`;
    // ecuaciones
    const sgn = (v, first) => (v < 0 ? (first ? '−' : ' − ') : first ? '' : ' + ');
    const cod = f.coefs.filter(c => c.kind === 'int' || c.kind === 'term').map((c, i) => `${sgn(c.coef, i === 0)}${fmt(Math.abs(c.coef))}${c.kind === 'term' ? '·' + c.name : ''}`).join('');
    const poly = R.naturalPoly(f, fs.map(x => x.center), fs.map(x => x.half));
    const mono = pw => pw.map((e, j) => (e ? esc(fs[j].name) + (e === 2 ? '²' : '') : '')).filter(Boolean).join('·');
    const natural = poly.filter(m => Math.abs(m.coef) > 1e-15).map((m, i) => `${sgn(m.coef, i === 0)}${fmt(Math.abs(m.coef), 6).replace(/0+$/, '').replace(/\.$/, '')}${mono(m.pow) ? '·' + mono(m.pow) : ''}`).join('');
    $('rcEq').innerHTML = `<h2>Ecuación del modelo</h2><p class="lbl">Unidades codificadas</p><p class="mono">ŷ = ${cod}</p><p class="lbl">Unidades reales</p><p class="mono">${esc(prepC.respName)} = ${natural}</p>${f.nBlockCols ? '<p class="hint">Los bloques se omiten de la ecuación (promedio de bloques).</p>' : ''}<p class="hint">Use la ecuación codificada para comparar la importancia de los términos; la de unidades reales depende de la escala de cada factor.</p>`;
    renderCanon(); renderRidge(); renderOpt(); renderPlots(); renderDiag();
  }

  let canon = null;
  function renderCanon() {
    const f = fitRes, fs = prepC.factors; canon = R.canonical(f);
    if (!canon.xs && canon.nature === 'lineal') { $('rcCanon').innerHTML = `<h2>Análisis canónico</h2><div class="msg info">${canon.note}</div>`; return; }
    const rad = designRadius(), ext = designExtent();
    let h = '<h2>Punto estacionario y análisis canónico</h2>';
    if (!canon.xs) h += '<div class="msg warn">La matriz B es singular (algún valor propio es cero): no hay un único punto estacionario. Existe una cresta; use el análisis de cresta o la optimización restringida.</div>';
    else {
      const pr = R.predict(f, canon.xs); const inside = canon.dist <= rad * (1 + 1e-6) && Math.max(...canon.xs.map(Math.abs)) <= ext * (1 + 1e-6);
      h += `<div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Factor</th><th>x<sub>s</sub> (codificado)</th><th>ξ<sub>s</sub> (real)</th></tr></thead><tbody>${fs.map((x, j) => `<tr><td class="l"><b>${x.letter}</b>: ${esc(x.name)}${x.unit ? ' (' + esc(x.unit) + ')' : ''}</td><td>${fmt(canon.xs[j])}</td><td><b>${fN(xiOf(j, canon.xs[j]))}</b></td></tr>`).join('')}</tbody></table></div>
      <div class="kv"><div><span>ŷ en el punto estacionario</span><b>${fmt(canon.ys)}</b></div>${f.summary.dfE > 0 ? `<div><span>IC ${Math.round((1 - cfg.C.alpha) * 100)} % (media)</span><b>${fmt(pr.ci[0], 3)} ; ${fmt(pr.ci[1], 3)}</b></div><div><span>IP ${Math.round((1 - cfg.C.alpha) * 100)} % (nueva obs.)</span><b>${fmt(pr.pi[0], 3)} ; ${fmt(pr.pi[1], 3)}</b></div>` : ''}<div><span>Distancia al centro</span><b>${fmt(canon.dist, 3)}</b> <small>radio del diseño ${fmt(rad, 3)}</small></div></div>
      <p class="mono">x<sub>s</sub> = −½ B⁻¹ b</p>`;
      if (!inside) h += `<div class="msg warn">El punto estacionario está <b>fuera de la región experimental</b>: la predicción es una extrapolación. Use el análisis de cresta para ver hacia dónde mejora la respuesta dentro de la región, o realice corridas en esa dirección.</div>`;
    }
    const nat = { max: ['ok', 'Todos los valores propios son negativos: el punto estacionario es un <b>máximo</b>.'], min: ['ok', 'Todos los valores propios son positivos: el punto estacionario es un <b>mínimo</b>.'], saddle: ['warn', 'Los valores propios tienen signos distintos: el punto estacionario es un <b>punto de silla</b> (minimax). La respuesta aumenta en unas direcciones y disminuye en otras; busque el óptimo con el análisis de cresta o la optimización restringida.'] }[canon.nature];
    h += `<div class="msg ${nat[0]}">${nat[1]}${canon.ridge ? ` Hay valor(es) propio(s) cercano(s) a cero (${canon.nearZero.map(e => fmt(e.value, 4)).join(', ')}): la superficie es casi plana en esa dirección (<b>cresta</b>); existe una familia de condiciones prácticamente equivalentes, lo que da flexibilidad para elegir por costo o facilidad de operación.` : ''}</div>`;
    h += `<h3>Forma canónica</h3><p class="mono">ŷ = ${fmt(canon.ys)} ${canon.eig.map((e, i) => `${e.value < 0 ? '−' : '+'} ${fmt(Math.abs(e.value))}·w<sub>${i + 1}</sub>²`).join(' ')}</p>
      <div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Eje canónico</th><th>λ</th>${fs.map(x => `<th>${x.letter}</th>`).join('')}</tr></thead><tbody>${canon.eig.map((e, i) => `<tr><td class="l">w<sub>${i + 1}</sub></td><td><b>${fmt(e.value)}</b></td>${e.vector.map(v => `<td>${fmt(v, 4)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">Los valores propios λ de B (diagonal: coeficientes cuadráticos; fuera de la diagonal: la mitad de las interacciones) indican cómo cambia la respuesta al alejarse del punto estacionario a lo largo de cada eje canónico w. Cada fila del vector propio da la dirección de ese eje en las variables codificadas. |λ| grande = cambio rápido.</p>`;
    $('rcCanon').innerHTML = h;
  }

  function renderRidge() {
    if (!fitRes.terms.some(t => t.type !== 'lin')) { $('rcRidge').innerHTML = ''; return; }
    const fs = prepC.factors; const Rm = designRadius();
    const dir = cfg.C.ridgeDir || 1;
    const radii = Array.from({ length: 11 }, (_, i) => +(Rm * i / 10).toFixed(6));
    const rr = R.ridge(fitRes, dir, radii);
    $('rcRidge').innerHTML = `<h2>Análisis de cresta</h2>
      <div class="inline"><label>Buscar <select id="rcRidgeDir"><option value="1">Respuesta máxima</option><option value="-1">Respuesta mínima</option></select></label></div>
      <p class="hint">Para cada distancia R al centro del diseño, condición sobre la esfera |x| = R con la respuesta ${dir > 0 ? 'máxima' : 'mínima'} estimada. Es la herramienta indicada con un punto de silla, una cresta o un punto estacionario fuera de la región.</p>
      <div class="plot-grid"><div class="table-wrap"><table class="tbl"><thead><tr><th>R</th>${fs.map(f => `<th>${esc(f.name)}</th>`).join('')}<th>ŷ</th></tr></thead><tbody>${rr.map(r => `<tr><td>${fmt(r.R, 3)}</td>${r.x.map((v, j) => `<td>${fN(xiOf(j, v))}</td>`).join('')}<td><b>${fmt(r.y, 3)}</b></td></tr>`).join('')}</tbody></table></div>
      <div>${P.chart({ title: 'Respuesta estimada sobre la cresta', xlabel: 'Distancia R (codificada)', ylabel: 'ŷ', series: [{ type: 'line', x: rr.map(r => r.R), y: rr.map(r => r.y), color: 'var(--accent)', marker: true, r: 3 }] })}</div></div>`;
    $('rcRidgeDir').value = String(dir);
    $('rcRidgeDir').onchange = () => { cfg.C.ridgeDir = +$('rcRidgeDir').value; persist(); renderRidge(); };
  }

  let optPt = null;
  function renderOpt() {
    const fs = prepC.factors; const ext = designExtent(), rad = designRadius();
    const o = cfg.C.opt || (cfg.C.opt = { goal: 'max', target: '', region: 'sphere' });
    $('rcOpt').innerHTML = `<h2>Optimización y predicción</h2>
      <div class="grid4">
        <label>Objetivo <select id="rcGoal"><option value="max">Maximizar</option><option value="min">Minimizar</option><option value="target">Alcanzar un valor meta</option></select></label>
        <label id="rcTargetW">Valor meta <input id="rcTarget" type="number" step="any"></label>
        <label>Región <select id="rcRegion"><option value="sphere">Esfera del diseño (|x| ≤ ${fmt(rad, 3)})</option><option value="cube">Cubo de los niveles extremos (|xᵢ| ≤ ${fmt(ext, 3)})</option><option value="cube1">Cubo factorial (|xᵢ| ≤ 1)</option></select></label>
      </div>
      <div class="actions"><button id="rcOptBtn" class="primary">Buscar</button></div>
      <div id="rcOptRes"></div>
      <h3>Predicción en un punto</h3>
      <div class="grid4">${fs.map((f, j) => `<label>${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}<input type="number" step="any" data-j="${j}" class="rcPredIn" value="${fN(f.center)}"></label>`).join('')}</div>
      <div class="actions"><button id="rcPredBtn">Predecir</button></div><div id="rcPredRes"></div>`;
    $('rcGoal').value = o.goal; $('rcTarget').value = o.target; $('rcRegion').value = o.region; $('rcTargetW').hidden = o.goal !== 'target';
    $('rcGoal').onchange = () => { o.goal = $('rcGoal').value; $('rcTargetW').hidden = o.goal !== 'target'; persist(); };
    $('rcTarget').onchange = () => { o.target = $('rcTarget').value; persist(); };
    $('rcRegion').onchange = () => { o.region = $('rcRegion').value; persist(); };
    $('rcOptBtn').onclick = () => {
      if (o.goal === 'target' && !isFinite(num(o.target))) { $('rcOptRes').innerHTML = '<div class="msg warn">Indique el valor meta.</div>'; return; }
      const region = o.region === 'sphere' ? 'sphere' : 'cube', r = o.region === 'sphere' ? rad : o.region === 'cube' ? ext : 1;
      const res = R.optimize(fitRes, o.goal, num(o.target), region, r); optPt = res.x; const pr = R.predict(fitRes, res.x);
      $('rcOptRes').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th class="l">Factor</th><th>x (codificado)</th><th>Valor real</th></tr></thead><tbody>${fs.map((f, j) => `<tr><td class="l">${esc(f.name)}${f.unit ? ' (' + esc(f.unit) + ')' : ''}</td><td>${fmt(res.x[j], 3)}</td><td><b>${fN(xiOf(j, res.x[j]))}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="kv"><div><span>ŷ</span><b>${fmt(pr.yhat)}</b></div>${fitRes.summary.dfE > 0 ? `<div><span>IC ${Math.round((1 - cfg.C.alpha) * 100)} %</span><b>${fmt(pr.ci[0], 3)} ; ${fmt(pr.ci[1], 3)}</b></div><div><span>IP ${Math.round((1 - cfg.C.alpha) * 100)} %</span><b>${fmt(pr.pi[0], 3)} ; ${fmt(pr.pi[1], 3)}</b></div>` : ''}</div>
        <p class="hint">Búsqueda en malla con refinamiento local sobre el modelo ajustado, restringida a la región elegida. Confirme la condición con corridas experimentales; el IP indica el intervalo esperado para una corrida individual. Con varias respuestas use la pestaña 7 · Deseabilidad.</p>`;
      drawContour();
    };
    $('rcPredBtn').onclick = () => {
      const x = [...document.querySelectorAll('.rcPredIn')].map(i => { const j = +i.dataset.j; return (num(i.value) - fs[j].center) / fs[j].half; });
      if (x.some(v => !isFinite(v))) { $('rcPredRes').innerHTML = '<div class="msg warn">Complete todos los valores.</div>'; return; }
      const pr = R.predict(fitRes, x); const out = Math.sqrt(S.dot(x, x)) > rad * (1 + 1e-6);
      $('rcPredRes').innerHTML = `<div class="kv"><div><span>ŷ</span><b>${fmt(pr.yhat)}</b></div>${fitRes.summary.dfE > 0 ? `<div><span>EE del ajuste</span><b>${fmt(pr.se)}</b></div><div><span>IC ${Math.round((1 - cfg.C.alpha) * 100)} %</span><b>${fmt(pr.ci[0], 3)} ; ${fmt(pr.ci[1], 3)}</b></div><div><span>IP ${Math.round((1 - cfg.C.alpha) * 100)} %</span><b>${fmt(pr.pi[0], 3)} ; ${fmt(pr.pi[1], 3)}</b></div>` : ''}</div>${out ? '<div class="msg warn">El punto está fuera de la región del diseño: extrapolación.</div>' : ''}`;
    };
  }

  /* -------- gráficas */
  function surface3d({ fz, dom, az, el, xlabel, ylabel, zlabel, title }) {
    const N = 25, W = 560, H = 440; const lo = dom[0], hi = dom[1];
    const Z = []; let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < N; i++) { Z.push([]); for (let j = 0; j < N; j++) { const z = fz(lo + (hi - lo) * j / (N - 1), lo + (hi - lo) * i / (N - 1)); Z[i].push(z); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); } }
    const zr = zmax - zmin || 1; const ca = Math.cos(az), sa = Math.sin(az), ce = Math.cos(el), se = Math.sin(el);
    const proj = (u, v, z) => { const X = u * ca - v * sa, Y = u * sa + v * ca; return { sx: X, sy: z * ce + Y * se, d: -Y * ce + z * se }; };
    const P3 = (j, i, z) => proj(-1 + 2 * j / (N - 1), -1 + 2 * i / (N - 1), -0.75 + 1.5 * (z - zmin) / zr);
    const quads = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
      const ps = [P3(j, i, Z[i][j]), P3(j + 1, i, Z[i][j + 1]), P3(j + 1, i + 1, Z[i + 1][j + 1]), P3(j, i + 1, Z[i + 1][j])];
      quads.push({ ps, d: ps.reduce((s, p) => s + p.d, 0) / 4, t: ((Z[i][j] + Z[i][j + 1] + Z[i + 1][j + 1] + Z[i + 1][j]) / 4 - zmin) / zr });
    }
    quads.sort((a, b) => a.d - b.d);
    const sc = 155, cx = W / 2, cy = H / 2 + 20; const X = p => (cx + sc * p.sx).toFixed(1), Y = p => (cy - sc * p.sy).toFixed(1);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title)}"><text x="${W / 2}" y="20" class="pt-title" text-anchor="middle">${esc(title)}</text>`;
    const base = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => proj(u, v, -0.75));
    s += `<path d="M${base.map(p => X(p) + ',' + Y(p)).join('L')}Z" fill="none" class="pt-frame-line" stroke-dasharray="3 3"/>`;
    quads.forEach(q => { s += `<path d="M${q.ps.map(p => X(p) + ',' + Y(p)).join('L')}Z" fill="${P.color(q.t)}" stroke="rgba(0,0,0,.25)" stroke-width=".5"/>`; });
    const lab = (u, v, txt) => { const p = proj(u, v, -0.75); return `<text x="${X(p)}" y="${(+Y(p) + 16).toFixed(1)}" text-anchor="middle" class="pt-axis">${esc(txt)}</text>`; };
    s += lab(0, -1.25, xlabel) + lab(-1.25, 0, ylabel);
    s += `<text x="18" y="${H - 12}" class="pt-tick">${esc(zlabel)}: ${fN(zmin)} a ${fN(zmax)}</text></svg>`;
    return s;
  }
  function renderPlots() {
    const fs = prepC.factors, k = prepC.k; const c = cfg.C.plot || (cfg.C.plot = { x: 0, y: 1, az: 35, el: 30, hold: {} });
    if (c.x >= k) c.x = 0; if (c.y >= k || c.y === c.x) c.y = c.x === 0 ? 1 : 0;
    const opt = j => fs.map((f, i) => `<option value="${i}" ${i === j ? 'selected' : ''}>${f.letter}: ${esc(f.name)}</option>`).join('');
    $('rcPlots').innerHTML = `<h2>Superficie de respuesta</h2>
      <div class="inline"><label>Eje X <select id="rcPX">${opt(c.x)}</select></label><label>Eje Y <select id="rcPY">${opt(c.y)}</select></label></div>
      <div id="rcHold" class="holds"></div>
      <div class="plot-grid"><div id="rcContour"></div><div><div id="rcSurf"></div>
        <div class="inline"><label>Giro <input type="range" id="rcAz" min="0" max="360" value="${c.az}"></label><label>Elevación <input type="range" id="rcEl" min="5" max="85" value="${c.el}"></label></div></div></div>
      <p class="hint">Contorno: ○ corridas del diseño (proyectadas), ★ punto estacionario, ◆ óptimo de la última búsqueda. Los demás factores se mantienen en los valores elegidos (codificados).</p>`;
    $('rcPX').onchange = () => { c.x = +$('rcPX').value; if (c.y === c.x) c.y = (c.x + 1) % k; persist(); renderPlots(); };
    $('rcPY').onchange = () => { c.y = +$('rcPY').value; if (c.y === c.x) c.x = (c.y + 1) % k; persist(); renderPlots(); };
    $('rcAz').oninput = () => { c.az = +$('rcAz').value; drawSurf(); };
    $('rcEl').oninput = () => { c.el = +$('rcEl').value; drawSurf(); };
    $('rcAz').onchange = $('rcEl').onchange = persist;
    const others = fs.map((_, j) => j).filter(j => j !== c.x && j !== c.y);
    const ext = designExtent();
    $('rcHold').innerHTML = others.map(j => { const v = c.hold[j] != null ? c.hold[j] : (canon && canon.xs && Math.abs(canon.xs[j]) <= ext ? +canon.xs[j].toFixed(3) : 0); c.hold[j] = v; return `<label>${fs[j].letter}: ${esc(fs[j].name)} (x) <input type="number" step="0.1" min="${-ext}" max="${ext}" data-j="${j}" value="${v}"><small>= ${fN(xiOf(j, v))}${fs[j].unit ? ' ' + esc(fs[j].unit) : ''}</small></label>`; }).join('');
    $('rcHold').querySelectorAll('input').forEach(i => i.addEventListener('change', () => { c.hold[+i.dataset.j] = +i.value || 0; persist(); renderPlots(); }));
    drawContour(); drawSurf();
  }
  function pointAt(x, y) { const c = cfg.C.plot; const p = new Array(prepC.k).fill(0); Object.keys(c.hold).forEach(j => { if (+j < prepC.k) p[+j] = c.hold[j]; }); p[c.x] = x; p[c.y] = y; return p; }
  function drawContour() {
    if (!$('rcContour')) return; const c = cfg.C.plot, fs = prepC.factors; const e = designExtent();
    const fx = fs[c.x], fy = fs[c.y];
    $('rcContour').innerHTML = P.contour({ title: `Contorno de ${prepC.respName}`, xlabel: `${fx.letter}: ${fx.name}${fx.unit ? ' (' + fx.unit + ')' : ''}`, ylabel: `${fy.letter}: ${fy.name}${fy.unit ? ' (' + fy.unit + ')' : ''}`, dom: [-e, e], nGrid: 45,
      xr: v => xiOf(c.x, v), yr: v => xiOf(c.y, v), fz: (x, y) => R.predictFast(fitRes, pointAt(x, y)),
      overlay: (sx, sy) => {
        let s = ''; const seen = new Set();
        prepC.X.forEach(x => { const key = x[c.x].toFixed(4) + ',' + x[c.y].toFixed(4); if (seen.has(key)) return; seen.add(key); s += `<circle cx="${sx(x[c.x]).toFixed(1)}" cy="${sy(x[c.y]).toFixed(1)}" r="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="${sx(x[c.x]).toFixed(1)}" cy="${sy(x[c.y]).toFixed(1)}" r="4" fill="none" stroke="#000" stroke-opacity=".5" stroke-width=".6"/>`; });
        if (canon && canon.xs && Math.abs(canon.xs[c.x]) <= e && Math.abs(canon.xs[c.y]) <= e) s += `<text x="${sx(canon.xs[c.x]).toFixed(1)}" y="${(sy(canon.xs[c.y]) + 6).toFixed(1)}" text-anchor="middle" font-size="18" fill="#fff" stroke="#000" stroke-width=".8">★</text>`;
        if (optPt && Math.abs(optPt[c.x]) <= e && Math.abs(optPt[c.y]) <= e) s += `<text x="${sx(optPt[c.x]).toFixed(1)}" y="${(sy(optPt[c.y]) + 5).toFixed(1)}" text-anchor="middle" font-size="15" fill="#ff4d6d" stroke="#fff" stroke-width=".8">◆</text>`;
        return s;
      } });
  }
  function drawSurf() {
    const c = cfg.C.plot, fs = prepC.factors; const e = designExtent();
    $('rcSurf').innerHTML = surface3d({ title: `Superficie de ${prepC.respName}`, dom: [-e, e], az: c.az * Math.PI / 180, el: c.el * Math.PI / 180, xlabel: fs[c.x].name, ylabel: fs[c.y].name, zlabel: prepC.respName, fz: (x, y) => R.predictFast(fitRes, pointAt(x, y)) });
  }
  function renderDiag() {
    const f = fitRes, n = f.resid.length; if (f.summary.dfE <= 0) { $('rcDiag').innerHTML = ''; return; }
    const sr = f.resid.map((e, i) => e / Math.sqrt(f.summary.mse * (1 - f.lev[i])));
    const ord = sr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const q = ord.map((_, i) => S.norminv((i + 1 - 0.375) / (n + 0.25)));
    const sw = S.shapiroWilk(f.resid);
    const big = sr.map((v, i) => [v, i]).filter(p => Math.abs(p[0]) > 3);
    $('rcDiag').innerHTML = `<h2>Residuales</h2>
      <p class="hint">Shapiro-Wilk: ${sw ? `W = ${fmt(sw.W, 4)}, p = ${fmtP(sw.p)}${sw.p <= cfg.C.alpha ? ' — <b>se rechaza la normalidad</b>' : ' — sin evidencia contra la normalidad'}` : 'no disponible'}. ${big.length ? `Residuales estandarizados mayores que 3 en las observaciones ${big.map(p => p[1] + 1).join(', ')}.` : 'Ningún residual estandarizado supera |3|.'} Para el diagnóstico completo (Levene, Breusch-Pagan, Durbin-Watson, Box-Cox) cargue los mismos datos en la pestaña 2 · Datos.</p>
      <div class="plot-grid">
        <div>${P.chart({ title: 'Probabilidad normal', xlabel: 'Residual estandarizado', ylabel: 'Cuantil normal', series: [{ type: 'points', x: ord.map(p => p[0]), y: q, color: 'var(--accent)', r: 3.5 }], lines: [{ x1: -2.5, y1: -2.5, x2: 2.5, y2: 2.5, color: 'var(--muted)', dash: '4 3', noScale: true }] })}</div>
        <div>${P.chart({ title: 'Residuales contra ajustados', xlabel: 'Valor ajustado', ylabel: 'Residual estandarizado', series: [{ type: 'points', x: f.fitted, y: sr, color: 'var(--accent)', r: 3.5 }], lines: [{ x1: Math.min(...f.fitted), y1: 0, x2: Math.max(...f.fitted), y2: 0, color: 'var(--muted)', dash: '4 3' }] })}</div>
      </div>
      <div class="actions"><button id="rcCSV" class="ghost">Exportar resultados (CSV)</button></div>`;
    $('rcCSV').onclick = exportC;
  }
  function exportC() {
    const f = fitRes, fs = prepC.factors, L2 = [];
    L2.push(['RESPUESTA', prepC.respName]); L2.push(['FACTOR', 'NOMBRE', 'CENTRO', 'SEMIRRANGO', 'UNIDAD']); fs.forEach(x => L2.push([x.letter, x.name, x.center, x.half, x.unit]));
    L2.push([]); L2.push(['RESUMEN', 'S', f.summary.s, 'R2', f.summary.r2, 'R2aj', f.summary.r2adj, 'R2pred', f.summary.r2pred, 'PRESS', f.summary.press]);
    L2.push([]); L2.push(['Termino', 'Coef', 'EE', 't', 'p', 'IC_inf', 'IC_sup', 'FIV']); f.coefs.forEach(c => L2.push([c.name, c.coef, c.se, c.t, c.p, c.lo, c.hi, c.kind === 'int' ? '' : c.vif]));
    L2.push([]); L2.push(['Fuente', 'gl', 'SC', 'CM', 'F', 'p']); f.anova.forEach(r => L2.push([r.source, r.df, r.ss, r.ms == null ? '' : r.ms, r.F == null ? '' : r.F, r.p == null ? '' : r.p]));
    if (canon && canon.xs) { L2.push([]); L2.push(['PUNTO ESTACIONARIO', ...fs.map(x => x.name), 'yhat']); L2.push(['codificado', ...canon.xs, canon.ys]); L2.push(['real', ...canon.xs.map((v, j) => xiOf(j, v)), '']); L2.push(['Naturaleza', canon.nature]); L2.push(['Eje', 'lambda', ...fs.map(x => x.letter)]); canon.eig.forEach((e, i) => L2.push(['w' + (i + 1), e.value, ...e.vector])); }
    L2.push([]); L2.push(['Obs', 'y', 'ajustado', 'residual', 'h']); f.resid.forEach((e, i) => L2.push([i + 1, prepC.y[i], f.fitted[i], e, f.lev[i]]));
    download('superficie_respuesta.csv', L2.map(csvLine).join('\r\n'));
  }

  /* ================================================================ conexión con DOE 2^k */
  window.GRsmUpdate = function (state) { app = state; if ($('saSrc')) refreshA(); };
  build();
})();
