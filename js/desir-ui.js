/* desir-ui.js — Pestaña de deseabilidad (optimización de varias respuestas) */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const A = Analysis, D = Design, Ds = Desir;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = s => { if (s == null) return NaN; const t = String(s).trim().replace(/\s/g, ''); if (t === '') return NaN; const v = Number(t.replace(/,(?=\d+$)/, '.')); return isFinite(v) ? v : NaN; };
  const numFactor = s => { if (s == null) return NaN; const t = String(s).trim().replace(/\s/g, '').replace(/^[−–]/, '-'); if (t === '+') return 1; if (t === '-') return -1; return num(t); };
  const f4 = v => (v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1e5 ? v.toExponential(3) : +v.toFixed(4));
  const f3 = v => (v == null || !isFinite(v) ? '—' : v.toFixed(3));
  const STORE = 'doe2k-desir';
  let st = null;            // estado de la aplicación principal
  let cfg = { sel: null, specs: {}, region: null };
  let last = null;          // últimos resultados (para exportar y explicar)
  try { cfg = Object.assign(cfg, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* sin almacenamiento */ }
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch (e) { /* sin almacenamiento */ } };

  /** Columnas numéricas que pueden ser respuestas (no son factores, bloque ni orden) */
  function candidates() {
    const ds = st.dataset, m = st.mapping; if (!ds || !m) return [];
    const skip = new Set([...m.fj, m.jb, m.jr]);
    return ds.headers.map((h, j) => j).filter(j => !skip.has(j) && ds.rows.filter(r => isFinite(num(r[j]))).length >= 3 && ds.rows.every(r => r[j] === '' || r[j] == null || isFinite(num(r[j]))));
  }
  /** Factores codificados de cada fila del conjunto de datos, con la codificación de Análisis */
  function codedRow(r) {
    return st.prep.factors.map((f, i) => {
      const v = r[st.mapping.fj[i]];
      if (f.numeric) { const x = numFactor(v); return isFinite(x) ? Math.round((x - f.center) / f.half * 1e9) / 1e9 : NaN; }
      return v === f.low ? -1 : v === f.high ? 1 : NaN;
    });
  }
  const realOf = (f, x) => (f.numeric ? +(f.center + f.half * x).toPrecision(6) : (x <= -1 ? f.low : x >= 1 ? f.high : '—'));

  function specFor(name, ys) {
    if (cfg.specs[name]) return cfg.specs[name];
    const pre = st.dataset.desir && st.dataset.desir[name];
    const sp = pre ? Object.assign({ s: 1, t: 1, w: 1, model: 'all' }, pre) : Object.assign(Ds.defaults('max', ys), { model: 'all' });
    cfg.specs[name] = sp; return sp;
  }

  function build() {
    if (!st || !st.prep || !st.dataset || !st.mapping) { $('dsEmpty').hidden = false; $('dsBody').hidden = true; return; }
    $('dsEmpty').hidden = true; $('dsBody').hidden = false;
    const ds = st.dataset; const cand = candidates();
    if (!cfg.sel || !cfg.sel.every(n => ds.headers.includes(n))) cfg.sel = cand.slice(0, 6).map(j => ds.headers[j]);
    $('dsResp').innerHTML = cand.length < 2
      ? '<div class="msg warn">Se necesitan al menos dos columnas numéricas de respuesta en los datos (además de los factores).</div>'
      : cand.map(j => { const h = ds.headers[j]; return `<label class="${cfg.sel.includes(h) ? 'on' : ''}"><input type="checkbox" value="${esc(h)}" ${cfg.sel.includes(h) ? 'checked' : ''}>${esc(h)}</label>`; }).join('');
    $('dsResp').querySelectorAll('input').forEach(c => c.addEventListener('change', () => {
      cfg.sel = [...$('dsResp').querySelectorAll('input:checked')].map(i => i.value); persist(); build();
    }));
    renderSpecs();
    const nCenter = st.prep.nCenter;
    const reg = $('dsRegion'); const k = st.prep.k;
    reg.querySelector('option[value="grid11"]').disabled = Math.pow(11, k) > 250000;
    if (!cfg.region) cfg.region = nCenter ? 'design' : 'grid5';
    reg.value = cfg.region;
    $('dsObs').innerHTML = ''; $('dsMod').innerHTML = ''; $('dsExplain').innerHTML = ''; $('dsMsg').innerHTML = '';
  }

  function renderSpecs() {
    const ds = st.dataset; const sel = cfg.sel.filter(h => ds.headers.includes(h));
    const analyzed = ds.headers[st.mapping.jy];
    const rows = sel.map(h => {
      const j = ds.headers.indexOf(h); const ys = ds.rows.map(r => num(r[j])).filter(isFinite);
      const sp = specFor(h, ys); if (sp.model === 'cur' && h !== analyzed) sp.model = 'all';
      const g = sp.goal; const v = x => (typeof x === 'number' && isFinite(x) ? x : '');
      const dis = (cond) => (cond ? 'disabled' : '');
      return `<tr data-h="${esc(h)}"><td><b>${esc(h)}</b><div class="hint">obs.: ${f4(Math.min(...ys))} – ${f4(Math.max(...ys))}</div></td>
        <td><select data-k="goal">${Object.entries(Ds.GOALS).map(([k2, t]) => `<option value="${k2}" ${k2 === g ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input type="number" step="any" data-k="L" value="${v(sp.L)}" ${dis(g === 'min')}></td>
        <td><input type="number" step="any" data-k="T" value="${v(sp.T)}"></td>
        <td><input type="number" step="any" data-k="U" value="${v(sp.U)}" ${dis(g === 'max')}></td>
        <td><input type="number" step="0.1" min="0.1" data-k="s" value="${sp.s}" ${dis(g === 'min')}></td>
        <td><input type="number" step="0.1" min="0.1" data-k="t" value="${sp.t}" ${dis(g === 'max')}></td>
        <td><input type="number" step="1" min="1" max="5" data-k="w" value="${sp.w}"></td>
        <td><select data-k="model">
          ${h === analyzed ? `<option value="cur" ${sp.model === 'cur' ? 'selected' : ''}>Igual que en Análisis</option>` : ''}
          <option value="all" ${sp.model === 'all' ? 'selected' : ''}>Todos los efectos estimables</option>
          <option value="2" ${sp.model === '2' ? 'selected' : ''}>Hasta interacciones dobles</option>
          <option value="1" ${sp.model === '1' ? 'selected' : ''}>Solo efectos principales</option>
          <option value="reduce" ${sp.model === 'reduce' ? 'selected' : ''}>Reducido (p &gt; α, jerárquico)</option></select></td></tr>`;
    }).join('');
    $('dsSpec').innerHTML = `<thead><tr><th>Respuesta</th><th>Objetivo</th><th>L (mínimo aceptable)</th><th>T (ideal)</th><th>U (máximo aceptable)</th><th>Exp. s (lado inferior)</th><th>Exp. t (lado superior)</th><th>Importancia (1–5)</th><th>Modelo para la búsqueda</th></tr></thead><tbody>${rows}</tbody>`;
    $('dsSpec').querySelectorAll('select, input').forEach(el => el.addEventListener('change', () => {
      const h = el.closest('tr').dataset.h; const sp = cfg.specs[h]; const k2 = el.dataset.k;
      if (k2 === 'goal' || k2 === 'model') {
        sp[k2] = el.value;
        if (k2 === 'goal') { const j = ds.headers.indexOf(h); Object.assign(sp, Ds.defaults(el.value, ds.rows.map(r => num(r[j])).filter(isFinite)), { model: sp.model, w: sp.w }); }
        persist(); renderSpecs(); return;
      }
      sp[k2] = el.value === '' ? NaN : +el.value; persist();
    }));
  }

  /** Ajusta el modelo de una respuesta con las opciones de Análisis */
  function fitResponse(h, sp) {
    const ds = st.dataset; const j = ds.headers.indexOf(h); const m = st.mapping;
    const rows = ds.rows.filter(r => isFinite(num(r[j])));
    const X = rows.map(codedRow); if (X.some(x => x.some(v => !isFinite(v)))) throw new Error(`Hay niveles de factor no reconocidos en las filas de ${h}.`);
    const R = X.map(x => x.map((v, i) => { const f = st.prep.factors[i]; return f.numeric ? f.center + f.half * v : v; }));
    const y = rows.map(r => num(r[j]));
    const block = m.jb >= 0 ? rows.map(r => String(r[m.jb]).trim()) : null;
    const prep = A.prepare({ X, R, y, yRaw: y, block, runOrder: rows.map((_, t) => t + 1) });
    const opts = Object.assign({}, st.opts);
    const est = A.estimability(prep, opts).estimable;
    let terms;
    if (sp.model === 'cur') terms = st.terms.filter(w => est.includes(w));
    else if (sp.model === '1') terms = est.filter(w => D.order(w) === 1);
    else if (sp.model === '2') terms = est.filter(w => D.order(w) <= 2);
    else if (sp.model === 'reduce') {
      let start = est.filter(w => D.order(w) <= 2);
      if (A.fit(prep, start, opts).summary.dfE <= 0) start = est.filter(w => D.order(w) === 1);
      terms = A.reduce(prep, start, opts).terms;
    } else terms = est.slice();
    const fit = A.fit(prep, terms, opts);
    const curv = fit.coefs.find(c => c.kind === 'curv');
    return { h, prep, fit, terms, curvP: curv ? curv.p : NaN, X, y };
  }

  function compute() {
    const msgs = []; $('dsMsg').innerHTML = '';
    const ds = st.dataset; const sel = cfg.sel.filter(h => ds.headers.includes(h));
    if (sel.length < 2) { $('dsMsg').innerHTML = '<div class="msg warn">Seleccione al menos dos respuestas.</div>'; return; }
    const specs = sel.map(h => cfg.specs[h]);
    const bad = sel.map((h, i) => [h, Ds.check(specs[i])]).filter(x => x[1]);
    if (bad.length) { $('dsMsg').innerHTML = `<div class="msg err">Revise las especificaciones: ${bad.map(([h, e]) => `<b>${esc(h)}</b>: ${e}`).join('; ')}.</div>`; return; }
    const ws = specs.map(s => s.w); const fac = st.prep.factors; const a = st.opts.alpha;

    /* ---- A. medias observadas por combinación de factores ---- */
    const groups = new Map();
    ds.rows.forEach(r => {
      const x = codedRow(r); if (x.some(v => !isFinite(v))) return;
      const key = x.map(v => Math.round(v * 1e6) / 1e6).join('|');
      if (!groups.has(key)) groups.set(key, { x, vals: sel.map(() => []) });
      sel.forEach((h, i) => { const v = num(r[ds.headers.indexOf(h)]); if (isFinite(v)) groups.get(key).vals[i].push(v); });
    });
    const obs = [...groups.values()].map(g => {
      const means = g.vals.map(v => (v.length ? v.reduce((p, c) => p + c, 0) / v.length : NaN));
      const n = Math.max(...g.vals.map(v => v.length));
      const dd = means.map((y, i) => Ds.d(y, specs[i]));
      return { x: g.x, n, means, d: dd, D: Ds.D(dd, ws), center: g.x.every(v => Math.abs(v) < 1e-9) };
    }).filter(o => o.means.every(isFinite)).sort((p, q) => q.D - p.D);
    const head = fac.map(f => `<th>${f.letter}: ${esc(f.name)}</th>`).join('');
    const okAll = obs.filter(o => o.D > 0).length;
    $('dsObs').innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th>${head}<th>n</th>${sel.map(h => `<th>${esc(h)} (media)</th>`).join('')}${sel.map(h => `<th>d(${esc(h)})</th>`).join('')}<th>D</th><th></th></tr></thead><tbody>${obs.map((o, i) => `<tr${i === 0 && o.D > 0 ? ' class="hl"' : ''}><td>${i + 1}</td>${o.x.map((v, j) => `<td>${esc(realOf(fac[j], v))}${o.center && j === 0 ? ' <span class="pill">centro</span>' : ''}</td>`).join('')}<td>${o.n}</td>${o.means.map(f4).map(v => `<td>${v}</td>`).join('')}${o.d.map(v => `<td>${f3(v)}</td>`).join('')}<td><b>${f3(o.D)}</b></td><td><button class="ghost sm" data-ex="${i}">Ver cálculo</button></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">${okAll} de ${obs.length} condiciones cumplen todas las especificaciones (D &gt; 0). Las medias de condiciones con réplicas o puntos centrales se calculan con todas sus observaciones.</p>`;
    $('dsObs').querySelectorAll('[data-ex]').forEach(b => b.addEventListener('click', () => explain(obs[+b.dataset.ex], 'observada')));

    /* ---- B. búsqueda con los modelos ajustados ---- */
    let fits;
    try { fits = sel.map((h, i) => fitResponse(h, specs[i])); } catch (e) { $('dsMod').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; last = { sel, specs, obs, mod: [] }; return; }
    const curvSig = fits.filter(f => isFinite(f.curvP) && f.curvP < a);
    const sat = fits.filter(f => f.fit.summary.dfE <= 0);
    const k = st.prep.k; const region = $('dsRegion').value; cfg.region = region; persist();
    let pts = [];
    if (region === 'design') pts = obs.map(o => o.x);
    else {
      const lv = { corners: [-1, 1], cc: [-1, 1], grid3: [-1, 0, 1], grid5: [-1, -0.5, 0, 0.5, 1], grid11: [...Array(11)].map((_, i) => -1 + i * 0.2) }[region];
      const total = Math.pow(lv.length, k);
      for (let idx = 0; idx < total; idx++) { let t = idx; const x = []; for (let j = 0; j < k; j++) { x.push(Math.round(lv[t % lv.length] * 1e9) / 1e9); t = Math.floor(t / lv.length); } pts.push(x); }
      if (region === 'cc') pts.push(new Array(k).fill(0));
    }
    let res = pts.map(x => {
      const yh = fits.map(f => A.predictFast(f.fit, x)); const dd = yh.map((y, i) => Ds.d(y, specs[i]));
      return { x, means: yh, d: dd, D: Ds.D(dd, ws), center: x.every(v => Math.abs(v) < 1e-9) };
    }).sort((p, q) => q.D - p.D);
    const nPos = res.filter(r => r.D > 0).length; res = res.slice(0, 15);
    if (curvSig.length) msgs.push(['warn', `La curvatura es significativa (α = ${a}) en ${curvSig.map(f => `<b>${esc(f.h)}</b> (p = ${f4(f.curvP)})`).join(', ')}. El modelo de primer orden no describe el interior de la región: base la decisión en las condiciones observadas (tabla A) o en la región “Puntos del diseño”, y planee un diseño de superficie de respuesta.`]);
    else if (st.prep.nCenter === 0) msgs.push(['info', 'Sin puntos centrales no puede comprobarse si hay curvatura: las predicciones en puntos interiores suponen que la superficie es plana.']);
    if (sat.length) msgs.push(['warn', `Modelo saturado para ${sat.map(f => esc(f.h)).join(', ')}: reproduce exactamente los datos y no tiene error estimado. Considere un modelo reducido.`]);
    if (st.mapping.tr && st.mapping.tr !== 'none') msgs.push(['info', 'La deseabilidad usa la escala original de cada respuesta; la transformación elegida en Datos no se aplica aquí.']);
    const fitInfo = fits.map(f => `<li><b>${esc(f.h)}</b>: ${f.fit.terms.filter(w => !f.fit.dropped.includes(w)).map(D.wname).join(', ') || 'solo la media'}${f.fit.coefs.some(c => c.kind === 'curv') ? ' + curvatura' : ''}; R² = ${f3(f.fit.summary.r2)}, gl error = ${f.fit.summary.dfE}</li>`).join('');
    $('dsMod').innerHTML = msgs.map(([t, h]) => `<div class="msg ${t}">${h}</div>`).join('') +
      `<p class="lbl">Modelos usados</p><ul class="hint">${fitInfo}</ul>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th>${head}${sel.map(h => `<th>ŷ ${esc(h)}</th>`).join('')}${sel.map(h => `<th>d(${esc(h)})</th>`).join('')}<th>D</th><th></th></tr></thead><tbody>${res.map((o, i) => `<tr${i === 0 && o.D > 0 ? ' class="hl"' : ''}><td>${i + 1}</td>${o.x.map((v, j) => `<td>${esc(realOf(fac[j], v))} <span class="alias">(${+v.toFixed(2)})</span></td>`).join('')}${o.means.map(v => `<td>${f4(v)}</td>`).join('')}${o.d.map(v => `<td>${f3(v)}</td>`).join('')}<td><b>${f3(o.D)}</b></td><td><button class="ghost sm" data-exm="${i}">Ver cálculo</button></td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Se evaluaron ${pts.length.toLocaleString('es-MX')} combinaciones; ${nPos.toLocaleString('es-MX')} tienen D &gt; 0. Se muestran las 15 mejores. ${fits.some(f => f.fit.coefs.some(c => c.kind === 'curv')) ? 'El término de curvatura sólo actúa en el punto central exacto.' : ''}</p>`;
    $('dsMod').querySelectorAll('[data-exm]').forEach(b => b.addEventListener('click', () => explain(res[+b.dataset.exm], 'predicha')));
    last = { sel, specs, obs, mod: res, fac };
    if (obs.length) explain(obs[0], 'observada');
  }

  function explain(o, kind) {
    if (!o || !last) return; const { sel, specs, fac } = last; const ws = specs.map(s => s.w);
    $('dsExplain').innerHTML = `<h3>Cálculo detallado — ${fac.map((f, j) => `${esc(f.name)} = ${esc(realOf(f, o.x[j]))}`).join(', ')} (respuesta ${kind})</h3>
      <ul class="mono">${sel.map((h, i) => `<li><b>${esc(h)}</b> (${Ds.GOALS[specs[i].goal].toLowerCase()}${specs[i].goal !== 'min' ? `, L = ${specs[i].L}` : ''}, T = ${specs[i].T}${specs[i].goal !== 'max' ? `, U = ${specs[i].U}` : ''}): ${esc(Ds.explain(o.means[i], specs[i]))}</li>`).join('')}
      <li><b>Global:</b> ${esc(Ds.explainD(o.d, ws))}</li></ul>`;
  }

  function exportCSV() {
    if (!last) { alert('Primero calcule la deseabilidad.'); return; }
    const { sel, specs, obs, mod } = last; const fac = st.prep.factors; const L = [];
    const cell = v => { v = typeof v === 'number' ? (isFinite(v) ? String(+v.toPrecision(10)) : '') : String(v == null ? '' : v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
    L.push(['ESPECIFICACIONES']); L.push(['Respuesta', 'Objetivo', 'L', 'T', 'U', 's', 't', 'Importancia']);
    sel.forEach((h, i) => { const s = specs[i]; L.push([h, Ds.GOALS[s.goal], s.L, s.T, s.U, s.s, s.t, s.w]); });
    const hdr = pre => [...fac.map(f => f.name), ...(pre ? ['n'] : []), ...sel.map(h => (pre ? 'media ' : 'pred ') + h), ...sel.map(h => 'd ' + h), 'D'];
    L.push([]); L.push(['A. CONDICIONES OBSERVADAS']); L.push(hdr(true));
    obs.forEach(o => L.push([...o.x.map((v, j) => realOf(fac[j], v)), o.n, ...o.means, ...o.d, o.D]));
    L.push([]); L.push(['B. BUSQUEDA CON MODELOS']); L.push(hdr(false));
    mod.forEach(o => L.push([...o.x.map((v, j) => realOf(fac[j], v)), ...o.means, ...o.d, o.D]));
    const blob = new Blob(['﻿' + L.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'deseabilidad_doe2k.csv'; document.body.appendChild(el); el.click();
    setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 500);
  }

  $('btnDesir').addEventListener('click', () => { try { compute(); } catch (e) { $('dsMsg').innerHTML = `<div class="msg err">${esc(e.message)}</div>`; } });
  $('btnDesirCSV').addEventListener('click', exportCSV);
  $('dsRegion').addEventListener('change', () => { cfg.region = $('dsRegion').value; persist(); if (last) compute(); });

  /** Llamada desde app.js cada vez que cambia el análisis */
  window.GDesirUpdate = function (state) {
    const newData = !st || st.dataset !== state.dataset;
    const changed = newData || st.prep !== state.prep;
    st = state;
    if (newData && state.dataset) {
      const ds = state.dataset; const key = ds.headers.join('|') + '#' + ds.rows.length + '#' + (ds.rows[0] || []).join('|');
      if (cfg.dataKey !== key) {
        cfg.dataKey = key; cfg.sel = null; cfg.region = null;
        if (ds.desir) Object.entries(ds.desir).forEach(([h, sp]) => { cfg.specs[h] = Object.assign({ s: 1, t: 1, w: 1, model: 'all' }, sp); });
        persist();
      }
    }
    if (changed) { last = null; build(); }
  };
})();
