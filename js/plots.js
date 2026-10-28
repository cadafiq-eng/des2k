/* plots.js — Gráficas SVG sin dependencias */
(function (G) {
  'use strict';
  const P = {};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  P.niceTicks = function (min, max, n) {
    n = n || 5;
    if (!isFinite(min) || !isFinite(max)) { min = 0; max = 1; }
    if (min === max) { const d = Math.abs(min) * 0.1 || 1; min -= d; max += d; }
    const span = max - min; const step0 = span / n; const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const err = step0 / mag; const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step; const ticks = [];
    for (let v = lo; v <= hi + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
    return { lo, hi, ticks, step };
  };
  const ft = v => { const a = Math.abs(v); if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(1); return String(+v.toPrecision(6)); };

  /**
   * Gráfica cartesiana genérica.
   * o: {W,H,title,xlabel,ylabel,series:[{type:'points'|'line', x, y, labels, color, r, dash, marker}], lines:[{x1,y1,x2,y2,color,dash,label}], xdom, ydom, xcats, yTickFmt}
   */
  P.chart = function (o) {
    const W = o.W || 520, H = o.H || 340; const m = { l: 62, r: 18, t: o.title ? 34 : 14, b: 48 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    let xs = [], ys = [];
    (o.series || []).forEach(s => { xs = xs.concat(s.x.filter(isFinite)); ys = ys.concat(s.y.filter(isFinite)); });
    (o.lines || []).forEach(l => { if (!l.noScale) { xs.push(l.x1, l.x2); ys.push(l.y1, l.y2); } });
    const pad = (a, b) => { const d = (b - a) * 0.06 || 1; return [a - d, b + d]; };
    const xd = o.xdom || pad(Math.min(...xs), Math.max(...xs)); const yd = o.ydom || pad(Math.min(...ys), Math.max(...ys));
    const xt = o.xcats ? null : P.niceTicks(xd[0], xd[1], o.xn || 6); const yt = P.niceTicks(yd[0], yd[1], o.yn || 5);
    const X0 = o.xcats ? xd[0] : (o.xdom ? xd[0] : xt.lo), X1 = o.xcats ? xd[1] : (o.xdom ? xd[1] : xt.hi);
    const Y0 = o.ydom ? yd[0] : yt.lo, Y1 = o.ydom ? yd[1] : yt.hi;
    const sx = v => m.l + (v - X0) / (X1 - X0) * pw; const sy = v => m.t + ph - (v - Y0) / (Y1 - Y0) * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(o.title || 'gráfica')}">`;
    if (o.title) s += `<text x="${W / 2}" y="20" class="pt-title" text-anchor="middle">${esc(o.title)}</text>`;
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" class="pt-bg"/>`;
    yt.ticks.filter(v => v >= Y0 - 1e-12 && v <= Y1 + 1e-12).forEach(v => {
      const y = sy(v); s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" class="pt-grid"/><text x="${m.l - 6}" y="${y + 4}" text-anchor="end" class="pt-tick">${o.yTickFmt ? o.yTickFmt(v) : ft(v)}</text>`;
    });
    if (o.xcats) o.xcats.forEach(c => { const x = sx(c.v); s += `<text x="${x}" y="${m.t + ph + 16}" text-anchor="middle" class="pt-tick">${esc(c.label)}</text>`; });
    else xt.ticks.filter(v => v >= X0 - 1e-12 && v <= X1 + 1e-12).forEach(v => {
      const x = sx(v); s += `<line y1="${m.t}" y2="${m.t + ph}" x1="${x}" x2="${x}" class="pt-grid"/><text x="${x}" y="${m.t + ph + 16}" text-anchor="middle" class="pt-tick">${ft(v)}</text>`;
    });
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" class="pt-frame"/>`;
    s += `<clipPath id="c${o.id || 'p'}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath><g clip-path="url(#c${o.id || 'p'})">`;
    (o.lines || []).forEach(l => { s += `<line x1="${sx(l.x1)}" y1="${sy(l.y1)}" x2="${sx(l.x2)}" y2="${sy(l.y2)}" stroke="${l.color || 'var(--danger)'}" stroke-width="${l.w || 1.5}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''}/>`; });
    (o.series || []).forEach(se => {
      const c = se.color || 'var(--accent)';
      if (se.type === 'line') {
        const pts = se.x.map((x, i) => (isFinite(x) && isFinite(se.y[i]) ? `${sx(x)},${sy(se.y[i])}` : null)).filter(Boolean).join(' ');
        s += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="${se.w || 2}" ${se.dash ? `stroke-dasharray="${se.dash}"` : ''}/>`;
        if (se.marker) se.x.forEach((x, i) => { s += `<circle cx="${sx(x)}" cy="${sy(se.y[i])}" r="3.5" fill="${c}"/>`; });
      } else {
        se.x.forEach((x, i) => {
          if (!isFinite(x) || !isFinite(se.y[i])) return;
          const col = se.colors ? se.colors[i] : c; const r = se.r || 4;
          if (se.shape === 'diamond') s += `<path d="M${sx(x)},${sy(se.y[i]) - r - 1}l${r + 1},${r + 1}l${-r - 1},${r + 1}l${-r - 1},${-r - 1}z" fill="${col}"><title>${esc(se.tips ? se.tips[i] : '')}</title></path>`;
          else s += `<circle cx="${sx(x)}" cy="${sy(se.y[i])}" r="${r}" fill="${col}" fill-opacity=".85"><title>${esc(se.tips ? se.tips[i] : (se.labels ? se.labels[i] : ''))}</title></circle>`;
        });
      }
    });
    s += `</g>`;
    (o.series || []).forEach(se => { if (se.labels && se.type !== 'line') se.x.forEach((x, i) => { if (se.labels[i]) s += `<text x="${sx(x) + 6}" y="${sy(se.y[i]) - 5}" class="pt-lab">${esc(se.labels[i])}</text>`; }); });
    (o.lines || []).forEach(l => { if (l.label) s += `<text x="${sx(l.x2) - 4}" y="${sy(l.y2) - 5}" text-anchor="end" class="pt-lab" fill="${l.color || 'var(--danger)'}">${esc(l.label)}</text>`; });
    if (o.legend) { let ly = m.t + 6; o.legend.forEach(lg => { s += `<line x1="${m.l + pw - 118}" x2="${m.l + pw - 98}" y1="${ly + 6}" y2="${ly + 6}" stroke="${lg.color}" stroke-width="2.5" ${lg.dash ? `stroke-dasharray="${lg.dash}"` : ''}/><text x="${m.l + pw - 92}" y="${ly + 10}" class="pt-tick">${esc(lg.label)}</text>`; ly += 16; }); }
    if (o.xlabel) s += `<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" class="pt-axis">${esc(o.xlabel)}</text>`;
    if (o.ylabel) s += `<text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" class="pt-axis">${esc(o.ylabel)}</text>`;
    return s + '</svg>';
  };

  /** Diagrama de Pareto horizontal */
  P.pareto = function ({ items, crit, critLabel, title, xlabel }) {
    const it = items.slice().sort((a, b) => b.v - a.v);
    const W = 560, bh = 20, m = { l: 90, r: 30, t: 34, b: 44 }; const H = m.t + m.b + it.length * bh;
    const mx = Math.max(crit || 0, ...it.map(i => i.v)) * 1.08 || 1; const tk = P.niceTicks(0, mx, 6);
    const pw = W - m.l - m.r; const sx = v => m.l + v / tk.hi * pw;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot" role="img" aria-label="${esc(title)}"><text x="${W / 2}" y="20" class="pt-title" text-anchor="middle">${esc(title)}</text>`;
    tk.ticks.forEach(v => { s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${m.t}" y2="${H - m.b}" class="pt-grid"/><text x="${sx(v)}" y="${H - m.b + 15}" text-anchor="middle" class="pt-tick">${ft(v)}</text>`; });
    it.forEach((i, k) => {
      const y = m.t + k * bh + 3; const sig = crit && i.v > crit;
      s += `<rect x="${m.l}" y="${y}" width="${Math.max(0, sx(i.v) - m.l)}" height="${bh - 6}" fill="${sig ? 'var(--accent)' : 'var(--muted-bar)'}" rx="2"><title>${esc(i.label)}: ${i.v.toFixed(3)}</title></rect>`;
      s += `<text x="${m.l - 6}" y="${y + bh / 2 + 1}" text-anchor="end" class="pt-tick">${esc(i.label)}</text>`;
    });
    if (crit) s += `<line x1="${sx(crit)}" x2="${sx(crit)}" y1="${m.t - 4}" y2="${H - m.b}" stroke="var(--danger)" stroke-width="1.8" stroke-dasharray="5 3"/><text x="${sx(crit) + 4}" y="${H - m.b - 4}" class="pt-lab" fill="var(--danger)">${esc(critLabel || '')}</text>`;
    s += `<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" class="pt-axis">${esc(xlabel || '')}</text>`;
    return s + '</svg>';
  };

  P.histogram = function ({ data, title, xlabel }) {
    const n = data.length; const nb = Math.max(5, Math.min(15, Math.ceil(Math.log2(n) + 1)));
    const mn = Math.min(...data), mx = Math.max(...data); const w = (mx - mn) / nb || 1;
    const counts = new Array(nb).fill(0); data.forEach(v => { counts[Math.min(nb - 1, Math.floor((v - mn) / w))]++; });
    const W = 520, H = 300, m = { l: 50, r: 14, t: 34, b: 44 }; const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const cm = Math.max(...counts); const yt = P.niceTicks(0, cm, 4);
    const sx = v => m.l + (v - mn) / (mx - mn || 1) * pw, sy = v => m.t + ph - v / yt.hi * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot"><text x="${W / 2}" y="20" class="pt-title" text-anchor="middle">${esc(title)}</text>`;
    yt.ticks.forEach(v => { s += `<line x1="${m.l}" x2="${m.l + pw}" y1="${sy(v)}" y2="${sy(v)}" class="pt-grid"/><text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end" class="pt-tick">${v}</text>`; });
    counts.forEach((c, i) => { s += `<rect x="${sx(mn + i * w) + 1}" y="${sy(c)}" width="${Math.max(1, pw / nb - 2)}" height="${m.t + ph - sy(c)}" fill="var(--accent)" fill-opacity=".8"/>`; });
    P.niceTicks(mn, mx, 5).ticks.filter(v => v >= mn && v <= mx).forEach(v => { s += `<text x="${sx(v)}" y="${m.t + ph + 16}" text-anchor="middle" class="pt-tick">${ft(v)}</text>`; });
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" class="pt-frame"/><text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" class="pt-axis">${esc(xlabel)}</text><text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" class="pt-axis">Frecuencia</text>`;
    return s + '</svg>';
  };

  /** Escala de color secuencial (tipo viridis) */
  P.color = function (t) {
    const st = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
    t = Math.max(0, Math.min(1, t)); const p = t * (st.length - 1); const i = Math.min(st.length - 2, Math.floor(p)); const f = p - i;
    const c = st[i].map((v, j) => Math.round(v + (st[i + 1][j] - v) * f)); return `rgb(${c.join(',')})`;
  };

  /** Mapa de contorno: z(x,y) en una malla [-1,1]² con isolíneas por marching squares */
  P.contour = function ({ fz, title, xlabel, ylabel, nGrid, levels, xr, yr }) {
    const N = nGrid || 41; const W = 560, H = 460, m = { l: 62, r: 90, t: 34, b: 48 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const Z = []; let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < N; i++) { Z.push([]); for (let j = 0; j < N; j++) { const x = -1 + 2 * j / (N - 1), y = -1 + 2 * i / (N - 1); const z = fz(x, y); Z[i].push(z); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); } }
    const sx = x => m.l + (x + 1) / 2 * pw, sy = y => m.t + ph - (y + 1) / 2 * ph;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot"><text x="${(W - m.r + m.l) / 2}" y="20" class="pt-title" text-anchor="middle">${esc(title)}</text>`;
    const cw = pw / (N - 1), ch = ph / (N - 1);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const t = (Z[i][j] - zmin) / (zmax - zmin || 1);
      s += `<rect x="${(sx(-1 + 2 * j / (N - 1)) - cw / 2).toFixed(1)}" y="${(sy(-1 + 2 * i / (N - 1)) - ch / 2).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${P.color(t)}"/>`;
    }
    const lv = P.niceTicks(zmin, zmax, levels || 8).ticks.filter(v => v > zmin && v < zmax);
    const gx = j => -1 + 2 * j / (N - 1), gy = i => -1 + 2 * i / (N - 1);
    lv.forEach(L => {
      let d = '';
      for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
        const z = [Z[i][j], Z[i][j + 1], Z[i + 1][j + 1], Z[i + 1][j]];
        const pts = [[gx(j), gy(i)], [gx(j + 1), gy(i)], [gx(j + 1), gy(i + 1)], [gx(j), gy(i + 1)]];
        const cross = [];
        for (let e = 0; e < 4; e++) { const a = z[e], b = z[(e + 1) % 4]; if ((a < L) !== (b < L)) { const t = (L - a) / (b - a); const p0 = pts[e], p1 = pts[(e + 1) % 4]; cross.push([p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]); } }
        for (let c = 0; c + 1 < cross.length; c += 2) d += `M${sx(cross[c][0]).toFixed(1)},${sy(cross[c][1]).toFixed(1)}L${sx(cross[c + 1][0]).toFixed(1)},${sy(cross[c + 1][1]).toFixed(1)}`;
      }
      s += `<path d="${d}" stroke="#fff" stroke-opacity=".85" stroke-width="1" fill="none"/>`;
      // etiqueta en el punto medio aproximado
      let best = null; const h2 = Math.floor(N / 2); const cand = []; for (let t = 1; t < N - 1; t++) { cand.push([h2, t], [t, h2]); } cand.forEach(([i, j]) => { const dz = Math.abs(Z[i][j] - L); if (!best || dz < best.dz) best = { dz, i, j }; });
      if (best) s += `<text x="${sx(gx(best.j))}" y="${sy(gy(best.i))}" class="pt-clab" text-anchor="middle">${ft(L)}</text>`;
    });
    [-1, -0.5, 0, 0.5, 1].forEach(v => {
      s += `<text x="${sx(v)}" y="${m.t + ph + 16}" text-anchor="middle" class="pt-tick">${xr ? ft(xr(v)) : v}</text><text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end" class="pt-tick">${yr ? ft(yr(v)) : v}</text>`;
    });
    s += `<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" class="pt-frame"/>`;
    const lx = W - m.r + 22; for (let k = 0; k < 50; k++) s += `<rect x="${lx}" y="${m.t + ph - (k + 1) * ph / 50}" width="16" height="${ph / 50 + 0.5}" fill="${P.color(k / 49)}"/>`;
    P.niceTicks(zmin, zmax, 5).ticks.filter(v => v >= zmin && v <= zmax).forEach(v => { const y = m.t + ph - (v - zmin) / (zmax - zmin || 1) * ph; s += `<text x="${lx + 20}" y="${y + 4}" class="pt-tick">${ft(v)}</text>`; });
    s += `<text x="${m.l + pw / 2}" y="${H - 8}" text-anchor="middle" class="pt-axis">${esc(xlabel)}</text><text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" class="pt-axis">${esc(ylabel)}</text>`;
    return s + '</svg>';
  };

  /** Gráfica de cubo con valores en los 8 vértices */
  P.cube = function ({ val, names, title }) {
    const W = 540, H = 400; const o = { x: 110, y: 300 }, a = 210, dx = 90, dy = -80;
    const pos = (i, j, k) => [o.x + (i > 0 ? a : 0) + (k > 0 ? dx : 0), o.y - (j > 0 ? a * 0.8 : 0) + (k > 0 ? dy : 0)];
    let s = `<svg viewBox="0 0 ${W} ${H}" class="plot"><text x="${W / 2}" y="20" class="pt-title" text-anchor="middle">${esc(title)}</text>`;
    const V = []; [-1, 1].forEach(i => [-1, 1].forEach(j => [-1, 1].forEach(k => V.push([i, j, k]))));
    V.forEach(p => V.forEach(q => { const d = p.reduce((s2, v, t) => s2 + (v !== q[t] ? 1 : 0), 0); if (d === 1 && p < q) { const A1 = pos(...p), B1 = pos(...q); const back = p[2] < 0 && q[2] < 0; s += `<line x1="${A1[0]}" y1="${A1[1]}" x2="${B1[0]}" y2="${B1[1]}" class="pt-frame-line" ${back ? '' : ''}/>`; } }));
    V.forEach(p => { const [x, y] = pos(...p); const v = val(p); s += `<circle cx="${x}" cy="${y}" r="4" fill="var(--accent)"/><rect x="${x - 30}" y="${y - 27}" width="60" height="19" rx="4" class="pt-boxlab"/><text x="${x}" y="${y - 13}" text-anchor="middle" class="pt-lab">${isFinite(v) ? ft(+v.toFixed(3)) : '—'}</text>`; });
    s += `<text x="${o.x + a / 2}" y="${o.y + 30}" text-anchor="middle" class="pt-axis">${esc(names[0])} (−1 → +1)</text>`;
    s += `<text transform="translate(${o.x - 26} ${o.y - a * 0.4}) rotate(-90)" text-anchor="middle" class="pt-axis">${esc(names[1])} (−1 → +1)</text>`;
    s += `<text x="${o.x + a + dx / 2 + 28}" y="${o.y + dy / 2 + 6}" class="pt-axis">${esc(names[2])}</text>`;
    return s + '</svg>';
  };

  G.Plots = P;
  if (typeof module !== 'undefined') module.exports = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
