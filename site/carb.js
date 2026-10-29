
(() => {
  const FUELS = { diesel: 'Diésel', gasolina_95: 'Gasolina 95', gasolina_98: 'Gasolina 98', diesel_premium: 'Diésel premium' };
  const CC_COL = {
    'Catalunya': '#2f6fd6', 'Aragón': '#e07b1f', 'C. Valenciana': '#e3b505', 'Murcia': '#b9461b', 'Andalucía': '#2e9e5b',
    'Extremadura': '#7d9a2a', 'Castilla-La Mancha': '#8b5cf6', 'Madrid': '#dc2f45', 'Castilla y León': '#a26a2a', 'Galicia': '#0f8fa8',
    'Asturias': '#d4508f', 'Cantabria': '#5fa31a', 'País Vasco': '#b3233f', 'Navarra': '#4f46c8', 'La Rioja': '#2aa6d6',
    'Illes Balears': '#14b8a6', 'Canarias': '#f2a20c', 'Ceuta': '#64748b', 'Melilla': '#7c8aa0',
  };
  const ccCol = (c) => CC_COL[c] || '#888888';
  const tone = (base, t) => d3.interpolateRgb(d3.interpolateRgb(base, '#ffffff')(0.5), d3.interpolateRgb(base, '#000000')(0.35))(t);

  const nf = (o) => new Intl.NumberFormat('es-ES', o);
  const fP3 = nf({ minimumFractionDigits: 3, maximumFractionDigits: 3 }), fC1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' }), fC01 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }), fE2 = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2 }), fN0 = nf({ maximumFractionDigits: 0 });
  const fP = (v) => fP3.format(v), fC = (v) => fC1.format(v), fC0 = (v) => fC01.format(v), fN = (v) => fN0.format(v), fE = (v) => fE2.format(v);
  const dS = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }), dL = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fD = (d) => dS.format(d).replace('.', ''), fDL = (d) => dL.format(d);
  const day = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');

  // Mercator projection and path, drawn by hand
  const merc = (lon, lat) => [lon * Math.PI / 180, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2))];
  const polysOf = (geom) => (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates);
  function fitProj(geoms, x0, y0, x1, y1) {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
    for (const g of geoms) for (const poly of polysOf(g)) for (const ring of poly) for (const p of ring) { const r = merc(p[0], p[1]); if (r[0] < mnx) mnx = r[0]; if (r[0] > mxx) mxx = r[0]; if (r[1] < mny) mny = r[1]; if (r[1] > mxy) mxy = r[1]; }
    const k = Math.min((x1 - x0) / ((mxx - mnx) || 1), (y1 - y0) / ((mxy - mny) || 1));
    const tx = x0 + ((x1 - x0) - k * (mxx - mnx)) / 2 - k * mnx, ty = y0 + ((y1 - y0) - k * (mxy - mny)) / 2 - k * mny;
    return (p) => { const r = merc(p[0], p[1]); return [r[0] * k + tx, r[1] * k + ty]; };
  }
  const pathOf = (proj, geom) => {
    let s = '';
    for (const poly of polysOf(geom)) for (const ring of poly) s += 'M' + ring.map((p) => { const q = proj(p); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join('L') + 'Z';
    return s;
  };
  function labelPos(proj, geom) {
    let best = null, ba = 0;
    for (const poly of polysOf(geom)) {
      const ring = poly[0].map(proj); let a = 0, cx = 0, cy = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f; }
      if (Math.abs(a) > ba) { ba = Math.abs(a); best = { x: cx / (3 * a), y: cy / (3 * a), area: Math.abs(a) / 2 }; }
    }
    return best;
  }

  // ---------- Calculations ----------
  dash.calc('c_kpis', {
    inputs: ['c_historico_espana'], title: 'Resumen España',
    description: 'Último precio medio de cada carburante, su cambio en 7 días y desde el primer día de la serie (en céntimos), y la diferencia diésel menos gasolina 95 (en céntimos).',
    fn: (historico_espana) => {
      const rows = historico_espana.map((r) => ({ f: String(r.fecha).slice(0, 10), c: r.combustible, p: Number(r.precio_medio) })).filter((r) => r.p > 0);
      const fechas = [...new Set(rows.map((r) => r.f))].sort();
      const hoyF = fechas[fechas.length - 1], iniF = fechas[0];
      const lim = new Date(new Date(hoyF + 'T00:00:00Z').getTime() - 7 * 864e5).toISOString().slice(0, 10);
      const h7F = fechas.filter((f) => f <= lim).pop();
      const get = (c, f) => { const r = rows.find((x) => x.c === c && x.f === f); return r ? r.p : null; };
      const cts = (a, b) => (a == null || b == null ? null : Math.round((a - b) * 1000) / 10);
      const out = ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'].map((c) => {
        const hoy = get(c, hoyF), h7 = get(c, h7F), ini = get(c, iniF);
        return { combustible: c, fecha: hoyF, fecha_inicio: iniF, hoy, hace7: h7, inicio: ini, var7_cts: cts(hoy, h7), var_inicio_cts: cts(hoy, ini), var_inicio_pct: ini ? Math.round((hoy / ini - 1) * 1000) / 10 : null };
      });
      const d = out[0], g = out[1];
      out.push({ combustible: 'diesel_menos_g95', fecha: hoyF, fecha_inicio: iniF, hoy: cts(d.hoy, g.hoy), hace7: cts(d.hace7, g.hace7), inicio: cts(d.inicio, g.inicio), var7_cts: null, var_inicio_cts: null, var_inicio_pct: null });
      return out;
    },
  });

  dash.calc('c_media_hoy', {
    inputs: ['c_estaciones'], title: 'Media España por gasolinera',
    description: 'Precio medio simple de todas las gasolineras de España en la foto de precios, por carburante.',
    fn: (estaciones) => ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'].map((f) => {
      let s = 0, n = 0; for (const r of estaciones) { const v = Number(r[f]); if (v > 0) { s += v; n++; } }
      return { combustible: f, media: n ? Math.round(s / n * 1000) / 1000 : null, gasolineras: n };
    }),
  });

  dash.calc('c_por_ccaa', {
    inputs: ['c_estaciones'], title: 'Media por comunidad',
    description: 'Precio medio simple de las gasolineras de cada comunidad autónoma, por carburante.',
    fn: (estaciones) => {
      const F = ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'], g = new Map();
      for (const r of estaciones) {
        let a = g.get(r.ccaa);
        if (!a) { a = { ccaa: r.ccaa, n: 0, s: {}, k: {} }; F.forEach((f) => { a.s[f] = 0; a.k[f] = 0; }); g.set(r.ccaa, a); }
        a.n++;
        for (const f of F) { const v = Number(r[f]); if (v > 0) { a.s[f] += v; a.k[f]++; } }
      }
      return [...g.values()].map((a) => { const o = { ccaa: a.ccaa, gasolineras: a.n }; F.forEach((f) => { o[f] = a.k[f] ? Math.round(a.s[f] / a.k[f] * 1000) / 1000 : null; }); return o; });
    },
  });

  dash.calc('c_por_provincia', {
    inputs: ['c_estaciones'], title: 'Media por provincia',
    description: 'Precio medio simple de las gasolineras de cada provincia, por carburante.',
    fn: (estaciones) => {
      const F = ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'], g = new Map();
      for (const r of estaciones) {
        const key = String(r.cod_prov).padStart(2, '0');
        let a = g.get(key);
        if (!a) { a = { cod_prov: key, provincia: r.provincia, ccaa: r.ccaa, n: 0, s: {}, k: {} }; F.forEach((f) => { a.s[f] = 0; a.k[f] = 0; }); g.set(key, a); }
        a.n++;
        for (const f of F) { const v = Number(r[f]); if (v > 0) { a.s[f] += v; a.k[f]++; } }
      }
      return [...g.values()].map((a) => { const o = { cod_prov: a.cod_prov, provincia: a.provincia, ccaa: a.ccaa, gasolineras: a.n }; F.forEach((f) => { o[f] = a.k[f] ? Math.round(a.s[f] / a.k[f] * 1000) / 1000 : null; }); return o; });
    },
  });

  dash.calc('c_por_municipio', {
    inputs: ['c_estaciones'], title: 'Media por municipio',
    description: 'Precio medio simple, mínimo y máximo de las gasolineras de cada municipio, por carburante.',
    fn: (estaciones) => {
      const F = ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'], g = new Map();
      for (const r of estaciones) {
        const cp = String(r.cod_prov).padStart(2, '0'), key = r.municipio + '|' + cp;
        let a = g.get(key);
        if (!a) { a = { clave: key, municipio: r.municipio, provincia: r.provincia, cod_prov: cp, ccaa: r.ccaa, n: 0, s: {}, k: {}, m: {}, x: {} }; F.forEach((f) => { a.s[f] = 0; a.k[f] = 0; a.m[f] = null; a.x[f] = null; }); g.set(key, a); }
        a.n++;
        for (const f of F) { const v = Number(r[f]); if (v > 0) { a.s[f] += v; a.k[f]++; a.m[f] = a.m[f] == null ? v : Math.min(a.m[f], v); a.x[f] = a.x[f] == null ? v : Math.max(a.x[f], v); } }
      }
      return [...g.values()].map((a) => { const o = { clave: a.clave, municipio: a.municipio, provincia: a.provincia, cod_prov: a.cod_prov, ccaa: a.ccaa, gasolineras: a.n }; F.forEach((f) => { o[f] = a.k[f] ? Math.round(a.s[f] / a.k[f] * 1000) / 1000 : null; o[f + '_min'] = a.m[f]; o[f + '_max'] = a.x[f]; }); return o; });
    },
  });

  dash.calc('c_marcas_ambito', {
    inputs: ['c_estaciones'], title: 'Precio por marca y ámbito',
    description: 'Para España, cada comunidad y cada provincia: las 15 marcas (rótulos) con más gasolineras (mínimo 3), su precio medio simple por carburante y la media de todo el ámbito.',
    fn: (estaciones) => {
      const F = ['diesel', 'gasolina_95', 'gasolina_98', 'diesel_premium'], groups = new Map();
      const blank = () => { const a = { n: 0, s: {}, k: {} }; F.forEach((f) => { a.s[f] = 0; a.k[f] = 0; }); return a; };
      const addTo = (a, r) => { a.n++; for (const f of F) { const v = Number(r[f]); if (v > 0) { a.s[f] += v; a.k[f]++; } } };
      const add = (nivel, ambito, nombre, r) => {
        const key = nivel + '|' + ambito; let G = groups.get(key);
        if (!G) { G = { nivel, ambito, nombre, all: blank(), b: new Map() }; groups.set(key, G); }
        addTo(G.all, r);
        const m = String(r.rotulo || '').trim().toUpperCase(); if (!m) return;
        if (!G.b.has(m)) G.b.set(m, blank());
        addTo(G.b.get(m), r);
      };
      for (const r of estaciones) { add('espana', 'es', 'España', r); add('ccaa', r.ccaa, r.ccaa, r); add('provincia', String(r.cod_prov).padStart(2, '0'), r.provincia, r); }
      const out = [];
      for (const G of groups.values()) {
        const top = [...G.b.entries()].filter((e) => e[1].n >= 3).sort((x, y) => y[1].n - x[1].n).slice(0, 15);
        for (const [m, a] of top) {
          const o = { clave: G.nivel + '|' + G.ambito + '|' + m, nivel: G.nivel, ambito: G.ambito, ambito_nombre: G.nombre, marca: m, gasolineras: a.n };
          F.forEach((f) => { o[f] = a.k[f] >= 3 ? Math.round(a.s[f] / a.k[f] * 1000) / 1000 : null; o['media_' + f] = G.all.k[f] ? Math.round(G.all.s[f] / G.all.k[f] * 1000) / 1000 : null; });
          out.push(o);
        }
      }
      return out;
    },
  });

  dash.calc('c_historico_ccaa', {
    inputs: ['c_historico_provincias'], title: 'Serie por comunidad',
    description: 'Media simple de las provincias de cada comunidad, por día y carburante.',
    fn: (historico_provincias) => {
      const g = new Map();
      for (const r of historico_provincias) {
        const v = Number(r.precio_medio); if (!(v > 0)) continue;
        const k = String(r.fecha).slice(0, 10) + '|' + r.ccaa + '|' + r.combustible;
        const a = g.get(k) || { fecha: String(r.fecha).slice(0, 10), ccaa: r.ccaa, combustible: r.combustible, s: 0, n: 0 };
        a.s += v; a.n++; g.set(k, a);
      }
      return [...g.values()].map((a) => ({ fecha: a.fecha, ccaa: a.ccaa, combustible: a.combustible, precio_medio: Math.round(a.s / a.n * 1000) / 1000 }));
    },
  });

  dash.calc('c_insights', {
    inputs: ['c_kpis', 'c_por_ccaa', 'c_marcas_ambito', 'c_por_municipio'], title: 'Claves del mercado',
    description: 'Cinco lecturas diarias: cambio semanal de gasolina 95 y diésel; diferencia diésel menos gasolina 95; comunidades extremas en gasolina 95 (sin Canarias, Ceuta y Melilla); peso de las tres marcas con más gasolineras y su precio medio ponderado de gasolina 95 frente a la media; mayor diferencia de diésel dentro de un municipio con 15 o más gasolineras. Importes para un depósito de 50 litros.',
    fn: (kpis, por_ccaa, marcas_ambito, por_municipio) => {
      const out = [], r2 = (x) => Math.round(x * 100) / 100, c1 = (x) => Math.round(x * 1000) / 10;
      const row = (o) => out.push(Object.assign({ clave: '', valor: null, valor2: null, valor3: null, valor4: null, texto1: null, texto2: null, texto3: null }, o));
      const verb = (v) => (v > 0 ? 'sube' : v < 0 ? 'baja' : 'se mantiene en');
      const k = (c) => kpis.find((r) => r.combustible === c) || {};
      const g95 = k('gasolina_95'), d = k('diesel'), g98 = k('gasolina_98'), dp = k('diesel_premium'), gap = k('diesel_menos_g95');
      if (g95.hoy != null && d.hoy != null) row({ clave: 'semana', valor: g95.var7_cts == null ? null : Math.abs(g95.var7_cts), valor2: d.var7_cts == null ? null : Math.abs(d.var7_cts), valor3: g98.hoy, valor4: dp.hoy, texto1: verb(g95.var7_cts), texto2: verb(d.var7_cts), texto3: g95.fecha });
      if (gap.hoy != null) row({ clave: 'brecha', valor: gap.hoy, valor2: gap.inicio, valor3: d.var_inicio_cts == null ? null : r2(d.var_inicio_cts * 50 / 100), texto1: d.fecha_inicio });
      const cc = por_ccaa.filter((r) => r.gasolina_95 != null && !['Canarias', 'Ceuta', 'Melilla'].includes(r.ccaa)).sort((a, b) => a.gasolina_95 - b.gasolina_95);
      const can = por_ccaa.find((r) => r.ccaa === 'Canarias');
      if (cc.length > 1) row({ clave: 'territorio', valor: c1(cc[cc.length - 1].gasolina_95 - cc[0].gasolina_95), valor2: can ? can.gasolina_95 : null, texto1: cc[cc.length - 1].ccaa, texto2: cc[0].ccaa });
      const esp = marcas_ambito.filter((r) => r.nivel === 'espana').sort((a, b) => b.gasolineras - a.gasolineras);
      const top3 = esp.slice(0, 3), all = estacionesTotal(por_ccaa);
      if (top3.length === 3 && all) {
        const n = top3.reduce((s, r) => s + r.gasolineras, 0);
        const w = top3.filter((r) => r.gasolina_95 != null), wn = w.reduce((s, r) => s + r.gasolineras, 0);
        const p = wn ? w.reduce((s, r) => s + r.gasolina_95 * r.gasolineras, 0) / wn : null, m = top3[0].media_gasolina_95;
        const diff = p != null && m != null ? c1(p - m) : null;
        row({ clave: 'marcas', valor: Math.round(n / all * 1000) / 10, valor2: diff == null ? null : Math.abs(diff), texto1: top3[0].marca + ', ' + top3[1].marca + ' y ' + top3[2].marca, texto2: diff != null && diff < 0 ? 'por debajo de' : 'por encima de' });
      }
      const pm = por_municipio.filter((r) => Number(r.gasolineras) >= 15 && r.diesel_min != null && r.diesel_max != null).map((r) => ({ r, s: r.diesel_max - r.diesel_min })).sort((a, b) => b.s - a.s);
      if (pm.length) row({ clave: 'dispersion', valor: c1(pm[0].s), valor2: r2(pm[0].s * 50), valor3: pm[0].r.gasolineras, texto1: pm[0].r.municipio, texto2: pm[0].r.provincia });
      return out;
      function estacionesTotal(rows) { return rows.reduce((s, r) => s + Number(r.gasolineras || 0), 0); }
    },
  });

  // ---------- State ----------
  const S = { fuel: 'diesel', level: 'ccaa', ccaa: null, prov: null, muni: null };
  const muniSort = { key: 'media', dir: 1 };
  const $ = (id) => document.getElementById('c-' + id);
  const ok = (id) => dash.data(id).status === 'ok';
  const rowsOf = (id) => (ok(id) ? dash.data(id).data : []);
  const failBox = (box) => { box.classList.remove('dash-skeleton'); box.replaceChildren(); const f = document.createElement('div'); f.className = 'fail'; f.textContent = 'No se pudo cargar'; box.append(f); };
  const bad = (ids) => ids.some((id) => ['error', 'connect', 'declined'].includes(dash.data(id).status));

  let geoCache = { src: null, prov: [], ccaa: [] };
  function geo() {
    const src = rowsOf('limites');
    if (geoCache.src !== src) {
      const all = src.map((r) => ({ nivel: r.nivel, codigo: String(r.codigo).padStart(2, '0'), nombre: r.nombre, ccaa: r.ccaa, geom: typeof r.geometria === 'string' ? JSON.parse(r.geometria) : r.geometria }));
      geoCache = { src, prov: all.filter((g) => g.nivel === 'provincia'), ccaa: all.filter((g) => g.nivel === 'ccaa') };
    }
    return geoCache;
  }
  let stCache = { src: null, rows: [], fecha: null };
  function stations() {
    const src = rowsOf('c_estaciones');
    if (stCache.src !== src && src.length) {
      const rows = src.map((r) => {
        const o = { id: String(r.id), municipio: r.municipio, provincia: r.provincia, cod_prov: String(r.cod_prov).padStart(2, '0'), ccaa: r.ccaa, rotulo: r.rotulo, direccion: r.direccion, lat: Number(r.lat), lon: Number(r.lon) };
        for (const f of Object.keys(FUELS)) { const v = Number(r[f]); o[f] = v > 0 ? v : null; }
        o.clave = o.municipio + '|' + o.cod_prov;
        return o;
      });
      stCache = { src, rows, fecha: String(src[0].fecha_precio).slice(0, 10) };
      const seen = new Set(), opts = [];
      for (const r of rows) { const lab = r.municipio + ' (' + r.provincia + ')'; if (!seen.has(lab)) { seen.add(lab); opts.push(lab); } }
      opts.sort((a, b) => a.localeCompare(b, 'es'));
      $('muniList').replaceChildren(...opts.map((o) => { const op = document.createElement('option'); op.value = o; return op; }));
    }
    return stCache;
  }
  const inScope = (r) => (S.muni ? r.clave === S.muni : S.prov ? r.cod_prov === S.prov : S.ccaa ? r.ccaa === S.ccaa : true);
  function scopeName() {
    if (S.muni) return S.muni.split('|')[0];
    if (S.prov) return (stations().rows.find((r) => r.cod_prov === S.prov) || {}).provincia || '';
    if (S.ccaa) return S.ccaa;
    return 'España';
  }

  function tokenColor(name, fb) {
    const el = document.createElement('span'); el.style.color = 'var(' + name + ')'; $('mapBox').append(el);
    const c = getComputedStyle(el).color; el.remove();
    try {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1;
      const ctx = cv.getContext('2d'); ctx.fillStyle = fb; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      if (d[3] > 0) return 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
    } catch (e) { /* keep fallback */ }
    return fb;
  }
  function priceScale(values) {
    const v = values.filter((x) => x != null).sort(d3.ascending);
    let lo = d3.quantileSorted(v, 0.05), mid = d3.quantileSorted(v, 0.5), hi = d3.quantileSorted(v, 0.95);
    if (lo == null) { lo = 1; mid = 1.5; hi = 2; }
    if (!(hi > lo)) { lo -= 0.01; hi += 0.01; }
    if (!(mid > lo && mid < hi)) mid = (lo + hi) / 2;
    const cs = [tokenColor('--color-ok', '#2e7d32'), tokenColor('--color-warn', '#e0a100'), tokenColor('--color-bad', '#c62828')];
    const sc = d3.scaleLinear().domain([lo, mid, hi]).range(cs).interpolate(d3.interpolateRgb).clamp(true);
    sc.lo = lo; sc.hi = hi; sc.cs = cs;
    return sc;
  }
  function showTip(tip, host, x, y, lines) {
    tip.replaceChildren(...lines.filter((l) => l[1]).map(([cls, t]) => { const d = document.createElement('div'); d.className = cls; d.textContent = t; return d; }));
    tip.style.display = 'block';
    const bw = host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14, top = y + 14;
    if (left + tw > bw) left = x - tw - 14;
    if (left < 0) left = 0;
    if (top + th > host.clientHeight) top = Math.max(0, y - th - 14);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }

  // ---------- Controls ----------
  const setFuel = (f) => { S.fuel = f; draw(); };
  $('fuelSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-fuel]'); if (b) setFuel(b.dataset.fuel); });
  $('precios').addEventListener('click', (e) => { const b = e.target.closest('button[data-fuel]'); if (b) setFuel(b.dataset.fuel); });
  $('levelSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-level]'); if (b && !b.disabled) { S.level = b.dataset.level; draw(); } });
  $('muniSearch').addEventListener('change', () => {
    const m = $('muniSearch').value.match(/^(.*) \((.*)\)$/); if (!m) return;
    const r = stations().rows.find((x) => x.municipio === m[1] && x.provincia === m[2]);
    if (r) { pickMuni(r); $('muniSearch').value = ''; }
  });
  function pickMuni(r) { S.ccaa = r.ccaa; S.prov = r.cod_prov; S.muni = r.clave; S.level = 'gasolinera'; draw(); $('mapa').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function pickCcaa(c) { S.ccaa = c; S.prov = S.muni = null; S.level = 'provincia'; draw(); }
  function setScope(level) {
    if (level === 'es') { S.ccaa = S.prov = S.muni = null; S.level = 'ccaa'; }
    if (level === 'ccaa') { S.prov = S.muni = null; S.level = 'provincia'; }
    if (level === 'prov') { S.muni = null; S.level = 'gasolinera'; }
    draw();
  }
  $('muniFilter').addEventListener('input', () => drawMuniTable());
  document.querySelectorAll('#c-muniTable th button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort; muniSort.dir = muniSort.key === k ? -muniSort.dir : (k === 'gasolineras' ? -1 : 1); muniSort.key = k; drawMuniTable();
  }));
  $('muniTable').querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (!tr) return; const r = stations().rows.find((x) => x.clave === tr.dataset.key); if (r) pickMuni(r); });
  $('cheapTable').querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (!tr) return; const r = stations().rows.find((x) => x.id === tr.dataset.key); if (r) pickMuni(r); });

  function drawControls() {
    document.querySelectorAll('#c-fuelSeg button, #c-precios button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fuel === S.fuel)));
    document.querySelectorAll('#c-levelSeg button').forEach((b) => {
      const l = b.dataset.level;
      b.disabled = (l === 'ccaa' && !!S.ccaa) || (l === 'provincia' && !!S.prov);
      b.setAttribute('aria-pressed', String(l === S.level));
    });
    const c = $('crumbs'); c.replaceChildren();
    const add = (txt, fn) => {
      if (c.childNodes.length) c.append(document.createTextNode(' › '));
      if (fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.addEventListener('click', fn); c.append(b); }
      else { const s = document.createElement('span'); s.className = 'cur'; s.textContent = txt; c.append(s); }
    };
    add('España', S.ccaa ? () => setScope('es') : null);
    if (S.ccaa) add(S.ccaa, S.prov ? () => setScope('ccaa') : null);
    if (S.prov) add((stations().rows.find((r) => r.cod_prov === S.prov) || {}).provincia || S.prov, S.muni ? () => setScope('prov') : null);
    if (S.muni) add(S.muni.split('|')[0], null);
  }

  // ---------- Map ----------
  function drawMap() {
    const box = $('mapBox'), tip = $('mapTip'), host = $('mapa');
    const need = ['c_estaciones', 'limites', 'c_por_ccaa', 'c_por_provincia'];
    if (bad(need)) { failBox(box); $('legend').replaceChildren(); return; }
    if (need.some((id) => !ok(id))) { box.classList.add('dash-skeleton'); box.replaceChildren(); $('legend').replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const G = geo(), st = stations(), fuel = S.fuel;
    const W = Math.max(280, box.clientWidth), H = Math.max(300, Math.min(660, Math.round(W * 0.74)));
    box.style.minHeight = H + 'px';
    let svg = d3.select(box).select('svg');
    if (svg.empty()) { box.replaceChildren(); svg = d3.select(box).append('svg').attr('class', 'fadein'); }
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Mapa de precios de ' + FUELS[fuel]);
    svg.selectAll('*').remove();
    svg.on('mousemove', null).on('mouseleave', null).on('click', null);

    const isCan = (g) => g.ccaa === 'Canarias';
    let projFor, ptFor, inset = null;
    if (S.prov || S.ccaa) {
      const focus = G.prov.filter((g) => (S.prov ? g.codigo === S.prov : g.ccaa === S.ccaa));
      const pr = fitProj(focus.map((g) => g.geom), 16, 16, W - 16, H - 16);
      projFor = () => pr; ptFor = (lon, lat) => pr([lon, lat]);
    } else {
      const pm = fitProj(G.prov.filter((g) => !isCan(g)).map((g) => g.geom), 12, 12, W - 12, H - 12);
      const a = pm([-1.0, 36.55]), b = pm([4.4, 34.7]);
      const ib = [[a[0], a[1]], [Math.min(W - 8, b[0]), Math.min(H - 6, b[1])]];
      const pc = fitProj(G.prov.filter(isCan).map((g) => g.geom), ib[0][0] + 6, ib[0][1] + 6, ib[1][0] - 6, ib[1][1] - 6);
      projFor = (g) => (isCan(g) ? pc : pm);
      ptFor = (lon, lat) => (lat < 30.5 && lon < -12 ? pc([lon, lat]) : pm([lon, lat]));
      inset = ib;
    }
    const gRoot = svg.append('g');
    if (inset) gRoot.append('rect').attr('x', inset[0][0]).attr('y', inset[0][1]).attr('width', inset[1][0] - inset[0][0]).attr('height', inset[1][1] - inset[0][1]).attr('fill', 'none').attr('stroke', 'var(--cds-chart-grid)').attr('rx', 4);
    const gReg = gRoot.append('g'), gLab = gRoot.append('g');
    const placed = [];
    const placeLabel = (pos, variants) => {
      if (!pos) return;
      for (const lines of variants) {
        const w = d3.max(lines, (l) => l.length) * 6.9 + 6, h = lines.length * 14;
        const bb = [pos.x - w / 2, pos.y - h / 2, pos.x + w / 2, pos.y + h / 2];
        if (bb[0] < 2 || bb[1] < 2 || bb[2] > W - 2 || bb[3] > H - 2) continue;
        if (pos.area < w * h * 0.9) continue;
        if (placed.some((p) => !(bb[2] < p[0] || bb[0] > p[2] || bb[3] < p[1] || bb[1] > p[3]))) continue;
        placed.push(bb);
        const t = gLab.append('text').attr('class', 'mlab').attr('text-anchor', 'middle').attr('x', pos.x).attr('y', pos.y - (lines.length - 1) * 7);
        lines.forEach((l, i) => t.append('tspan').attr('x', pos.x).attr('dy', i ? 14 : 4).text(l));
        return;
      }
    };
    const hover = (ev, lines) => { const [x, y] = d3.pointer(ev, host); showTip(tip, host, x, y, lines); };
    const hideTip = () => { tip.style.display = 'none'; };
    const provVals = new Map(rowsOf('c_por_provincia').map((r) => [String(r.cod_prov).padStart(2, '0'), r]));
    const ccaaVals = new Map(rowsOf('c_por_ccaa').map((r) => [r.ccaa, r]));
    const legend = $('legend'); legend.replaceChildren();

    if (S.level === 'ccaa' && !S.ccaa) {
      const feats = G.ccaa.filter((g) => ccaaVals.has(g.nombre));
      const ranked = feats.map((g) => ({ n: g.nombre, v: ccaaVals.get(g.nombre)[fuel] })).filter((d) => d.v != null).sort((p, q) => p.v - q.v);
      gReg.selectAll('path').data(feats).join('path')
        .attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', (g) => ccCol(g.nombre)).attr('stroke', '#ffffff').attr('stroke-width', 1.2).style('cursor', 'pointer')
        .on('mousemove', (ev, g) => { const r = ccaaVals.get(g.nombre); const pos = ranked.findIndex((d) => d.n === g.nombre) + 1; hover(ev, [['t1', g.nombre], ['t2', (r[fuel] == null ? '—' : fP(r[fuel]) + ' €/l') + ' · ' + fN(r.gasolineras) + ' gasolineras'], ['t1', pos ? 'Puesto ' + pos + ' de ' + ranked.length + ' (1 = más barata)' : '']]); })
        .on('mouseleave', hideTip)
        .on('click', (ev, g) => { hideTip(); pickCcaa(g.nombre); });
      feats.slice().sort((a, b) => (labelPos(projFor(b), b.geom) || { area: 0 }).area - (labelPos(projFor(a), a.geom) || { area: 0 }).area).forEach((g) => {
        const v = ccaaVals.get(g.nombre)[fuel]; if (v == null) return;
        placeLabel(labelPos(projFor(g), g.geom), [[g.nombre, fP(v)], [fP(v)]]);
      });
      legend.textContent = 'Cada comunidad tiene su color. Las etiquetas muestran el precio medio (€/l) y el ranking completo está a la derecha.';
    } else if (S.level === 'provincia' || (S.level === 'ccaa' && S.ccaa)) {
      const feats = G.prov.filter((g) => (!S.ccaa || g.ccaa === S.ccaa) && provVals.has(g.codigo));
      const toneOf = new Map();
      d3.group(feats, (g) => g.ccaa).forEach((list) => {
        const s = list.filter((g) => provVals.get(g.codigo)[fuel] != null).sort((a, b) => provVals.get(a.codigo)[fuel] - provVals.get(b.codigo)[fuel]);
        s.forEach((g, i) => toneOf.set(g.codigo, s.length > 1 ? tone(ccCol(g.ccaa), i / (s.length - 1)) : ccCol(g.ccaa)));
      });
      const ranked = feats.map((g) => ({ c: g.codigo, v: provVals.get(g.codigo)[fuel] })).filter((d) => d.v != null).sort((p, q) => p.v - q.v);
      gReg.selectAll('path').data(feats).join('path')
        .attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', (g) => toneOf.get(g.codigo) || 'var(--color-panel)').attr('stroke', '#ffffff').attr('stroke-width', 1).style('cursor', 'pointer')
        .on('mousemove', (ev, g) => { const r = provVals.get(g.codigo); const pos = ranked.findIndex((d) => d.c === g.codigo) + 1; hover(ev, [['t1', r.provincia + ' · ' + r.ccaa], ['t2', (r[fuel] == null ? '—' : fP(r[fuel]) + ' €/l') + ' · ' + fN(r.gasolineras) + ' gasolineras'], ['t1', pos ? 'Puesto ' + pos + ' de ' + ranked.length + ' (1 = más barata)' : '']]); })
        .on('mouseleave', hideTip)
        .on('click', (ev, g) => { hideTip(); S.ccaa = g.ccaa; S.prov = g.codigo; S.muni = null; S.level = 'gasolinera'; draw(); });
      if (S.ccaa) {
        const cc = G.ccaa.find((g) => g.nombre === S.ccaa);
        if (cc) gReg.append('path').attr('d', pathOf(projFor(cc), cc.geom)).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.2).style('pointer-events', 'none');
      }
      feats.map((g) => ({ g, pos: labelPos(projFor(g), g.geom) })).filter((d) => d.pos).sort((a, b) => b.pos.area - a.pos.area).forEach(({ g, pos }) => {
        const r = provVals.get(g.codigo); if (r[fuel] == null) return;
        placeLabel(pos, S.ccaa ? [[r.provincia, fP(r[fuel])], [fP(r[fuel])]] : [[fP(r[fuel])]]);
      });
      legend.textContent = 'Cada comunidad, su color; dentro, el tono más claro es la provincia más barata y el más oscuro la más cara.' + (S.ccaa ? '' : ' Las provincias pequeñas muestran su precio al pasar el ratón.');
    } else {
      const feats = G.prov.filter((g) => (S.prov ? g.codigo === S.prov : S.ccaa ? g.ccaa === S.ccaa : true));
      gReg.selectAll('path').data(feats).join('path').attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', 'var(--color-bg)').attr('stroke', (g) => ccCol(g.ccaa)).attr('stroke-width', 1);
      const scopeRows = st.rows.filter((r) => r[fuel] != null && (S.prov ? r.cod_prov === S.prov : S.ccaa ? r.ccaa === S.ccaa : true));
      const sc = priceScale(scopeRows.map((r) => r[fuel]));
      const R = S.muni ? 3.4 : S.prov ? 3.2 : S.ccaa ? 2.2 : 1.5;
      const pts = scopeRows.map((r) => { const p = ptFor(r.lon, r.lat); return { r, x: p[0], y: p[1], on: !S.muni || r.clave === S.muni }; }).sort((a, b) => (a.on === b.on ? 0 : a.on ? 1 : -1));
      gReg.append('g').selectAll('circle').data(pts).join('circle')
        .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => (S.muni && d.on ? R * 1.6 : R))
        .attr('fill', (d) => sc(d.r[fuel])).attr('fill-opacity', (d) => (d.on ? 0.9 : 0.18))
        .attr('stroke', (d) => (S.muni && d.on ? 'var(--color-fg)' : 'none')).attr('stroke-width', 0.8);
      const del = d3.Delaunay.from(pts, (d) => d.x, (d) => d.y);
      const hl = gRoot.append('circle').attr('r', R * 2.4).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).style('display', 'none');
      const near = (ev) => { const [mx, my] = d3.pointer(ev, svg.node()); const sx = W / svg.node().getBoundingClientRect().width; const i = del.find(mx, my); if (i == null || i < 0 || !pts[i]) return null; const d = pts[i]; return Math.hypot(d.x - mx, d.y - my) < 14 * sx ? d : null; };
      svg.on('mousemove', (ev) => {
        const d = near(ev);
        if (!d) { hl.style('display', 'none'); hideTip(); return; }
        hl.attr('cx', d.x).attr('cy', d.y).style('display', null);
        const others = Object.keys(FUELS).filter((f) => f !== fuel && d.r[f] != null).map((f) => FUELS[f] + ' ' + fP(d.r[f]));
        hover(ev, [['t1', d.r.municipio + ' · ' + d.r.provincia], ['t2', (d.r.rotulo || 'Sin rótulo') + ' · ' + fP(d.r[fuel]) + ' €/l'], ['t1', d.r.direccion], ['t1', others.join(' · ')]]);
      }).on('mouseleave', () => { hl.style('display', 'none'); hideTip(); })
        .on('click', (ev) => { const d = near(ev); if (d) { hideTip(); pickMuni(d.r); } });
      const a = document.createElement('span'); a.textContent = 'Más barata ' + fP(sc.lo);
      const ramp = document.createElement('span'); ramp.className = 'ramp'; ramp.style.background = 'linear-gradient(90deg,' + sc.cs.join(',') + ')';
      const b = document.createElement('span'); b.textContent = fP(sc.hi) + ' más cara (€/l) · ' + fN(scopeRows.length) + ' gasolineras';
      legend.append(a, ramp, b);
    }
    const fecha = st.fecha ? fDL(day(st.fecha)) : '';
    const lv = S.level === 'gasolinera' ? 'por gasolinera' : (S.level === 'provincia' || S.ccaa) ? 'por provincia' : 'por comunidad';
    $('mapTitle').textContent = FUELS[fuel] + ' · precio medio ' + lv + ' · ' + scopeName();
    $('mapNote').textContent = (fecha ? 'Precios del ' + fecha + '. ' : '') + (S.level === 'gasolinera' ? 'Pulsa un punto para ver su municipio.' : 'Pulsa una zona para bajar de nivel.');
  }

  // ---------- CCAA ranking ----------
  function drawCcaa() {
    const box = $('ccaaBox'), tip = $('ccaaTip'), host = $('ranking-ccaa'), fuel = S.fuel;
    if (bad(['c_por_ccaa', 'c_media_hoy'])) { failBox(box); return; }
    if (!ok('c_por_ccaa')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const rows = rowsOf('c_por_ccaa').filter((r) => r[fuel] != null).slice().sort((a, b) => a[fuel] - b[fuel]);
    const esp = (rowsOf('c_media_hoy').find((r) => r.combustible === fuel) || {}).media;
    const W = Math.max(260, box.clientWidth), top = 26, n = Math.max(1, rows.length);
    // Match the map's height when both sit side by side
    let H = n * 28 + top + 8;
    if (window.matchMedia('(min-width: 1100px)').matches) {
      box.style.minHeight = '0px'; box.replaceChildren();
      const mapH = $('mapa').getBoundingClientRect().height;
      const used = box.getBoundingClientRect().top - host.getBoundingClientRect().top + parseFloat(getComputedStyle(host).paddingBottom || '0') + 2;
      if (mapH - used > H) H = Math.floor(mapH - used);
    }
    const rh = (H - top - 8) / n, big = rh >= 30;
    box.style.minHeight = H + 'px'; box.replaceChildren();
    if (!rows.length) return;
    const fs = big ? 'var(--cds-font-size-body)' : 'var(--cds-font-size-caption)';
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const meas = svg.append('g').attr('font-size', fs);
    const tw = (t, w) => { const t2 = meas.append('text').attr('font-weight', w || null).text(t); const v = t2.node().getComputedTextLength(); t2.remove(); return v; };
    const badge = Math.min(22, rh * 0.75);
    const ml = Math.min(W * 0.46, d3.max(rows, (r) => tw(r.ccaa, 600)) + badge + 18), mr = tw('0,000', 700) + 14;
    meas.remove();
    const vals = rows.map((r) => r[fuel]).concat(esp != null ? [esp] : []);
    const ext = d3.extent(vals), base = ext[0] - Math.max(0.01, (ext[1] - ext[0]) * 0.35);
    const x = d3.scaleLinear([base, ext[1]], [ml, W - mr]);
    const g = svg.append('g');
    const barH = Math.max(8, rh * 0.62);
    const rg = g.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (r, i) => `translate(0,${top + i * rh + rh / 2})`).style('cursor', 'pointer');
    rg.append('rect').attr('x', 0).attr('y', -rh / 2).attr('width', W).attr('height', rh).attr('rx', 6).attr('fill', (r) => (r.ccaa === S.ccaa ? 'var(--cds-surface-popover)' : 'transparent'));
    rg.append('circle').attr('cx', badge / 2 + 2).attr('r', badge / 2).attr('fill', (r) => ccCol(r.ccaa));
    rg.append('text').attr('x', badge / 2 + 2).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 'var(--cds-font-size-caption)').attr('font-weight', 700).text((r, i) => i + 1);
    rg.append('text').attr('x', ml - 10).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').attr('font-size', fs).attr('font-weight', (r) => (r.ccaa === S.ccaa ? 700 : 600)).text((r) => r.ccaa);
    rg.append('rect').attr('x', ml).attr('y', -barH / 2).attr('height', barH).attr('rx', Math.min(6, barH / 2))
      .attr('width', (r) => Math.max(3, x(r[fuel]) - ml)).attr('fill', (r) => ccCol(r.ccaa)).attr('fill-opacity', (r) => (!S.ccaa || r.ccaa === S.ccaa ? 0.92 : 0.35));
    rg.append('text').attr('x', (r) => x(r[fuel]) + 7).attr('dy', '0.35em').attr('fill', 'var(--color-fg)').attr('font-size', fs).attr('font-weight', 700).attr('font-variant-numeric', 'tabular-nums').text((r) => fP(r[fuel]));
    if (esp != null) {
      g.append('line').attr('x1', x(esp)).attr('x2', x(esp)).attr('y1', top - 6).attr('y2', H - 4).attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
      const lab = 'España ' + fP(esp) + ' €/l';
      const lw = lab.length * 7;
      const lx = Math.min(Math.max(x(esp), ml + lw / 2), W - lw / 2 - 2);
      g.append('text').attr('x', lx).attr('y', 14).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)').attr('font-size', 'var(--cds-font-size-caption)').attr('font-weight', 700).text(lab);
    }
    rg.on('mousemove', (ev, r) => { const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, [['t1', r.ccaa], ['t2', fP(r[fuel]) + ' €/l · ' + fN(r.gasolineras) + ' gasolineras'], ['t1', esp != null ? fC((r[fuel] - esp) * 100) + ' cts frente a España' : '']]); })
      .on('mouseleave', () => { tip.style.display = 'none'; })
      .on('click', (ev, r) => { tip.style.display = 'none'; pickCcaa(r.ccaa); });
    $('ccaaNote').textContent = FUELS[fuel] + ' · de más barata a más cara. Las barras empiezan en ' + fP(base) + ' €/l para que se aprecien las diferencias. Pulsa una comunidad para verla en el mapa.';
  }

  // ---------- Brands ----------
  function drawBrands() {
    const box = $('brandBox'), fuel = S.fuel;
    if (bad(['c_marcas_ambito'])) { failBox(box); $('brandCall').textContent = ''; return; }
    if (!ok('c_marcas_ambito')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const nivel = S.prov ? 'provincia' : S.ccaa ? 'ccaa' : 'espana', amb = S.prov ? S.prov : S.ccaa ? S.ccaa : 'es';
    const rows = rowsOf('c_marcas_ambito').filter((r) => r.nivel === nivel && String(r.ambito) === String(amb) && r[fuel] != null).slice().sort((a, b) => a[fuel] - b[fuel]);
    const name = rows.length ? rows[0].ambito_nombre : scopeName();
    $('brandTitle').textContent = 'Precio por marca · ' + name;
    box.replaceChildren();
    if (!rows.length) { $('brandCall').textContent = ''; $('brandNote').textContent = 'No hay marcas con al menos tres gasolineras en este ámbito.'; box.style.minHeight = '60px'; return; }
    const media = rows[0]['media_' + fuel];
    $('brandNote').textContent = FUELS[fuel] + ' · las ' + rows.length + ' marcas con más gasolineras en ' + name + ', de más barata a más cara, frente a la media del ámbito (' + fP(media) + ' €/l).';
    const cheap = rows[0], dear = rows[rows.length - 1];
    const call = $('brandCall'); call.replaceChildren();
    const b = (t) => { const e = document.createElement('b'); e.textContent = t; return e; };
    call.append('Entre ', b(dear.marca), ' y ', b(cheap.marca), ' hay ', b(fC0((dear[fuel] - cheap[fuel]) * 100) + ' cts/l'), ' · ', b(fE((dear[fuel] - cheap[fuel]) * 50) + ' €'), ' por depósito de 50 l');
    const W = Math.max(300, box.clientWidth), rh = 25, top = 24, H = rows.length * rh + top + 4;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const fsz = 'var(--cds-font-size-caption)';
    const meas = svg.append('g').attr('font-size', fsz);
    const tw = (t, w) => { const n = meas.append('text').attr('font-weight', w || null).text(t); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const narrow = W < 520;
    const ml = Math.min(W * 0.3, d3.max(rows, (r) => tw(r.marca, 600)) + 14);
    const mr = narrow ? tw('0,000', 700) + 12 : tw('0,000 €/l', 700) + tw('  +00,0 cts', 400) + tw('  0.000 est.') + 20;
    meas.remove();
    const maxAbs = Math.max(1, d3.max(rows, (r) => Math.abs(r[fuel] - media) * 100));
    const x = d3.scaleLinear([-maxAbs, maxAbs], [ml, W - mr]).nice();
    const okC = tokenColor('--color-ok', '#2e7d32'), badC = tokenColor('--color-bad', '#c62828');
    const g = svg.append('g');
    // zebra rows and grid
    g.selectAll('rect.z').data(rows).join('rect').attr('x', 0).attr('width', W).attr('y', (r, i) => top + i * rh).attr('height', rh).attr('rx', 6)
      .attr('fill', (r, i) => (i % 2 ? 'transparent' : 'color-mix(in srgb, var(--color-fg) 3.5%, transparent)'));
    const ticks = x.ticks(narrow ? 4 : 6).filter((t) => t !== 0);
    g.selectAll('line.gr').data(ticks).join('line').attr('x1', x).attr('x2', x).attr('y1', top).attr('y2', H - 4).attr('stroke', 'var(--cds-chart-grid)');
    g.selectAll('text.gt').data(ticks).join('text').attr('x', x).attr('y', 12).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', fsz).text((t) => fC(t));
    g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', top - 4).attr('y2', H - 4).attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.2);
    g.append('text').attr('x', x(0)).attr('y', 12).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)').attr('font-weight', 700).attr('font-size', fsz).text('Media');
    const rg = g.selectAll('g.r').data(rows).join('g').attr('transform', (r, i) => `translate(0,${top + i * rh + rh / 2})`);
    const dx = (r) => (r[fuel] - media) * 100, col = (r) => (r[fuel] <= media ? okC : badC);
    rg.append('text').attr('x', ml - 10).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').attr('font-size', fsz).attr('font-weight', 600).text((r) => r.marca);
    rg.append('rect').attr('x', (r) => Math.min(x(0), x(dx(r)))).attr('y', -5).attr('height', 10).attr('rx', 5)
      .attr('width', (r) => Math.max(2, Math.abs(x(dx(r)) - x(0)))).attr('fill', col).attr('fill-opacity', 0.35);
    rg.append('circle').attr('cx', (r) => x(dx(r))).attr('r', 6).attr('fill', col).attr('stroke', 'var(--color-panel)').attr('stroke-width', 2);
    const t = rg.append('text').attr('x', W - mr + 12).attr('dy', '0.35em').attr('font-size', fsz).attr('font-variant-numeric', 'tabular-nums');
    t.append('tspan').attr('fill', 'var(--color-fg)').attr('font-weight', 700).text((r) => fP(r[fuel]) + (narrow ? '' : ' €/l'));
    if (!narrow) {
      t.append('tspan').attr('fill', col).attr('font-weight', 600).text((r) => '  ' + fC(dx(r)) + ' cts');
      t.append('tspan').attr('fill', 'var(--color-fg-muted)').text((r) => '  ' + fN(r.gasolineras) + ' est.');
    }
  }

  // ---------- Trend ----------
  function drawTrend() {
    const box = $('trendBox'), tip = $('trendTip'), host = $('evolucion'), fuel = S.fuel;
    if (bad(['c_historico_espana', 'c_historico_provincias', 'c_historico_ccaa'])) { failBox(box); return; }
    if (!ok('c_historico_espana')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    let src = rowsOf('c_historico_espana'), where = 'España';
    if (S.prov && ok('c_historico_provincias')) { const p = rowsOf('c_historico_provincias').filter((r) => String(r.cod_prov).padStart(2, '0') === S.prov); if (p.length) { src = p; where = p[0].provincia; } }
    else if (S.ccaa && ok('c_historico_ccaa')) { const p = rowsOf('c_historico_ccaa').filter((r) => r.ccaa === S.ccaa); if (p.length) { src = p; where = S.ccaa; } }
    const pal = dash.colors || [], FC = { diesel: pal[0] || '#2f6fd6', gasolina_95: pal[1] || '#e07b1f', gasolina_98: pal[2] || '#2e9e5b', diesel_premium: pal[3] || '#8b5cf6' };
    const series = Object.keys(FUELS).map((f) => ({ f, name: FUELS[f], sel: f === fuel, pts: src.filter((r) => r.combustible === f).map((r) => ({ d: day(r.fecha), v: Number(r.precio_medio) })).filter((p) => p.v > 0).sort((a, b) => a.d - b.d) })).filter((s) => s.pts.length);
    series.sort((a, b) => (a.sel === b.sel ? 0 : a.sel ? 1 : -1));
    const all = series.flatMap((s) => s.pts);
    const W = Math.max(260, box.clientWidth);
    let H = 300;
    // Match the neighbouring card's height when both sit side by side
    box.style.minHeight = '0px'; box.replaceChildren();
    const nb = $('baratas'), hr = host.getBoundingClientRect(), nr = nb.getBoundingClientRect();
    if (Math.abs(hr.top - nr.top) < 4 && Math.abs(hr.left - nr.left) > 20) {
      const used = box.getBoundingClientRect().top - hr.top + parseFloat(getComputedStyle(host).paddingBottom || '0') + 2;
      H = Math.max(300, Math.floor(nr.height - used));
    }
    box.style.minHeight = H + 'px';
    if (!all.length) return;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const y = d3.scaleLinear(d3.extent(all, (p) => p.v), [H - 28, 12]).nice();
    const meas = svg.append('g').attr('font-size', 'var(--cds-font-size-caption)');
    const tw = (t, w) => { const n = meas.append('text').attr('font-weight', w || null).text(t); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const yt = y.ticks(H > 420 ? 8 : 5), ytl = (t) => fP(t).replace(/0$/, '');
    const ml = d3.max(yt, (t) => tw(ytl(t))) + 10;
    const lab = (s) => s.name + ' ' + fP(s.pts[s.pts.length - 1].v);
    const mr = Math.min(W * 0.42, d3.max(series, (s) => tw(lab(s), 700)) + 12);
    meas.remove();
    const x = d3.scaleUtc(d3.extent(all, (p) => p.d), [ml, W - mr]);
    const g = svg.append('g');
    g.selectAll('line.gr').data(yt).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    g.selectAll('text.yt').data(yt).join('text').attr('x', ml - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text(ytl);
    const xt = x.ticks(Math.min(6, Math.max(2, Math.floor((W - ml - mr) / 80))));
    g.selectAll('text.xt').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((d) => fD(d));
    const ln = d3.line().x((p) => x(p.d)).y((p) => y(p.v));
    series.forEach((s) => g.append('path').attr('d', ln(s.pts)).attr('fill', 'none').attr('stroke', FC[s.f]).attr('stroke-width', s.sel ? 3.5 : 1.5).attr('stroke-opacity', s.sel ? 1 : 0.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round'));
    const ends = series.map((s) => ({ s, y: y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    const over = ends.length ? ends[ends.length - 1].y - (H - 30) : 0;
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    ends.forEach((e) => g.append('text').attr('x', W - mr + 8).attr('y', e.y).attr('dy', '0.32em').attr('fill', e.s.sel ? FC[e.s.f] : 'var(--color-fg-muted)').attr('font-weight', e.s.sel ? 700 : 400).attr('font-size', 'var(--cds-font-size-caption)').style('cursor', 'pointer').text(lab(e.s)).on('click', () => setFuel(e.s.f)));
    const rule = g.append('line').attr('y1', 12).attr('y2', H - 28).attr('stroke', 'var(--cds-chart-reference)').style('display', 'none');
    const dots = series.map((s) => g.append('circle').attr('r', s.sel ? 4.5 : 3).attr('fill', FC[s.f]).style('display', 'none'));
    const bis = d3.bisector((p) => p.d).center;
    const ref = series[series.length - 1];
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', H).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const p0 = ref.pts[bis(ref.pts, x.invert(mx))]; if (!p0) return;
        rule.attr('x1', x(p0.d)).attr('x2', x(p0.d)).style('display', null);
        const lines = [['t1', fDL(p0.d) + ' · ' + where]];
        series.slice().reverse().forEach((s) => { const i = series.indexOf(s); const p = s.pts[bis(s.pts, p0.d)]; if (p) { dots[i].attr('cx', x(p.d)).attr('cy', y(p.v)).style('display', null); lines.push(['t2', s.name + ': ' + fP(p.v) + ' €/l']); } });
        const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, lines);
      })
      .on('mouseleave', () => { rule.style('display', 'none'); dots.forEach((d) => d.style('display', 'none')); tip.style.display = 'none'; });
    $('trendNote').textContent = 'Los cuatro carburantes en ' + where + ' · media diaria con impuestos, €/l. Resaltado: ' + FUELS[fuel] + ' (pulsa un nombre para cambiarlo).';
  }

  // ---------- Top 10 ----------
  let topMin = 3;
  $('minSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-min]'); if (b) { topMin = Number(b.dataset.min); drawTop(); } });
  ['topCheap', 'topDear'].forEach((id) => $(id).querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (!tr) return; const r = stations().rows.find((x) => x.clave === tr.dataset.key); if (r) pickMuni(r); }));
  function drawTop() {
    const fuel = S.fuel;
    document.querySelectorAll('#c-minSeg button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.min) === topMin)));
    document.querySelectorAll('#c-top10 th.topf').forEach((th) => { th.dataset.field = fuel; });
    const tbC = $('topCheap').querySelector('tbody'), tbD = $('topDear').querySelector('tbody');
    if (!ok('c_por_municipio')) { tbC.replaceChildren(); tbD.replaceChildren(); return; }
    const rows = rowsOf('c_por_municipio').filter((r) => r[fuel] != null && Number(r.gasolineras) >= topMin && (S.prov ? String(r.cod_prov).padStart(2, '0') === S.prov : S.ccaa ? r.ccaa === S.ccaa : true)).sort((a, b) => a[fuel] - b[fuel]);
    const cheap = rows.slice(0, 10), dear = rows.slice(-10).reverse();
    const lo = cheap.length ? cheap[0][fuel] : 0, hi = dear.length ? dear[0][fuel] : 1;
    const base = lo - Math.max(0.01, (hi - lo) * 0.15);
    const td = (cls, ...kids) => { const e = document.createElement('td'); if (cls) e.className = cls; e.append(...kids); return e; };
    const span = (cls, t) => { const e = document.createElement('span'); e.className = cls; e.textContent = t; return e; };
    const fill = (tb, list) => {
      const frag = document.createDocumentFragment();
      list.forEach((r, i) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.clave;
        const bar = document.createElement('span'); bar.className = 'pbar'; const inner = document.createElement('span');
        inner.style.width = Math.max(4, Math.min(100, (r[fuel] - base) / ((hi - base) || 1) * 100)) + '%'; bar.append(inner);
        const pw = document.createElement('div'); pw.className = 'pwrap'; pw.append(bar, span('pval', fP(r[fuel])));
        tr.append(td('', span('rank', String(i + 1))), td('mun', r.municipio), td('prov', r.provincia), td('num prov', fN(r.gasolineras)), td('num price', pw));
        frag.append(tr);
      });
      tb.replaceChildren(frag);
    };
    fill(tbC, cheap); fill(tbD, dear);
    const avg = (l) => (l.length ? 'media del top: ' + fP(d3.mean(l, (r) => r[fuel])) + ' €/l' : '');
    $('avgCheap').textContent = avg(cheap); $('avgDear').textContent = avg(dear);
    $('topTitle').textContent = 'Top 10 municipios · ' + FUELS[fuel] + ' · ' + (S.muni ? (stations().rows.find((r) => r.clave === S.muni) || {}).provincia || scopeName() : scopeName());
    const gap = cheap.length && dear.length ? (dear[0][fuel] - cheap[0][fuel]) * 100 : null;
    $('topNote').textContent = 'Precio medio por municipio entre ' + fN(rows.length) + ' municipios' + (topMin > 1 ? ' con ' + topMin + ' o más gasolineras' : '') + (gap != null ? '. Del más barato al más caro hay ' + fC0(gap) + ' céntimos por litro' : '') + '. Pulsa una fila para verlo en el mapa.';
  }

  // ---------- Tables ----------
  const mkTd = (cls, ...kids) => { const e = document.createElement('td'); if (cls) e.className = cls; e.append(...kids); return e; };
  const mkSpan = (cls, t) => { const e = document.createElement('span'); e.className = cls; e.textContent = t; return e; };
  const priceCell = (v, pct) => {
    const bar = document.createElement('span'); bar.className = 'pbar'; const inner = document.createElement('span');
    inner.style.width = Math.max(4, Math.min(100, pct)) + '%'; bar.append(inner);
    const pw = document.createElement('div'); pw.className = 'pwrap'; pw.append(bar, mkSpan('pval', fP(v)));
    return mkTd('num price', pw);
  };
  function drawMuniTable() {
    const tb = $('muniTable').querySelector('tbody'), fuel = S.fuel;
    $('thMedia').dataset.field = fuel; $('thMin').dataset.field = fuel + '_min'; $('thMax').dataset.field = fuel + '_max';
    if (!ok('c_por_municipio')) { tb.replaceChildren(); return; }
    const q = $('muniFilter').value.trim().toLowerCase();
    const scoped = rowsOf('c_por_municipio').filter((r) => r[fuel] != null && (S.prov ? String(r.cod_prov).padStart(2, '0') === S.prov : S.ccaa ? r.ccaa === S.ccaa : true));
    let rows = q ? scoped.filter((r) => (r.municipio + ' ' + r.provincia).toLowerCase().includes(q)) : scoped;
    const k = muniSort.key, dir = muniSort.dir;
    const val = (r) => (k === 'media' ? r[fuel] : k === 'min' ? r[fuel + '_min'] : k === 'max' ? r[fuel + '_max'] : r[k]);
    rows = rows.slice().sort((a, b) => { const va = val(a), vb = val(b); return (typeof va === 'string' ? va.localeCompare(vb, 'es') : va - vb) * dir; });
    document.querySelectorAll('#c-muniTable th').forEach((th) => { const bt = th.querySelector('button'); if (bt) th.setAttribute('aria-sort', bt.dataset.sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    const sc = priceScale(scoped.map((r) => r[fuel]));
    const ext = d3.extent(scoped, (r) => r[fuel]); const base = ext[0] - Math.max(0.01, ((ext[1] - ext[0]) || 0.1) * 0.1);
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.clave; tr.style.setProperty('--tc', sc(r[fuel]));
      if (S.muni === r.clave) tr.style.background = 'var(--cds-surface-popover)';
      tr.append(mkTd('', mkSpan('rank', String(i + 1))), mkTd('mun', r.municipio), mkTd('prov', r.provincia), mkTd('num prov', fN(r.gasolineras)),
        priceCell(r[fuel], (r[fuel] - base) / ((ext[1] - base) || 1) * 100),
        mkTd('num pmuted', r[fuel + '_min'] == null ? '—' : fP(r[fuel + '_min'])), mkTd('num pmuted', r[fuel + '_max'] == null ? '—' : fP(r[fuel + '_max'])));
      frag.append(tr);
    });
    tb.replaceChildren(frag);
    $('muniHead').textContent = fN(rows.length) + ' municipios · ' + scopeName();
    $('muniLegend').textContent = 'verde: más barato · rojo: más caro';
    $('muniNote').textContent = FUELS[fuel] + ' · precio medio, mínimo y máximo en cada municipio de ' + scopeName() + '. Ordena por cualquier columna y pulsa una fila para verla en el mapa.';
  }
  function drawCheap() {
    const tb = $('cheapTable').querySelector('tbody'), fuel = S.fuel;
    $('thCheap').dataset.field = fuel;
    if (!ok('c_estaciones')) { tb.replaceChildren(); return; }
    const scoped = stations().rows.filter((r) => r[fuel] != null && inScope(r));
    const rows = scoped.slice().sort((a, b) => a[fuel] - b[fuel]).slice(0, 15);
    const lo = rows.length ? rows[0][fuel] : 0, hi = rows.length ? rows[rows.length - 1][fuel] : 1, base = lo - Math.max(0.01, (hi - lo) * 0.3);
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.id;
      tr.append(mkTd('', mkSpan('rank', String(i + 1))), mkTd('mun', r.rotulo || '—'), mkTd('prov', r.municipio), mkTd('addr', r.direccion || '—'), priceCell(r[fuel], (r[fuel] - base) / ((hi - base) || 1) * 100));
      frag.append(tr);
    });
    tb.replaceChildren(frag);
    $('cheapHead').textContent = 'Las ' + rows.length + ' más baratas · ' + scopeName();
    $('avgStations').textContent = scoped.length ? 'media del ámbito: ' + fP(d3.mean(scoped, (r) => r[fuel])) + ' €/l' : '';
    $('cheapNote').textContent = FUELS[fuel] + ' · las ' + rows.length + ' gasolineras más baratas de ' + scopeName() + '. Pulsa una para ver su municipio.';
  }

  // ---------- News ----------
  function drawNews() {
    const box = $('newsBox');
    if (bad(['c_noticias'])) { failBox(box); return; }
    if (!ok('c_noticias')) { box.classList.add('dash-skeleton'); return; }
    box.classList.remove('dash-skeleton');
    const rows = rowsOf('c_noticias').slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    box.replaceChildren(...rows.map((r) => {
      const art = document.createElement('article');
      const meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = fDL(day(r.fecha)) + ' · ' + r.medio;
      const h = document.createElement('h3'); h.textContent = r.titular;
      const p = document.createElement('p'); p.textContent = r.resumen;
      art.append(meta, h);
      if (r.resumen) art.append(p);
      if (/^https:\/\//.test(String(r.url))) { const a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'Leer en ' + r.medio + ' ↗'; art.append(a); }
      return art;
    }));
  }

  // ---------- Marked text ----------
  function fillMarks(src) {
    const marks = document.querySelectorAll('[data-source="' + src + '"][data-field]');
    const st = dash.data(src).status;
    if (st !== 'ok') { marks.forEach((m) => { m.textContent = '—'; m.classList.toggle('dash-skeleton', st === 'loading'); }); return; }
    const rows = rowsOf(src);
    marks.forEach((m) => {
      m.classList.remove('dash-skeleton');
      const [k, want] = (m.dataset.where || '').split('=');
      const r = rows.find((x) => String(x[k]) === decodeURIComponent(want || '')); const v = r ? r[m.dataset.field] : null;
      if (v == null || v === '') { m.textContent = '—'; return; }
      const f = m.dataset.fmt;
      m.textContent = f === 'p' ? fP(v) : f === 'c' ? fC0(Math.abs(v)) : f === 'c0' ? fC0(v) : f === 'sc' ? fC(v) : f === 'eur' ? fE(Math.abs(v)) : f === 'n' ? fN(v) : f === 'd' ? fD(day(v)) : f === 'dl' ? fDL(day(v)) : String(v);
      if (m.dataset.trend) { m.classList.toggle('up', v > 0); m.classList.toggle('down', v < 0); }
    });
  }
  function drawText() {
    fillMarks('c_kpis'); fillMarks('c_insights');
    const rows = rowsOf('c_kpis');
    const d = rows.find((x) => x.combustible === 'diesel'), gap = rows.find((x) => x.combustible === 'diesel_menos_g95');
    $('tw-dir').textContent = d && d.var_inicio_cts < 0 ? 'ha bajado' : 'ha subido';
    $('tw-gap').textContent = gap && gap.hoy < 0 ? 'queda por debajo de' : 'supera';
  }

  function draw() {
    stations(); drawControls(); drawText(); drawMap(); drawCcaa(); drawBrands(); drawCheap(); drawTrend(); drawTop(); drawMuniTable(); drawNews();
  }
  dash.onData(draw);
  (window.__views = window.__views || {}).carb = draw;
  window.__views.carbPick = (f) => { S.fuel = f; };
})();
