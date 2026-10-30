/* stats.js — Distribuciones, mínimos cuadrados y pruebas estadísticas (sin dependencias) */
(function (G) {
  'use strict';
  const S = {};

  S.sum = a => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };
  S.mean = a => S.sum(a) / a.length;
  S.dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  S.median = a => {
    const b = Float64Array.from(a).sort(); const n = b.length;
    if (!n) return NaN;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2;
  };
  S.sd = a => { const m = S.mean(a); let s = 0; for (const v of a) s += (v - m) ** 2; return Math.sqrt(s / (a.length - 1)); };

  /* ---------- Funciones especiales ---------- */
  S.lgamma = function (x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  };

  function betacf(a, b, x) {
    const MAXIT = 500, EPS = 3e-16, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /** Beta incompleta regularizada I_x(a,b) */
  S.ibeta = function (x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(S.lgamma(a + b) - S.lgamma(a) - S.lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  };

  function gser(a, x) {
    let ap = a, sum = 1 / a, del = sum;
    for (let n = 1; n < 2000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-16) break; }
    return sum * Math.exp(-x + a * Math.log(x) - S.lgamma(a));
  }
  function gcf(a, x) {
    const FP = 1e-300;
    let b = x + 1 - a, c = 1 / FP, d = 1 / b, h = d;
    for (let i = 1; i < 2000; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < FP) d = FP;
      c = b + an / c; if (Math.abs(c) < FP) c = FP;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - S.lgamma(a)) * h;
  }
  S.gammaP = (a, x) => x <= 0 ? 0 : (x < a + 1 ? gser(a, x) : 1 - gcf(a, x));
  S.gammaQ = (a, x) => x <= 0 ? 1 : (x < a + 1 ? 1 - gser(a, x) : gcf(a, x));

  /* ---------- Distribuciones ---------- */
  S.normcdf = z => z >= 0 ? 1 - 0.5 * S.gammaQ(0.5, z * z / 2) : 0.5 * S.gammaQ(0.5, z * z / 2);
  S.normsf = z => S.normcdf(-z);
  S.normpdf = z => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  S.norminv = function (p) {
    if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let x, q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    else if (p <= 1 - pl) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const e = S.normcdf(x) - p; const u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  };

  S.tcdf = (t, df) => { const tail = 0.5 * S.ibeta(df / (df + t * t), df / 2, 0.5); return t > 0 ? 1 - tail : tail; };
  /** valor p bilateral de t */
  S.tp2 = (t, df) => (Number.isNaN(t) ? NaN : !isFinite(t) ? 0 : S.ibeta(df / (df + t * t), df / 2, 0.5));
  S.tinv = function (p, df) {
    if (p === 0.5) return 0;
    if (p < 0.5) return -S.tinv(1 - p, df);
    let lo = 0, hi = 2;
    while (S.tcdf(hi, df) < p && hi < 1e8) hi *= 2;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (S.tcdf(mid, df) < p) lo = mid; else hi = mid; if (hi - lo < 1e-12 * hi) break; }
    return (lo + hi) / 2;
  };
  /** P(F > f) */
  S.fsf = (f, d1, d2) => (f <= 0 ? 1 : (!isFinite(f) ? 0 : S.ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)));
  S.chi2sf = (x, df) => S.gammaQ(df / 2, x / 2);

  /* ---------- Álgebra lineal ---------- */
  S.inv = function (M) {
    const n = M.length; const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let piv = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      if (Math.abs(A[piv][c]) < 1e-14) return null;
      [A[c], A[piv]] = [A[piv], A[c]];
      const pv = A[c][c]; for (let j = 0; j < 2 * n; j++) A[c][j] /= pv;
      for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
    }
    return A.map(r => r.slice(n));
  };

  /**
   * Mínimos cuadrados por Gram-Schmidt modificado con detección de rango.
   * cols: arreglo de columnas (cada una de longitud n). Devuelve columnas conservadas,
   * coeficientes, (X'X)^-1 (no escalada), ajustados, residuales, apalancamientos y Q.
   */
  S.lsfit = function (cols, y, tol) {
    tol = tol || 1e-8;
    const n = y.length; const Q = [], R = [], kept = [];
    cols.forEach((c, j) => {
      const v = Float64Array.from(c); const n0 = Math.sqrt(S.dot(v, v));
      if (n0 === 0) return;
      const r = new Array(Q.length).fill(0);
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < Q.length; i++) {
          const q = Q[i]; let d = 0; for (let t = 0; t < n; t++) d += q[t] * v[t];
          r[i] += d; for (let t = 0; t < n; t++) v[t] -= d * q[t];
        }
      }
      const nv = Math.sqrt(S.dot(v, v));
      if (nv / n0 < tol) return;
      for (let t = 0; t < n; t++) v[t] /= nv;
      Q.push(v); r.push(nv); R.push(r); kept.push(j);
    });
    const p = Q.length;
    const qy = Q.map(q => S.dot(q, y));
    const b = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let s = qy[i]; for (let j = i + 1; j < p; j++) s -= R[j][i] * b[j];
      b[i] = s / R[i][i];
    }
    // R^-1 (triangular superior)
    const Ri = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let col = 0; col < p; col++) {
      for (let i = col; i >= 0; i--) {
        let s = i === col ? 1 : 0;
        for (let j = i + 1; j <= col; j++) s -= R[j][i] * Ri[j][col];
        Ri[i][col] = s / R[i][i];
      }
    }
    const V = Array.from({ length: p }, () => new Array(p).fill(0));
    for (let i = 0; i < p; i++) for (let j = i; j < p; j++) {
      let s = 0; for (let m = Math.max(i, j); m < p; m++) s += Ri[i][m] * Ri[j][m];
      V[i][j] = V[j][i] = s;
    }
    const fitted = new Float64Array(n);
    Q.forEach((q, i) => { for (let t = 0; t < n; t++) fitted[t] += q[t] * qy[i]; });
    const resid = Array.from(y, (v, t) => v - fitted[t]);
    const lev = new Float64Array(n);
    Q.forEach(q => { for (let t = 0; t < n; t++) lev[t] += q[t] * q[t]; });
    return { kept, b, V, fitted: Array.from(fitted), resid, rss: S.dot(resid, resid), rank: p, lev: Array.from(lev), Q };
  };

  /** Residual de y sobre una base ortonormal Q */
  S.project = function (Q, y) {
    const r = Float64Array.from(y);
    for (const q of Q) { const d = S.dot(q, r); for (let t = 0; t < r.length; t++) r[t] -= d * q[t]; }
    return r;
  };

  /* ---------- Pruebas ---------- */
  /** Shapiro-Wilk (Royston 1995, AS R94) */
  S.shapiroWilk = function (data) {
    const x = Float64Array.from(data).sort(); const n = x.length;
    if (n < 3 || n > 5000) return null;
    const range = x[n - 1] - x[0]; if (range < 1e-12 * (Math.abs(x[0]) + 1)) return null;
    const poly = (cc, z) => { let r = cc[cc.length - 1]; for (let i = cc.length - 2; i >= 0; i--) r = r * z + cc[i]; return r; };
    const nn2 = Math.floor(n / 2); const a = new Array(nn2 + 1).fill(0);
    const c1 = [0, 0.221157, -0.147981, -2.071190, 4.434685, -2.706056];
    const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
    if (n === 3) a[1] = Math.SQRT1_2;
    else {
      const an25 = n + 0.25; const m = new Array(nn2 + 1); let summ2 = 0;
      for (let i = 1; i <= nn2; i++) { m[i] = S.norminv((i - 0.375) / an25); summ2 += m[i] * m[i]; }
      summ2 *= 2; const ssumm2 = Math.sqrt(summ2); const rsn = 1 / Math.sqrt(n);
      const a1 = poly(c1, rsn) - m[1] / ssumm2;
      let i1, fac;
      if (n > 5) {
        i1 = 3; const a2 = -m[2] / ssumm2 + poly(c2, rsn);
        fac = Math.sqrt((summ2 - 2 * m[1] * m[1] - 2 * m[2] * m[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
        a[2] = a2;
      } else { i1 = 2; fac = Math.sqrt((summ2 - 2 * m[1] * m[1]) / (1 - 2 * a1 * a1)); }
      a[1] = a1;
      for (let i = i1; i <= nn2; i++) a[i] = -m[i] / fac;
    }
    const mean = S.mean(x); let ss = 0; for (const v of x) ss += (v - mean) ** 2;
    let num = 0; for (let i = 1; i <= nn2; i++) num += a[i] * (x[n - i] - x[i - 1]);
    let W = num * num / ss; if (W > 1) W = 1;
    let p;
    if (n === 3) { p = Math.max(0, 6 / Math.PI * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)))); }
    else {
      let y = Math.log(1 - W); const xx = Math.log(n); let mu, s;
      if (n <= 11) {
        const gamma = -2.273 + 0.459 * n;
        if (y >= gamma) return { W, p: 1e-99 };
        y = -Math.log(gamma - y);
        mu = poly([0.5440, -0.39978, 0.025054, -6.714e-4], n);
        s = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
      } else {
        mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx);
        s = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx));
      }
      p = S.normsf((y - mu) / s);
    }
    return { W, p };
  };

  /** Anderson-Darling (media y varianza estimadas; p de D'Agostino-Stephens) */
  S.andersonDarling = function (data) {
    const x = Float64Array.from(data).sort(); const n = x.length; if (n < 5) return null;
    const m = S.mean(x), s = S.sd(x); if (!(s > 0)) return null;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const F1 = Math.min(Math.max(S.normcdf((x[i] - m) / s), 1e-300), 1 - 1e-16);
      const F2 = Math.min(Math.max(S.normcdf((x[n - 1 - i] - m) / s), 1e-300), 1 - 1e-16);
      sum += (2 * i + 1) * (Math.log(F1) + Math.log(1 - F2));
    }
    const A2 = -n - sum / n; const As = A2 * (1 + 0.75 / n + 2.25 / (n * n));
    let p;
    if (As >= 0.6) p = Math.exp(1.2937 - 5.709 * As + 0.0186 * As * As);
    else if (As >= 0.34) p = Math.exp(0.9177 - 4.279 * As - 1.38 * As * As);
    else if (As >= 0.2) p = 1 - Math.exp(-8.318 + 42.796 * As - 59.938 * As * As);
    else p = 1 - Math.exp(-13.436 + 101.14 * As - 223.73 * As * As);
    return { A2, As, p: Math.min(1, Math.max(0, p)) };
  };

  /** ANOVA de un factor sobre grupos (arreglos) */
  S.oneWay = function (groups) {
    groups = groups.filter(g => g.length > 0);
    const all = groups.flat(); const N = all.length, k = groups.length;
    if (k < 2 || N - k < 1) return null;
    const gm = S.mean(all); let ssb = 0, ssw = 0;
    for (const g of groups) { const m = S.mean(g); ssb += g.length * (m - gm) ** 2; for (const v of g) ssw += (v - m) ** 2; }
    const df1 = k - 1, df2 = N - k; const F = (ssb / df1) / (ssw / df2);
    return { F, df1, df2, p: ssw > 0 ? S.fsf(F, df1, df2) : (ssb > 0 ? 0 : 1) };
  };
  /** Levene modificada (Brown-Forsythe, con medianas) */
  S.brownForsythe = groups => S.oneWay(groups.map(g => { const md = S.median(g); return g.map(v => Math.abs(v - md)); }));

  /** Prueba de rachas (arriba/abajo de la mediana) */
  S.runsTest = function (x) {
    const md = S.median(x); const s = x.filter(v => v !== md).map(v => v > md);
    const n1 = s.filter(Boolean).length, n2 = s.length - n1; if (n1 < 2 || n2 < 2) return null;
    let R = 1; for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) R++;
    const N = n1 + n2; const mu = 2 * n1 * n2 / N + 1;
    const v = 2 * n1 * n2 * (2 * n1 * n2 - N) / (N * N * (N - 1));
    const z = (R - mu) / Math.sqrt(v);
    return { R, mu, z, p: 2 * S.normsf(Math.abs(z)), n1, n2 };
  };
  S.durbinWatson = function (e) {
    let num = 0, den = 0; for (let i = 0; i < e.length; i++) { den += e[i] * e[i]; if (i) num += (e[i] - e[i - 1]) ** 2; }
    let r1 = 0; const m = S.mean(e); let d0 = 0;
    for (let i = 0; i < e.length; i++) { d0 += (e[i] - m) ** 2; if (i) r1 += (e[i] - m) * (e[i - 1] - m); }
    return { d: num / den, r1: r1 / d0 };
  };

  /** Generador pseudoaleatorio con semilla */
  S.rng = function (seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  };

  // Cola F no central: mezcla Poisson centrada en su moda para evitar underflow.
  S.ncfSF = function(x, d1, d2, lambda) {
    if (!(d1>0 && d2>0 && lambda>=0 && Number.isFinite(lambda))) throw Error('Parámetros F inválidos.');
    if (x<=0) return 1;
    if (lambda===0) return S.fsf(x,d1,d2);
    const mu=lambda/2, m=Math.floor(mu);
    if (mu>100000) throw Error('No centralidad fuera del rango numérico (λ ≤ 200000).');
    const z=d2/(d2+d1*x), b=d2/2;
    const w0=Math.exp(-mu+m*Math.log(mu)-S.lgamma(m+1));
    let sum=w0*S.ibeta(z,b,d1/2+m), mass=w0, w=w0;
    for(let j=m;j>0;j--) { w*=j/mu; sum+=w*S.ibeta(z,b,d1/2+j-1); mass+=w; if(w<1e-15 && j<mu) break; }
    w=w0;
    for(let j=m+1;j<m+10000;j++) { w*=mu/j; sum+=w*S.ibeta(z,b,d1/2+j); mass+=w; if(w<1e-15 && j>mu) break; }
    if (mass<0.99999999) throw Error('La mezcla F no convergió.');
    return Math.max(0,Math.min(1,sum/mass));
  };
  S.fcritical = function(alpha,d1,d2) {
    if (!(alpha>0 && alpha<1 && d1>0 && d2>0)) throw Error('α o grados de libertad inválidos.');
    let lo=0,hi=1;
    while(S.fsf(hi,d1,d2)>alpha && hi<1e16) hi*=2;
    for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(S.fsf(mid,d1,d2)>alpha)lo=mid;else hi=mid;}
    return (lo+hi)/2;
  };
  S.effectPower = function(effect,sigma,vjj,df,alpha) {
    if (![effect,sigma,vjj,df,alpha].every(Number.isFinite) || effect<0 || sigma<=0 || vjj<=0 || df<=0) throw Error('Use efecto ≥ 0, σ > 0 y gl de error > 0.');
    return S.ncfSF(S.fcritical(alpha,1,df),1,df,(effect/2)**2/(sigma*sigma*vjj));
  };

  G.Stats = S;
  if (typeof module !== 'undefined') module.exports = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
