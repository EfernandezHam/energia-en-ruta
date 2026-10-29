
(() => {
  const TIPOS = { todas: 'Todas', ultra: 'Ultrarrápida', rapida: 'Rápida', lenta: 'Lenta y semirrápida' };
  const TK = ['todas', 'ultra', 'rapida', 'lenta'];
  const TCOL = { ultra: '#7c3aed', rapida: '#0ea5e9', lenta: '#22a35a', todas: '#e07b1f' };
  const CC_COL = {
    'Catalunya': '#2f6fd6', 'Aragón': '#e07b1f', 'C. Valenciana': '#e3b505', 'Murcia': '#b9461b', 'Andalucía': '#2e9e5b',
    'Extremadura': '#7d9a2a', 'Castilla-La Mancha': '#8b5cf6', 'Madrid': '#dc2f45', 'Castilla y León': '#a26a2a', 'Galicia': '#0f8fa8',
    'Asturias': '#d4508f', 'Cantabria': '#5fa31a', 'País Vasco': '#b3233f', 'Navarra': '#4f46c8', 'La Rioja': '#2aa6d6',
    'Illes Balears': '#14b8a6', 'Canarias': '#f2a20c', 'Ceuta': '#64748b', 'Melilla': '#7c8aa0',
  };
  const ccCol = (c) => CC_COL[c] || '#888888';
  const tone = (base, t) => d3.interpolateRgb(d3.interpolateRgb(base, '#ffffff')(0.55), d3.interpolateRgb(base, '#000000')(0.35))(t);

  const nf = (o) => new Intl.NumberFormat('es-ES', o);
  const fN0 = nf({ maximumFractionDigits: 0, useGrouping: 'always' }), fS0 = nf({ maximumFractionDigits: 0, useGrouping: 'always', signDisplay: 'exceptZero' }), fD1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' });
  const fN = (v) => fN0.format(v), fS = (v) => fS0.format(v), f1 = (v) => fD1.format(v);
  const dS = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }), dL = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fD = (d) => dS.format(d).replace('.', ''), fDL = (d) => dL.format(d);
  const day = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
  const cp2 = (v) => String(v).padStart(2, '0'), ine5 = (v) => String(v).padStart(5, '0');

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
  dash.calc('e_kpis', {
    inputs: ['e_estaciones', 'e_historico_provincias', 'e_poblacion'], title: 'Resumen España',
    description: 'Por tipo de carga: estaciones y puntos hoy, su peso sobre el total, puntos por 100.000 habitantes y cambio en estaciones y puntos entre el primer y el último día de la serie.',
    fn: (estaciones, historico_provincias, poblacion) => {
      const pop = poblacion.reduce((s, r) => s + Number(r.poblacion), 0);
      const fecha = estaciones.length ? String(estaciones[0].fecha).slice(0, 10) : null;
      const dias = [...new Set(historico_provincias.map((r) => String(r.fecha).slice(0, 10)))].sort();
      const fin = dias[dias.length - 1], lim = fin ? new Date(Date.parse(fin) - 30 * 864e5).toISOString().slice(0, 10) : null, ini = dias.find((d) => d >= lim) || dias[0]; // ventana del último mes
      const tot = (t, f, col) => historico_provincias.filter((r) => String(r.fecha).slice(0, 10) === f && (t === 'todas' || r.tipo === t)).reduce((s, r) => s + Number(r[col]), 0);
      const allP = estaciones.reduce((s, r) => s + Number(r.puntos), 0), allE = estaciones.length;
      return ['todas', 'ultra', 'rapida', 'lenta'].map((t) => {
        const rows = t === 'todas' ? estaciones : estaciones.filter((r) => r.tipo === t);
        const p = rows.reduce((s, r) => s + Number(r.puntos), 0);
        return { tipo: t, fecha, fecha_inicio: ini, estaciones: rows.length, puntos: p,
          pct_puntos: allP ? Math.round(p / allP * 1000) / 10 : null, pct_est: allE ? Math.round(rows.length / allE * 1000) / 10 : null,
          por100k: pop ? Math.round(p / pop * 1e6) / 10 : null,
          var_est: tot(t, fin, 'estaciones') - tot(t, ini, 'estaciones'), var_puntos: tot(t, fin, 'puntos') - tot(t, ini, 'puntos') };
      });
    },
  });

  dash.calc('e_por_ccaa', {
    inputs: ['e_estaciones', 'e_poblacion'], title: 'Recarga por comunidad',
    description: 'Estaciones, puntos y puntos por 100.000 habitantes de cada comunidad autónoma, por tipo de carga.',
    fn: (estaciones, poblacion) => {
      const g = new Map();
      for (const r of poblacion) { const a = g.get(r.ccaa) || { ccaa: r.ccaa, poblacion: 0 }; a.poblacion += Number(r.poblacion); g.set(r.ccaa, a); }
      for (const a of g.values()) for (const t of ['todas', 'ultra', 'rapida', 'lenta']) { a['est_' + t] = 0; a['pts_' + t] = 0; }
      for (const r of estaciones) { const a = g.get(r.ccaa); if (!a) continue; for (const t of ['todas', r.tipo]) { a['est_' + t]++; a['pts_' + t] += Number(r.puntos); } }
      return [...g.values()].map((a) => { for (const t of ['todas', 'ultra', 'rapida', 'lenta']) a['dens_' + t] = Math.round(a['pts_' + t] / a.poblacion * 1e6) / 10; return a; });
    },
  });

  dash.calc('e_por_provincia', {
    inputs: ['e_estaciones', 'e_poblacion'], title: 'Recarga por provincia',
    description: 'Estaciones, puntos y puntos por 100.000 habitantes de cada provincia, por tipo de carga.',
    fn: (estaciones, poblacion) => {
      const g = new Map();
      for (const r of poblacion) { const a = { cod_prov: String(r.cod_prov).padStart(2, '0'), provincia: r.provincia, ccaa: r.ccaa, poblacion: Number(r.poblacion) }; for (const t of ['todas', 'ultra', 'rapida', 'lenta']) { a['est_' + t] = 0; a['pts_' + t] = 0; } g.set(a.cod_prov, a); }
      for (const r of estaciones) { const a = g.get(String(r.cod_prov).padStart(2, '0')); if (!a) continue; for (const t of ['todas', r.tipo]) { a['est_' + t]++; a['pts_' + t] += Number(r.puntos); } }
      return [...g.values()].map((a) => { for (const t of ['todas', 'ultra', 'rapida', 'lenta']) a['dens_' + t] = Math.round(a['pts_' + t] / a.poblacion * 1e6) / 10; return a; });
    },
  });

  dash.calc('e_territorios', {
    inputs: ['e_por_ccaa', 'e_por_provincia'], title: 'Recarga por territorio',
    description: 'Comunidades y provincias juntas: estaciones y puntos por tipo de carga, puntos por 100.000 habitantes y porcentaje de los puntos de España.',
    fn: (por_ccaa, por_provincia) => {
      const total = por_ccaa.reduce((s, r) => s + r.pts_todas, 0);
      const pick = (r) => ({ est_todas: r.est_todas, pts_todas: r.pts_todas, pts_ultra: r.pts_ultra, pts_rapida: r.pts_rapida, pts_lenta: r.pts_lenta, dens_todas: r.dens_todas, poblacion: r.poblacion, cuota: total ? Math.round(r.pts_todas / total * 1000) / 10 : null });
      return por_ccaa.map((r) => Object.assign({ clave: 'ccaa|' + r.ccaa, nivel: 'ccaa', codigo: r.ccaa, nombre: r.ccaa, ccaa: r.ccaa }, pick(r)))
        .concat(por_provincia.map((r) => Object.assign({ clave: 'provincia|' + r.cod_prov, nivel: 'provincia', codigo: r.cod_prov, nombre: r.provincia, ccaa: r.ccaa }, pick(r))));
    },
  });

  dash.calc('e_por_municipio', {
    inputs: ['e_estaciones'], title: 'Recarga por municipio',
    description: 'Estaciones y puntos de cada municipio por tipo de carga, potencia máxima media y máxima de sus estaciones (kW) y número de operadores.',
    fn: (estaciones) => {
      const g = new Map();
      for (const r of estaciones) {
        const k = String(r.cod_ine).padStart(5, '0');
        let a = g.get(k);
        if (!a) { a = { cod_ine: k, municipio: r.municipio, provincia: r.provincia, cod_prov: String(r.cod_prov).padStart(2, '0'), ccaa: r.ccaa, kw_s: 0, kw_max: 0, ops: new Set() }; for (const t of ['todas', 'ultra', 'rapida', 'lenta']) { a['est_' + t] = 0; a['pts_' + t] = 0; } g.set(k, a); }
        for (const t of ['todas', r.tipo]) { a['est_' + t]++; a['pts_' + t] += Number(r.puntos); }
        const kw = Number(r.kw); a.kw_s += kw; a.kw_max = Math.max(a.kw_max, kw); a.ops.add(r.operador);
      }
      return [...g.values()].map((a) => { const o = Object.assign({}, a, { kw_medio: Math.round(a.kw_s / a.est_todas), operadores: a.ops.size }); delete o.kw_s; delete o.ops; return o; });
    },
  });

  dash.calc('e_operadores_ambito', {
    inputs: ['e_estaciones'], title: 'Operadores por ámbito',
    description: 'Para España, cada comunidad y cada provincia, y por tipo de carga: los 40 operadores con más puntos, sus estaciones, su cuota de puntos (%), su potencia máxima media (kW) y cuántos operadores hay en el ámbito.',
    fn: (estaciones) => {
      const groups = new Map();
      const add = (nivel, ambito, nombre, tipo, r) => {
        const key = nivel + '|' + ambito + '|' + tipo; let G = groups.get(key);
        if (!G) { G = { nivel, ambito, nombre, tipo, pts: 0, ops: new Map() }; groups.set(key, G); }
        const p = Number(r.puntos); G.pts += p;
        const o = G.ops.get(r.operador) || { e: 0, p: 0, kw: 0 }; o.e++; o.p += p; o.kw += Number(r.kw); G.ops.set(r.operador, o);
      };
      for (const r of estaciones) for (const t of ['todas', r.tipo]) { add('espana', 'es', 'España', t, r); add('ccaa', r.ccaa, r.ccaa, t, r); add('provincia', String(r.cod_prov).padStart(2, '0'), r.provincia, t, r); }
      const out = [];
      for (const G of groups.values()) {
        [...G.ops.entries()].sort((x, y) => y[1].p - x[1].p).slice(0, 40).forEach(([op, o]) => out.push({
          clave: G.nivel + '|' + G.ambito + '|' + G.tipo + '|' + op, nivel: G.nivel, ambito: G.ambito, ambito_nombre: G.nombre, tipo: G.tipo, operador: op,
          estaciones: o.e, puntos: o.p, cuota: Math.round(o.p / G.pts * 1000) / 10, kw_medio: Math.round(o.kw / o.e), puntos_ambito: G.pts, n_operadores: G.ops.size }));
      }
      return out;
    },
  });

  dash.calc('e_historico_ambito', {
    inputs: ['e_historico_provincias'], title: 'Serie diaria por ámbito',
    description: 'Estaciones y puntos de cada día en España, cada comunidad y cada provincia, por tipo de carga (todas incluidas).',
    fn: (historico_provincias) => {
      const g = new Map();
      const add = (f, nivel, ambito, tipo, r) => { const k = f + '|' + nivel + '|' + ambito + '|' + tipo; const a = g.get(k) || { fecha: f, nivel, ambito, tipo, estaciones: 0, puntos: 0 }; a.estaciones += Number(r.estaciones); a.puntos += Number(r.puntos); g.set(k, a); };
      for (const r of historico_provincias) {
        const f = String(r.fecha).slice(0, 10), cp = String(r.cod_prov).padStart(2, '0');
        for (const t of ['todas', r.tipo]) { add(f, 'espana', 'es', t, r); add(f, 'ccaa', r.ccaa, t, r); add(f, 'provincia', cp, t, r); }
      }
      return [...g.values()];
    },
  });

  dash.calc('e_insights', {
    inputs: ['e_kpis', 'e_por_ccaa', 'e_por_provincia', 'e_operadores_ambito', 'e_por_municipio', 'e_historico_ambito'], title: 'Claves de la recarga',
    description: 'Cinco lecturas: comunidades con más y menos puntos por habitante (sin Ceuta ni Melilla); peso de las estaciones de 150 kW o más y provincia con más puntos ultrarrápidos; cuota de los tres primeros operadores; altas netas del último mes y comunidad con más estaciones nuevas; número mínimo de municipios que reúnen la mitad de los puntos.',
    fn: (kpis, por_ccaa, por_provincia, operadores_ambito, por_municipio, historico_ambito) => {
      const out = [], row = (o) => out.push(Object.assign({ clave: '', valor: null, valor2: null, valor3: null, valor4: null, texto1: null, texto2: null }, o));
      const k = (t) => kpis.find((r) => r.tipo === t) || {};
      const cc = por_ccaa.filter((r) => !['Ceuta', 'Melilla'].includes(r.ccaa) && r.dens_todas > 0).sort((a, b) => b.dens_todas - a.dens_todas);
      if (cc.length > 1) { const hi = cc[0], lo = cc[cc.length - 1]; row({ clave: 'densidad', valor: hi.dens_todas, valor2: Math.round(hi.dens_todas / lo.dens_todas * 10) / 10, valor3: lo.dens_todas, valor4: k('todas').por100k, texto1: hi.ccaa, texto2: lo.ccaa }); }
      const u = k('ultra'), pu = por_provincia.slice().sort((a, b) => b.pts_ultra - a.pts_ultra)[0];
      if (u.estaciones != null) row({ clave: 'ultra', valor: u.pct_est, valor2: u.estaciones, valor3: u.puntos, valor4: pu ? pu.pts_ultra : null, texto1: pu ? pu.provincia : null });
      const ops = operadores_ambito.filter((r) => r.nivel === 'espana' && r.tipo === 'todas').sort((a, b) => b.puntos - a.puntos);
      if (ops.length >= 3) row({ clave: 'operadores', valor: Math.round((ops[0].cuota + ops[1].cuota + ops[2].cuota) * 10) / 10, valor2: ops[0].n_operadores - 3, texto1: ops[0].operador + ', ' + ops[1].operador + ' y ' + ops[2].operador });
      const h = historico_ambito.filter((r) => r.nivel === 'ccaa' && r.tipo === 'todas'), dias = [...new Set(h.map((r) => r.fecha))].sort();
      const fin = dias[dias.length - 1], lim = fin ? new Date(Date.parse(fin) - 30 * 864e5).toISOString().slice(0, 10) : null, ini = dias.find((d) => d >= lim) || dias[0]; // ventana del último mes
      const grow = [...new Set(h.map((r) => r.ambito))].map((c) => { const a = h.find((r) => r.ambito === c && r.fecha === ini), b = h.find((r) => r.ambito === c && r.fecha === fin); return { c, d: (b ? b.estaciones : 0) - (a ? a.estaciones : 0) }; }).sort((a, b) => b.d - a.d);
      const t = k('todas');
      row({ clave: 'altas', valor: t.var_est, valor2: t.var_puntos, valor3: grow.length ? grow[0].d : null, texto1: grow.length ? grow[0].c : null, texto2: ini || null });
      const pm = por_municipio.slice().sort((a, b) => b.pts_todas - a.pts_todas), total = pm.reduce((s, r) => s + r.pts_todas, 0);
      let acc = 0, n = 0; for (const r of pm) { acc += r.pts_todas; n++; if (acc >= total / 2) break; }
      if (pm.length > 1) row({ clave: 'concentracion', valor: n, valor2: pm[0].pts_todas, valor3: pm[1].pts_todas, valor4: pm.length, texto1: pm[0].municipio, texto2: pm[1].municipio });
      return out;
    },
  });

  // ---------- State ----------
  const S = { tipo: 'todas', level: 'ccaa', ccaa: null, prov: null, muni: null, metric: 'pts', rank: 'dens' };
  const terSort = { key: 'pts_todas', dir: -1 };
  let terMode = 'prov';
  const $ = (id) => document.getElementById('e-' + id);
  const ok = (id) => dash.data(id).status === 'ok';
  const rowsOf = (id) => (ok(id) ? dash.data(id).data : []);
  const failBox = (box) => { box.classList.remove('dash-skeleton'); box.replaceChildren(); const f = document.createElement('div'); f.className = 'fail'; f.textContent = 'No se pudo cargar'; box.append(f); };
  const bad = (ids) => ids.some((id) => ['error', 'connect', 'declined'].includes(dash.data(id).status));
  const tOk = (r) => S.tipo === 'todas' || r.tipo === S.tipo;

  let geoCache = { src: null, prov: [], ccaa: [] };
  function geo() {
    const src = rowsOf('limites');
    if (geoCache.src !== src) {
      const all = src.map((r) => ({ nivel: r.nivel, codigo: cp2(r.codigo), nombre: r.nombre, ccaa: r.ccaa, geom: typeof r.geometria === 'string' ? JSON.parse(r.geometria) : r.geometria }));
      geoCache = { src, prov: all.filter((g) => g.nivel === 'provincia'), ccaa: all.filter((g) => g.nivel === 'ccaa') };
    }
    return geoCache;
  }
  let stCache = { src: null, rows: [], fecha: null };
  function stations() {
    const src = rowsOf('e_estaciones');
    if (stCache.src !== src && src.length) {
      const rows = src.map((r) => ({ id: String(r.id), nombre: r.nombre, operador: r.operador, municipio: r.municipio, cod_ine: ine5(r.cod_ine), provincia: r.provincia, cod_prov: cp2(r.cod_prov), ccaa: r.ccaa, lat: Number(r.lat), lon: Number(r.lon), kw: Number(r.kw), puntos: Number(r.puntos), tipo: r.tipo, conectores: r.conectores, alta: r.alta ? String(r.alta).slice(0, 10) : '' }));
      stCache = { src, rows, fecha: String(src[0].fecha).slice(0, 10) };
      const seen = new Set(), opts = [];
      for (const r of rows) { const lab = r.municipio + ' (' + r.provincia + ')'; if (!seen.has(lab)) { seen.add(lab); opts.push(lab); } }
      opts.sort((a, b) => a.localeCompare(b, 'es'));
      $('muniList').replaceChildren(...opts.map((o) => { const op = document.createElement('option'); op.value = o; return op; }));
    }
    return stCache;
  }
  const inScope = (r) => (S.muni ? r.cod_ine === S.muni : S.prov ? r.cod_prov === S.prov : S.ccaa ? r.ccaa === S.ccaa : true);
  const inScopeAgg = (r) => (S.prov ? cp2(r.cod_prov) === S.prov : S.ccaa ? r.ccaa === S.ccaa : true);
  function muniName() { const r = stations().rows.find((x) => x.cod_ine === S.muni); return r ? r.municipio : ''; }
  function provName() { const r = stations().rows.find((x) => x.cod_prov === S.prov); return r ? r.provincia : (geo().prov.find((g) => g.codigo === S.prov) || {}).nombre || ''; }
  function scopeName() { return S.muni ? muniName() : S.prov ? provName() : S.ccaa ? S.ccaa : 'España'; }
  function aggScopeName() { return S.prov ? provName() : S.ccaa ? S.ccaa : 'España'; }

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
  const setTipo = (t) => { S.tipo = t; draw(); };
  $('tipoSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-tipo]'); if (b) setTipo(b.dataset.tipo); });
  $('tipos').addEventListener('click', (e) => { const b = e.target.closest('button[data-tipo]'); if (b) setTipo(b.dataset.tipo); });
  $('levelSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-level]'); if (b && !b.disabled) { S.level = b.dataset.level; draw(); } });
  $('muniSearch').addEventListener('change', () => {
    const m = $('muniSearch').value.match(/^(.*) \((.*)\)$/); if (!m) return;
    const r = stations().rows.find((x) => x.municipio === m[1] && x.provincia === m[2]);
    if (r) { pickMuni(r); $('muniSearch').value = ''; }
  });
  function pickMuni(r) { S.ccaa = r.ccaa; S.prov = cp2(r.cod_prov); S.muni = ine5(r.cod_ine); S.level = 'estacion'; draw(); $('mapa').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function pickMuniKey(k) { const r = stations().rows.find((x) => x.cod_ine === k); if (r) pickMuni(r); }
  function pickCcaa(c) { S.ccaa = c; S.prov = S.muni = null; S.level = 'provincia'; draw(); }
  function setScope(level) {
    if (level === 'es') { S.ccaa = S.prov = S.muni = null; S.level = 'ccaa'; }
    if (level === 'ccaa') { S.prov = S.muni = null; S.level = 'provincia'; }
    if (level === 'prov') { S.muni = null; S.level = 'estacion'; }
    draw();
  }
  document.querySelectorAll('#e-terTable th button').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sort; terSort.dir = terSort.key === k ? -terSort.dir : (k === 'nombre' ? 1 : -1); terSort.key = k; drawTer();
  }));
  $('terSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-ter]'); if (b) { terMode = b.dataset.ter; drawTer(); } });
  $('terTable').querySelector('tbody').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]'); if (!tr) return;
    const [nv, cod] = tr.dataset.key.split('|');
    if (nv === 'ccaa') pickCcaa(cod); else { const g = geo().prov.find((x) => x.codigo === cod); if (g) { S.ccaa = g.ccaa; S.prov = cod; S.muni = null; S.level = 'estacion'; draw(); } }
    $('mapa').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('altasTable').querySelector('tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (!tr) return; const r = stations().rows.find((x) => x.id === tr.dataset.key); if (r) pickMuni(r); });

  function drawControls() {
    document.querySelectorAll('#e-tipoSeg button, #e-tipos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === S.tipo)));
    document.querySelectorAll('#e-levelSeg button').forEach((b) => {
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
    if (S.prov) add(provName() || S.prov, S.muni ? () => setScope('prov') : null);
    if (S.muni) add(muniName(), null);
  }

  // ---------- Map ----------
  function drawMap() {
    const box = $('mapBox'), tip = $('mapTip'), host = $('mapa'), t = S.tipo;
    const need = ['e_estaciones', 'limites', 'e_por_ccaa', 'e_por_provincia'];
    if (bad(need)) { failBox(box); $('legend').replaceChildren(); return; }
    if (need.some((id) => !ok(id))) { box.classList.add('dash-skeleton'); box.replaceChildren(); $('legend').replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const G = geo(), st = stations();
    const W = Math.max(280, box.clientWidth), H = Math.max(300, Math.min(660, Math.round(W * 0.74)));
    box.style.minHeight = H + 'px';
    let svg = d3.select(box).select('svg');
    if (svg.empty()) { box.replaceChildren(); svg = d3.select(box).append('svg').attr('class', 'fadein'); }
    svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', 'Mapa de puntos de recarga');
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
        const tx = gLab.append('text').attr('class', 'mlab').attr('text-anchor', 'middle').attr('x', pos.x).attr('y', pos.y - (lines.length - 1) * 7);
        lines.forEach((l, i) => tx.append('tspan').attr('x', pos.x).attr('dy', i ? 14 : 4).text(l));
        return;
      }
    };
    const hover = (ev, lines) => { const [x, y] = d3.pointer(ev, host); showTip(tip, host, x, y, lines); };
    const hideTip = () => { tip.style.display = 'none'; };
    const provVals = new Map(rowsOf('e_por_provincia').map((r) => [cp2(r.cod_prov), r]));
    const ccaaVals = new Map(rowsOf('e_por_ccaa').map((r) => [r.ccaa, r]));
    const legend = $('legend'); legend.replaceChildren();
    const dk = 'dens_' + t, pk = 'pts_' + t, ek = 'est_' + t;
    const lineOf = (r) => fN(r[pk]) + ' puntos · ' + fN(r[ek]) + ' estaciones · ' + f1(r[dk]) + ' por 100.000 hab.';
    const mk = S.metric === 'dens' ? dk : pk, mf = (v) => (S.metric === 'dens' ? f1(v) : fN(v)), mword = S.metric === 'dens' ? 'puntos por habitante' : 'puntos';

    if (S.level === 'ccaa' && !S.ccaa) {
      const feats = G.ccaa.filter((g) => ccaaVals.has(g.nombre));
      const ranked = feats.map((g) => ({ n: g.nombre, v: ccaaVals.get(g.nombre)[mk] })).sort((p, q) => q.v - p.v);
      gReg.selectAll('path').data(feats).join('path')
        .attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', (g) => ccCol(g.nombre)).attr('stroke', '#ffffff').attr('stroke-width', 1.2).style('cursor', 'pointer')
        .on('mousemove', (ev, g) => { const r = ccaaVals.get(g.nombre); const pos = ranked.findIndex((d) => d.n === g.nombre) + 1; hover(ev, [['t1', g.nombre], ['t2', lineOf(r)], ['t1', 'Puesto ' + pos + ' de ' + ranked.length + ' (1 = más ' + mword + ')']]); })
        .on('mouseleave', hideTip)
        .on('click', (ev, g) => { hideTip(); pickCcaa(g.nombre); });
      feats.slice().sort((a, b) => (labelPos(projFor(b), b.geom) || { area: 0 }).area - (labelPos(projFor(a), a.geom) || { area: 0 }).area).forEach((g) => {
        const v = ccaaVals.get(g.nombre)[mk];
        placeLabel(labelPos(projFor(g), g.geom), [[g.nombre, mf(v)], [mf(v)]]);
      });
      legend.textContent = 'Cada comunidad tiene su color. Las etiquetas muestran ' + (S.metric === 'dens' ? 'los puntos de recarga por cada 100.000 habitantes' : 'el número de puntos de recarga') + '; a la derecha, el ranking por habitante.';
    } else if (S.level === 'provincia' || (S.level === 'ccaa' && S.ccaa)) {
      const feats = G.prov.filter((g) => (!S.ccaa || g.ccaa === S.ccaa) && provVals.has(g.codigo));
      const toneOf = new Map();
      d3.group(feats, (g) => g.ccaa).forEach((list) => {
        const s = list.slice().sort((a, b) => provVals.get(a.codigo)[mk] - provVals.get(b.codigo)[mk]);
        s.forEach((g, i) => toneOf.set(g.codigo, s.length > 1 ? tone(ccCol(g.ccaa), i / (s.length - 1)) : ccCol(g.ccaa)));
      });
      const ranked = feats.map((g) => ({ c: g.codigo, v: provVals.get(g.codigo)[mk] })).sort((p, q) => q.v - p.v);
      gReg.selectAll('path').data(feats).join('path')
        .attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', (g) => toneOf.get(g.codigo) || 'var(--color-panel)').attr('stroke', '#ffffff').attr('stroke-width', 1).style('cursor', 'pointer')
        .on('mousemove', (ev, g) => { const r = provVals.get(g.codigo); const pos = ranked.findIndex((d) => d.c === g.codigo) + 1; hover(ev, [['t1', r.provincia + ' · ' + r.ccaa], ['t2', lineOf(r)], ['t1', 'Puesto ' + pos + ' de ' + ranked.length + ' (1 = más ' + mword + ')']]); })
        .on('mouseleave', hideTip)
        .on('click', (ev, g) => { hideTip(); S.ccaa = g.ccaa; S.prov = g.codigo; S.muni = null; S.level = 'estacion'; draw(); });
      if (S.ccaa) {
        const cc = G.ccaa.find((g) => g.nombre === S.ccaa);
        if (cc) gReg.append('path').attr('d', pathOf(projFor(cc), cc.geom)).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.2).style('pointer-events', 'none');
      }
      feats.map((g) => ({ g, pos: labelPos(projFor(g), g.geom) })).filter((d) => d.pos).sort((a, b) => b.pos.area - a.pos.area).forEach(({ g, pos }) => {
        const r = provVals.get(g.codigo);
        placeLabel(pos, S.ccaa ? [[r.provincia, mf(r[mk])], [mf(r[mk])]] : [[mf(r[mk])]]);
      });
      legend.textContent = (S.metric === 'dens' ? 'Puntos por cada 100.000 habitantes.' : 'Número de puntos de recarga.') + ' Cada comunidad, su color; dentro, el tono más claro es la provincia con menos ' + mword + ' y el más oscuro la que más tiene.' + (S.ccaa ? '' : ' Las provincias pequeñas muestran su dato al pasar el ratón.');
    } else {
      const feats = G.prov.filter((g) => (S.prov ? g.codigo === S.prov : S.ccaa ? g.ccaa === S.ccaa : true));
      gReg.selectAll('path').data(feats).join('path').attr('d', (g) => pathOf(projFor(g), g.geom)).attr('fill-rule', 'evenodd')
        .attr('fill', 'var(--color-bg)').attr('stroke', (g) => ccCol(g.ccaa)).attr('stroke-width', 1);
      const scopeRows = st.rows.filter((r) => tOk(r) && (S.prov ? r.cod_prov === S.prov : S.ccaa ? r.ccaa === S.ccaa : true));
      const base = S.muni ? 3.2 : S.prov ? 2.8 : S.ccaa ? 2 : 1.3;
      const rad = (r) => base * Math.min(2.6, Math.sqrt(Math.max(1, r.puntos) / 2) + 0.3);
      const order = { lenta: 0, rapida: 1, ultra: 2 };
      const pts = scopeRows.map((r) => { const p = ptFor(r.lon, r.lat); return { r, x: p[0], y: p[1], on: !S.muni || r.cod_ine === S.muni }; })
        .sort((a, b) => (a.on === b.on ? order[a.r.tipo] - order[b.r.tipo] : a.on ? 1 : -1));
      gReg.append('g').selectAll('circle').data(pts).join('circle')
        .attr('cx', (d) => d.x).attr('cy', (d) => d.y).attr('r', (d) => rad(d.r))
        .attr('fill', (d) => TCOL[d.r.tipo]).attr('fill-opacity', (d) => (d.on ? 0.8 : 0.15))
        .attr('stroke', (d) => (S.muni && d.on ? 'var(--color-fg)' : 'none')).attr('stroke-width', 0.8);
      const del = d3.Delaunay.from(pts, (d) => d.x, (d) => d.y);
      const hl = gRoot.append('circle').attr('r', base * 3).attr('fill', 'none').attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).style('display', 'none');
      const near = (ev) => { if (!pts.length) return null; const [mx, my] = d3.pointer(ev, svg.node()); const sx = W / svg.node().getBoundingClientRect().width; const i = del.find(mx, my); if (i == null || i < 0 || !pts[i]) return null; const d = pts[i]; return Math.hypot(d.x - mx, d.y - my) < 14 * sx ? d : null; };
      svg.on('mousemove', (ev) => {
        const d = near(ev);
        if (!d) { hl.style('display', 'none'); hideTip(); return; }
        hl.attr('cx', d.x).attr('cy', d.y).style('display', null);
        hover(ev, [['t1', d.r.municipio + ' · ' + d.r.provincia], ['t2', d.r.nombre], ['t2', d.r.operador + ' · ' + fN(d.r.kw) + ' kW máx. · ' + fN(d.r.puntos) + (d.r.puntos === 1 ? ' punto' : ' puntos')], ['t1', d.r.conectores], ['t1', d.r.alta ? 'Alta en el registro: ' + fDL(day(d.r.alta)) : '']]);
      }).on('mouseleave', () => { hl.style('display', 'none'); hideTip(); })
        .on('click', (ev) => { const d = near(ev); if (d) { hideTip(); pickMuni(d.r); } });
      const shown = S.tipo === 'todas' ? ['ultra', 'rapida', 'lenta'] : [S.tipo];
      const lab = { ultra: 'Ultrarrápida (150 kW o más)', rapida: 'Rápida (23–149 kW)', lenta: 'Lenta y semirrápida (hasta 22 kW)' };
      shown.forEach((k) => { const s = document.createElement('span'); s.className = 'sw'; const dt = document.createElement('span'); dt.className = 'dot'; dt.style.background = TCOL[k]; s.append(dt, document.createTextNode(lab[k])); legend.append(s); });
      const n = document.createElement('span'); n.textContent = '· ' + fN(scopeRows.length) + ' estaciones, ' + fN(d3.sum(scopeRows, (r) => r.puntos)) + ' puntos. El tamaño indica cuántos puntos tiene cada estación.'; legend.append(n);
    }
    const fecha = st.fecha ? fDL(day(st.fecha)) : '';
    const tl = S.tipo === 'todas' ? 'Puntos de recarga' : TIPOS[S.tipo];
    $('mapTitle').textContent = S.level === 'estacion' ? tl + ' · estaciones · ' + scopeName() : tl + (S.metric === 'dens' ? ' por cada 100.000 habitantes · ' : ' · ') + ((S.level === 'provincia' || S.ccaa) ? 'por provincia' : 'por comunidad') + ' · ' + scopeName();
    $('mapNote').textContent = (fecha ? 'Registro del ' + fecha + '. ' : '') + (S.level === 'estacion' ? 'Pulsa un punto para ver su municipio.' : 'Pulsa una zona para bajar de nivel.');
  }

  // ---------- CCAA / province ranking ----------
  function drawCcaa() {
    const box = $('ccaaBox'), tip = $('ccaaTip'), host = $('ranking-ccaa'), t = S.tipo;
    const key = 'dens_' + t, fmt = f1;
    if (bad(['e_por_ccaa', 'e_por_provincia', 'e_kpis'])) { failBox(box); return; }
    if (!ok('e_por_ccaa') || !ok('e_por_provincia')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const provMode = !!S.ccaa;
    const rows = (provMode ? rowsOf('e_por_provincia').filter((r) => r.ccaa === S.ccaa).map((r) => Object.assign({ nombre: r.provincia, cod: cp2(r.cod_prov) }, r))
      : rowsOf('e_por_ccaa').map((r) => Object.assign({ nombre: r.ccaa, cod: r.ccaa }, r))).sort((a, b) => b[key] - a[key]);
    let ref = null, refLab = '';
    {
      if (provMode) { const c = rowsOf('e_por_ccaa').find((r) => r.ccaa === S.ccaa); if (c) { ref = c['dens_' + t]; refLab = S.ccaa; } }
      else { ref = (rowsOf('e_kpis').find((r) => r.tipo === t) || {}).por100k; refLab = 'España'; }
    }
    const W = Math.max(260, box.clientWidth), top = ref != null ? 26 : 8, n = Math.max(1, rows.length);
    let H = n * 28 + top + 8;
    if (window.matchMedia('(min-width: 1100px)').matches) {
      box.style.minHeight = '0px'; box.replaceChildren();
      const mapH = $('mapa').getBoundingClientRect().height;
      const used = box.getBoundingClientRect().top - host.getBoundingClientRect().top + parseFloat(getComputedStyle(host).paddingBottom || '0') + 2;
      if (mapH - used > H) H = Math.floor(mapH - used);
    }
    const rh = Math.min(46, (H - top - 8) / n), big = rh >= 30;
    H = Math.round(rh * n + top + 8);
    box.style.minHeight = H + 'px'; box.replaceChildren();
    if (!rows.length) return;
    const fs = big ? 'var(--cds-font-size-body)' : 'var(--cds-font-size-caption)';
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const meas = svg.append('g').attr('font-size', fs);
    const tw = (s, w) => { const t2 = meas.append('text').attr('font-weight', w || null).text(s); const v = t2.node().getComputedTextLength(); t2.remove(); return v; };
    const badge = Math.min(22, rh * 0.75);
    const ml = Math.min(W * 0.46, d3.max(rows, (r) => tw(r.nombre, 600)) + badge + 18), mr = tw('00.000', 700) + 14;
    meas.remove();
    const x = d3.scaleLinear([0, d3.max(rows.map((r) => r[key]).concat(ref != null ? [ref] : [])) || 1], [ml, W - mr]);
    const colOf = (r) => (provMode ? tone(ccCol(S.ccaa), rows.length > 1 ? 1 - rows.indexOf(r) / (rows.length - 1) : 1) : ccCol(r.ccaa));
    const g = svg.append('g');
    const barH = Math.max(8, rh * 0.62);
    const rg = g.selectAll('g.r').data(rows).join('g').attr('class', 'r').attr('transform', (r, i) => `translate(0,${top + i * rh + rh / 2})`).style('cursor', 'pointer');
    rg.append('rect').attr('x', 0).attr('y', -rh / 2).attr('width', W).attr('height', rh).attr('rx', 6).attr('fill', (r) => ((provMode ? r.cod === S.prov : r.ccaa === S.ccaa) ? 'var(--cds-surface-popover)' : 'transparent'));
    rg.append('circle').attr('cx', badge / 2 + 2).attr('r', badge / 2).attr('fill', colOf);
    rg.append('text').attr('x', badge / 2 + 2).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', 'var(--cds-font-size-caption)').attr('font-weight', 700).text((r, i) => i + 1);
    rg.append('text').attr('x', ml - 10).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').attr('font-size', fs).attr('font-weight', (r) => ((provMode ? r.cod === S.prov : false) ? 700 : 600)).text((r) => r.nombre);
    rg.append('rect').attr('x', ml).attr('y', -barH / 2).attr('height', barH).attr('rx', Math.min(6, barH / 2))
      .attr('width', (r) => Math.max(2, x(r[key]) - ml)).attr('fill', colOf).attr('fill-opacity', (r) => (!S.prov || !provMode || r.cod === S.prov ? 0.92 : 0.4));
    rg.append('text').attr('x', (r) => x(r[key]) + 7).attr('dy', '0.35em').attr('fill', 'var(--color-fg)').attr('font-size', fs).attr('font-weight', 700).attr('font-variant-numeric', 'tabular-nums').text((r) => fmt(r[key]));
    if (ref != null) {
      g.append('line').attr('x1', x(ref)).attr('x2', x(ref)).attr('y1', top - 6).attr('y2', H - 4).attr('stroke', 'var(--color-fg)').attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
      const lab = refLab + ' ' + f1(ref), lw = lab.length * 7;
      const lx = Math.min(Math.max(x(ref), ml + lw / 2), W - lw / 2 - 2);
      g.append('text').attr('x', lx).attr('y', 14).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg)').attr('font-size', 'var(--cds-font-size-caption)').attr('font-weight', 700).text(lab);
    }
    rg.on('mousemove', (ev, r) => { const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, [['t1', r.nombre], ['t2', fN(r['pts_' + t]) + ' puntos · ' + fN(r['est_' + t]) + ' estaciones'], ['t1', f1(r['dens_' + t]) + ' puntos por 100.000 hab. · ' + fN(r.poblacion) + ' habitantes']]); })
      .on('mouseleave', () => { tip.style.display = 'none'; })
      .on('click', (ev, r) => { tip.style.display = 'none'; if (provMode) { S.prov = r.cod; S.muni = null; S.level = 'estacion'; draw(); } else pickCcaa(r.ccaa); });
    const tl = t === 'todas' ? 'Puntos de recarga' : TIPOS[t];
    $('ccaaTitle').textContent = tl + ' por cada 100.000 habitantes · ' + (provMode ? S.ccaa : 'por comunidad');
    $('ccaaNote').textContent = (provMode ? 'Provincias' : 'Comunidades') + ' de más a menos puntos por habitante; el número total de puntos está en el mapa.' + (ref != null ? ' La línea marca la media de ' + refLab + '.' : '') + (provMode ? ' Pulsa una provincia para ver sus estaciones; vuelve a España en la ruta de arriba del mapa.' : ' Pulsa una comunidad para ver sus provincias.');
  }


  // ---------- Charger mix ----------
  function drawMix() {
    const box = $('mixBox'), tip = $('mixTip'), host = $('mix');
    if (bad(['e_territorios', 'e_kpis'])) { failBox(box); return; }
    if (!ok('e_territorios') || !ok('e_kpis')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const ter = rowsOf('e_territorios'), kp = rowsOf('e_kpis');
    const K = ['ultra', 'rapida', 'lenta'];
    const mk = (nombre, src, clave, bold) => { const tot = K.reduce((s, k) => s + src['pts_' + k], 0); return { nombre, clave, bold, tot, v: K.map((k) => ({ k, n: src['pts_' + k], p: tot ? src['pts_' + k] / tot * 100 : 0 })) }; };
    const esp = {}; K.forEach((k) => { esp['pts_' + k] = (kp.find((r) => r.tipo === k) || {}).puntos || 0; });
    const head = [mk('España', esp, 'es', true)];
    let list;
    if (S.ccaa) {
      const c = ter.find((r) => r.nivel === 'ccaa' && r.ccaa === S.ccaa); if (c) head.push(mk(c.nombre, c, c.clave, true));
      list = ter.filter((r) => r.nivel === 'provincia' && r.ccaa === S.ccaa);
    } else list = ter.filter((r) => r.nivel === 'ccaa');
    const body = list.map((r) => mk(r.nombre, r, r.clave, false)).filter((r) => r.tot > 0).sort((a, b) => b.v[0].p - a.v[0].p);
    const rows = head.concat(body);
    const W = Math.max(280, box.clientWidth), rh = 28, gap = 12, top = 4, H = rows.length * rh + gap + top + 4;
    box.style.minHeight = H + 'px'; box.replaceChildren();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const fsz = 'var(--cds-font-size-caption)';
    const meas = svg.append('g').attr('font-size', fsz);
    const tw = (s, w) => { const n = meas.append('text').attr('font-weight', w || null).text(s); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const ml = Math.min(W * 0.32, d3.max(rows, (r) => tw(r.nombre, 700)) + 14), mr = 6;
    meas.remove();
    const x = d3.scaleLinear([0, 100], [ml, W - mr]);
    const yOf = (i) => top + i * rh + (i >= head.length ? gap : 0);
    const g = svg.append('g');
    if (body.length) g.append('line').attr('x1', 0).attr('x2', W).attr('y1', yOf(head.length) - gap / 2).attr('y2', yOf(head.length) - gap / 2).attr('stroke', 'var(--cds-chart-grid)');
    const rg = g.selectAll('g.r').data(rows).join('g').attr('transform', (r, i) => `translate(0,${yOf(i) + rh / 2})`);
    rg.append('text').attr('x', ml - 10).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').attr('font-size', fsz).attr('font-weight', (r) => (r.bold || (S.prov && r.clave === 'provincia|' + S.prov) ? 700 : 500)).text((r) => r.nombre);
    rg.each(function (r) {
      let acc = 0; const sel = d3.select(this);
      r.v.forEach((s) => {
        const x0 = x(acc), w = Math.max(0, x(acc + s.p) - x0); acc += s.p;
        sel.append('rect').attr('x', x0).attr('y', -9).attr('height', 18).attr('width', w).attr('fill', TCOL[s.k]).attr('fill-opacity', S.tipo === 'todas' || S.tipo === s.k ? 0.92 : 0.35);
        if (w > 38) sel.append('text').attr('x', x0 + w / 2).attr('dy', '0.35em').attr('text-anchor', 'middle').attr('fill', '#fff').attr('font-size', fsz).attr('font-weight', 700).attr('font-variant-numeric', 'tabular-nums').text(f1(s.p) + ' %');
      });
    });
    rg.style('cursor', (r) => (r.clave === 'es' ? 'default' : 'pointer'))
      .on('mousemove', (ev, r) => { const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, [['t1', r.nombre + ' · ' + fN(r.tot) + ' puntos']].concat(r.v.map((s) => ['t2', TIPOS[s.k] + ': ' + f1(s.p) + ' % (' + fN(s.n) + ' puntos)']))); })
      .on('mouseleave', () => { tip.style.display = 'none'; })
      .on('click', (ev, r) => {
        tip.style.display = 'none'; const [nv, cod] = r.clave.split('|');
        if (nv === 'ccaa') pickCcaa(cod); else if (nv === 'provincia') { S.prov = cod; S.muni = null; S.level = 'estacion'; draw(); }
      });
    const lg = $('mixLegend'); lg.replaceChildren();
    const lab = { ultra: 'Ultrarrápida (150 kW o más)', rapida: 'Rápida (23–149 kW)', lenta: 'Lenta y semirrápida (hasta 22 kW)' };
    K.forEach((k) => { const s = document.createElement('span'); s.className = 'sw'; const d = document.createElement('span'); d.className = 'dot'; d.style.background = TCOL[k]; s.append(d, document.createTextNode(lab[k])); lg.append(s); });
    $('mixTitle').textContent = 'Proporción de cada tipo de cargador · ' + (S.ccaa ? S.ccaa : 'España');
    $('mixNote').textContent = '% de los puntos de recarga de cada tipo. Arriba, ' + (S.ccaa ? 'España y ' + S.ccaa + '; debajo, sus provincias' : 'España; debajo, las comunidades') + ', ordenadas de más a menos peso de la ultrarrápida. Pulsa una fila para verla en el mapa.';
  }


  function drawMixChange() {
    const el = $('mixChange'); el.replaceChildren();
    if (!ok('e_historico_ambito')) return;
    const nivel = S.ccaa ? 'ccaa' : 'espana', amb = S.ccaa ? S.ccaa : 'es';
    const src = rowsOf('e_historico_ambito').filter((r) => r.nivel === nivel && String(r.ambito) === String(amb) && r.tipo !== 'todas');
    const dias = [...new Set(src.map((r) => r.fecha))].sort();
    if (dias.length < 2) return;
    const share = (f) => { const rows = src.filter((r) => r.fecha === f), tot = d3.sum(rows, (r) => r.puntos); const o = {}; rows.forEach((r) => { o[r.tipo] = tot ? r.puntos / tot * 100 : 0; }); return o; };
    const a = share(dias[0]), b = share(dias[dias.length - 1]);
    const fP = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 }), fPS = nf({ minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
    const bold = (s) => { const e = document.createElement('b'); e.textContent = s; return e; };
    el.append('Cambio en ' + (S.ccaa || 'España') + ' entre el ' + fDL(day(dias[0])) + ' y el ' + fDL(day(dias[dias.length - 1])) + ': ');
    ['ultra', 'rapida', 'lenta'].forEach((k, i) => {
      if (i) el.append(' · ');
      el.append(TIPOS[k] + ' ', bold(fP.format(b[k] || 0) + ' %'), ' (' + fPS.format((b[k] || 0) - (a[k] || 0)) + ' puntos)');
    });
    el.append('. Con un solo mes de histórico el reparto apenas se mueve; la evolución en gráfico se añadirá cuando haya varios meses.');
  }

  // ---------- Operators ----------
  function drawOps() {
    const box = $('opBox'), tip = $('opTip'), host = $('operadores'), t = S.tipo;
    if (bad(['e_operadores_ambito'])) { failBox(box); $('opCall').textContent = ''; return; }
    if (!ok('e_operadores_ambito')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const nivel = S.prov ? 'provincia' : S.ccaa ? 'ccaa' : 'espana', amb = S.prov ? S.prov : S.ccaa ? S.ccaa : 'es';
    const rows = rowsOf('e_operadores_ambito').filter((r) => r.nivel === nivel && String(r.ambito) === String(amb) && r.tipo === t).slice().sort((a, b) => b.puntos - a.puntos);
    const name = aggScopeName();
    $('opTitle').textContent = 'Cuota por operador · ' + name;
    box.replaceChildren();
    const call = $('opCall'); call.replaceChildren();
    if (!rows.length) { $('opNote').textContent = 'No hay estaciones de este tipo en ' + name + '.'; box.style.minHeight = '60px'; return; }
    const tl = t === 'todas' ? 'todos los puntos' : TIPOS[t].toLowerCase();
    $('opNote').textContent = 'Cuota de puntos de recarga (' + tl + ') de los ' + rows.length + ' operadores más grandes de ' + name + ', entre ' + fN(rows[0].n_operadores) + ' operadores y ' + fN(rows[0].puntos_ambito) + ' puntos. Las marcas agrupan las razones sociales de un mismo grupo.';
    const b = (s) => { const e = document.createElement('b'); e.textContent = s; return e; };
    const top3 = rows.slice(0, 3);
    call.append(top3.length === 3 ? 'Los tres primeros, ' : 'Los primeros, ', b(top3.map((r) => r.operador).join(', ')), ', suman ', b(f1(d3.sum(top3, (r) => r.cuota)) + ' %'), ' de los puntos');
    const W = Math.max(300, box.clientWidth), rh = 27, top = 6, H = rows.length * rh + top + 4;
    box.style.minHeight = H + 'px';
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const fsz = 'var(--cds-font-size-caption)';
    const meas = svg.append('g').attr('font-size', fsz);
    const tw = (s, w) => { const n = meas.append('text').attr('font-weight', w || null).text(s); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const narrow = W < 560;
    const ml = Math.min(W * 0.34, d3.max(rows, (r) => tw(r.operador, 600)) + 14);
    const mr = narrow ? tw('00,0 %', 700) + 12 : tw('00,0 %', 700) + tw('  00.000 puntos') + tw('  000 kW medio') + 20;
    meas.remove();
    const x = d3.scaleLinear([0, d3.max(rows, (r) => r.cuota) || 1], [ml, W - mr]);
    const col = TCOL[t];
    const g = svg.append('g');
    g.selectAll('rect.z').data(rows).join('rect').attr('x', 0).attr('width', W).attr('y', (r, i) => top + i * rh).attr('height', rh).attr('rx', 6)
      .attr('fill', (r, i) => (i % 2 ? 'transparent' : 'color-mix(in srgb, var(--color-fg) 3.5%, transparent)'));
    const rg = g.selectAll('g.r').data(rows).join('g').attr('transform', (r, i) => `translate(0,${top + i * rh + rh / 2})`);
    rg.append('text').attr('x', ml - 10).attr('dy', '0.35em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg)').attr('font-size', fsz).attr('font-weight', 600).text((r) => r.operador);
    rg.append('rect').attr('x', ml).attr('y', -7).attr('height', 14).attr('rx', 5).attr('width', (r) => Math.max(2, x(r.cuota) - ml)).attr('fill', col).attr('fill-opacity', (r, i) => (i < 3 ? 0.95 : 0.55));
    const tx = rg.append('text').attr('x', (r) => x(r.cuota) + 8).attr('dy', '0.35em').attr('font-size', fsz).attr('font-variant-numeric', 'tabular-nums');
    tx.append('tspan').attr('fill', 'var(--color-fg)').attr('font-weight', 700).text((r) => f1(r.cuota) + ' %');
    if (!narrow) {
      tx.append('tspan').attr('fill', 'var(--color-fg-muted)').text((r) => '  ' + fN(r.puntos) + ' puntos');
      tx.append('tspan').attr('fill', 'var(--color-fg-muted)').text((r) => '  ' + fN(r.kw_medio) + ' kW medio');
    }
    rg.style('cursor', 'default').on('mousemove', (ev, r) => { const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, [['t1', r.operador + ' · ' + name], ['t2', f1(r.cuota) + ' % de los puntos · ' + fN(r.puntos) + ' puntos'], ['t1', fN(r.estaciones) + ' estaciones · potencia máxima media ' + fN(r.kw_medio) + ' kW']]); })
      .on('mouseleave', () => { tip.style.display = 'none'; });
  }


  // ---------- History (absolute) ----------
  function drawHist() {
    const box = $('histBox'), tip = $('histTip'), host = $('historico');
    if (bad(['e_historico_ambito'])) { failBox(box); return; }
    if (!ok('e_historico_ambito')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const nivel = S.prov ? 'provincia' : S.ccaa ? 'ccaa' : 'espana', amb = S.prov ? S.prov : S.ccaa ? S.ccaa : 'es', where = aggScopeName();
    const src = rowsOf('e_historico_ambito').filter((r) => r.nivel === nivel && String(r.ambito) === String(amb));
    const series = TK.map((k) => ({ k, name: k === 'todas' ? 'Total' : TIPOS[k], sel: k === S.tipo,
      pts: src.filter((r) => r.tipo === k).map((r) => ({ d: day(r.fecha), v: Number(r.puntos), e: Number(r.estaciones) })).sort((a, b) => a.d - b.d) })).filter((s) => s.pts.length);
    series.sort((a, b) => (a.sel === b.sel ? 0 : a.sel ? 1 : -1));
    const all = series.flatMap((s) => s.pts);
    const W = Math.max(260, box.clientWidth), H = Math.max(260, Math.min(380, Math.round(W * 0.32)));
    box.style.minHeight = H + 'px'; box.replaceChildren();
    if (!all.length) return;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const y = d3.scaleLinear([0, d3.max(all, (p) => p.v) || 1], [H - 28, 12]).nice();
    const meas = svg.append('g').attr('font-size', 'var(--cds-font-size-caption)');
    const tw = (s, w) => { const n = meas.append('text').attr('font-weight', w || null).text(s); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const yt = y.ticks(5);
    const ml = d3.max(yt, (v) => tw(fN(v))) + 10;
    const lab = (s) => s.name + ' ' + fN(s.pts[s.pts.length - 1].v);
    const mr = Math.min(W * 0.4, d3.max(series, (s) => tw(lab(s), 700)) + 12);
    meas.remove();
    const x = d3.scaleUtc(d3.extent(all, (p) => p.d), [ml, W - mr]);
    const g = svg.append('g');
    g.selectAll('line.gr').data(yt).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
    g.selectAll('text.yt').data(yt).join('text').attr('x', ml - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((v) => fN(v));
    const xt = x.ticks(Math.min(8, Math.max(2, Math.floor((W - ml - mr) / 80))));
    g.selectAll('text.xt').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((d) => fD(d));
    const ln = d3.line().x((p) => x(p.d)).y((p) => y(p.v));
    series.forEach((s) => g.append('path').attr('d', ln(s.pts)).attr('fill', 'none').attr('stroke', TCOL[s.k]).attr('stroke-width', s.sel ? 3.5 : 2).attr('stroke-opacity', s.sel ? 1 : 0.7).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round'));
    const ends = series.map((s) => ({ s, y: y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    const over = ends.length ? ends[ends.length - 1].y - (H - 30) : 0;
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    ends.forEach((e) => g.append('text').attr('x', W - mr + 8).attr('y', e.y).attr('dy', '0.32em').attr('fill', TCOL[e.s.k]).attr('font-weight', e.s.sel ? 700 : 600).attr('font-size', 'var(--cds-font-size-caption)').style('cursor', 'pointer').text(lab(e.s)).on('click', () => setTipo(e.s.k)));
    const rule = g.append('line').attr('y1', 12).attr('y2', H - 28).attr('stroke', 'var(--cds-chart-reference)').style('display', 'none');
    const dots = series.map((s) => g.append('circle').attr('r', s.sel ? 4.5 : 3.5).attr('fill', TCOL[s.k]).style('display', 'none'));
    const bis = d3.bisector((p) => p.d).center, ref = series[series.length - 1];
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', H).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const p0 = ref.pts[bis(ref.pts, x.invert(mx))]; if (!p0) return;
        rule.attr('x1', x(p0.d)).attr('x2', x(p0.d)).style('display', null);
        const lines = [['t1', fDL(p0.d) + ' · ' + where]];
        TK.forEach((k) => { const i = series.findIndex((s) => s.k === k); if (i < 0) return; const s = series[i], p = s.pts[bis(s.pts, p0.d)]; if (p) { dots[i].attr('cx', x(p.d)).attr('cy', y(p.v)).style('display', null); lines.push(['t2', s.name + ': ' + fN(p.v) + ' puntos · ' + fN(p.e) + ' estaciones']); } });
        const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, lines);
      })
      .on('mouseleave', () => { rule.style('display', 'none'); dots.forEach((d) => d.style('display', 'none')); tip.style.display = 'none'; });
    $('histTitle').textContent = 'Evolución de los puntos de recarga · ' + where;
    $('histNote').textContent = 'Puntos en el registro oficial cada día, del ' + fDL(ref.pts[0].d) + ' al ' + fDL(ref.pts[ref.pts.length - 1].d) + ': total y por tipo de carga, con el eje desde cero. Resaltado: ' + (S.tipo === 'todas' ? 'total' : TIPOS[S.tipo]) + ' (pulsa un nombre para cambiarlo).';
  }

  // ---------- Trend ----------
  function drawTrend() {
    const box = $('trendBox'), tip = $('trendTip'), host = $('evolucion');
    if (bad(['e_historico_ambito'])) { failBox(box); return; }
    if (!ok('e_historico_ambito')) { box.classList.add('dash-skeleton'); box.replaceChildren(); return; }
    box.classList.remove('dash-skeleton');
    const nivel = S.prov ? 'provincia' : S.ccaa ? 'ccaa' : 'espana', amb = S.prov ? S.prov : S.ccaa ? S.ccaa : 'es', where = aggScopeName();
    const src0 = rowsOf('e_historico_ambito').filter((r) => r.nivel === nivel && String(r.ambito) === String(amb));
    const finT = src0.reduce((m, r) => (r.fecha > m ? r.fecha : m), ''), limT = finT ? new Date(Date.parse(finT) - 30 * 864e5).toISOString().slice(0, 10) : '';
    const src = src0.filter((r) => r.fecha >= limT); // solo el último mes
    const series = TK.map((k) => {
      const p = src.filter((r) => r.tipo === k).map((r) => ({ d: day(r.fecha), abs: Number(r.puntos), est: Number(r.estaciones) })).sort((a, b) => a.d - b.d);
      const b0 = p.length ? p[0].abs : 0;
      p.forEach((q) => { q.v = q.abs - b0; });
      return { k, name: k === 'todas' ? 'Total' : TIPOS[k], sel: k === S.tipo, pts: p };
    }).filter((s) => s.pts.length);
    series.sort((a, b) => (a.sel === b.sel ? 0 : a.sel ? 1 : -1));
    const all = series.flatMap((s) => s.pts);
    const W = Math.max(260, box.clientWidth);
    let H = 300;
    box.style.minHeight = '0px'; box.replaceChildren();
    const nb = $('altas'), hr = host.getBoundingClientRect(), nr = nb.getBoundingClientRect();
    if (Math.abs(hr.top - nr.top) < 4 && Math.abs(hr.left - nr.left) > 20) {
      const used = box.getBoundingClientRect().top - hr.top + parseFloat(getComputedStyle(host).paddingBottom || '0') + 2;
      H = Math.max(300, Math.floor(nr.height - used));
    }
    box.style.minHeight = H + 'px';
    if (!all.length) return;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('class', 'fadein');
    const ext = d3.extent(all.map((p) => p.v).concat([0]));
    if (ext[0] === ext[1]) ext[1] = ext[0] + 1;
    const y = d3.scaleLinear(ext, [H - 28, 12]).nice();
    const meas = svg.append('g').attr('font-size', 'var(--cds-font-size-caption)');
    const tw = (s, w) => { const n = meas.append('text').attr('font-weight', w || null).text(s); const v = n.node().getComputedTextLength(); n.remove(); return v; };
    const yt = y.ticks(5).filter((v) => Number.isInteger(v));
    const ml = d3.max(yt, (v) => tw(fS(v))) + 10;
    const lab = (s) => s.name + ' ' + fS(s.pts[s.pts.length - 1].v);
    const mr = Math.min(W * 0.42, d3.max(series, (s) => tw(lab(s), 700)) + 12);
    meas.remove();
    const x = d3.scaleUtc(d3.extent(all, (p) => p.d), [ml, W - mr]);
    const g = svg.append('g');
    g.selectAll('line.gr').data(yt).join('line').attr('x1', ml).attr('x2', W - mr).attr('y1', y).attr('y2', y).attr('stroke', (v) => (v === 0 ? 'var(--color-fg-muted)' : 'var(--cds-chart-grid)'));
    g.selectAll('text.yt').data(yt).join('text').attr('x', ml - 8).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((v) => fS(v));
    const xt = x.ticks(Math.min(6, Math.max(2, Math.floor((W - ml - mr) / 80))));
    g.selectAll('text.xt').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').attr('fill', 'var(--color-fg-muted)').attr('font-size', 'var(--cds-font-size-caption)').text((d) => fD(d));
    const ln = d3.line().curve(d3.curveStepAfter).x((p) => x(p.d)).y((p) => y(p.v));
    series.forEach((s) => g.append('path').attr('d', ln(s.pts)).attr('fill', 'none').attr('stroke', TCOL[s.k]).attr('stroke-width', s.sel ? 3.5 : 1.5).attr('stroke-opacity', s.sel ? 1 : 0.55).attr('stroke-linejoin', 'round'));
    const ends = series.map((s) => ({ s, y: y(s.pts[s.pts.length - 1].v) })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    const over = ends.length ? ends[ends.length - 1].y - (H - 30) : 0;
    if (over > 0) ends.forEach((e) => { e.y -= over; });
    ends.forEach((e) => g.append('text').attr('x', W - mr + 8).attr('y', e.y).attr('dy', '0.32em').attr('fill', e.s.sel ? TCOL[e.s.k] : 'var(--color-fg-muted)').attr('font-weight', e.s.sel ? 700 : 400).attr('font-size', 'var(--cds-font-size-caption)').style('cursor', 'pointer').text(lab(e.s)).on('click', () => setTipo(e.s.k)));
    const rule = g.append('line').attr('y1', 12).attr('y2', H - 28).attr('stroke', 'var(--cds-chart-reference)').style('display', 'none');
    const dots = series.map((s) => g.append('circle').attr('r', s.sel ? 4.5 : 3).attr('fill', TCOL[s.k]).style('display', 'none'));
    const bis = d3.bisector((p) => p.d).center;
    const ref = series[series.length - 1];
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - ml - mr)).attr('height', H).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev); const p0 = ref.pts[bis(ref.pts, x.invert(mx))]; if (!p0) return;
        rule.attr('x1', x(p0.d)).attr('x2', x(p0.d)).style('display', null);
        const lines = [['t1', fDL(p0.d) + ' · ' + where]];
        series.slice().reverse().forEach((s) => { const i = series.indexOf(s); const p = s.pts[bis(s.pts, p0.d)]; if (p) { dots[i].attr('cx', x(p.d)).attr('cy', y(p.v)).style('display', null); lines.push(['t2', s.name + ': ' + fN(p.abs) + ' puntos (' + fS(p.v) + ')']); } });
        const [px, py] = d3.pointer(ev, host); showTip(tip, host, px, py, lines);
      })
      .on('mouseleave', () => { rule.style('display', 'none'); dots.forEach((d) => d.style('display', 'none')); tip.style.display = 'none'; });
    const first = ref.pts[0].d, last = ref.pts[ref.pts.length - 1].d;
    $('trendNote').textContent = where + ' · puntos ganados o perdidos en el registro desde el ' + fDL(first) + ' hasta el ' + fDL(last) + ', por tipo de carga. Resaltado: ' + (S.tipo === 'todas' ? 'total' : TIPOS[S.tipo]) + ' (pulsa un nombre para cambiarlo).';
  }

  // ---------- Tables ----------
  const mkTd = (cls, ...kids) => { const e = document.createElement('td'); if (cls) e.className = cls; e.append(...kids); return e; };
  const mkSpan = (cls, t) => { const e = document.createElement('span'); e.className = cls; e.textContent = t; return e; };
  const barCell = (txt, pct) => {
    const bar = document.createElement('span'); bar.className = 'pbar'; const inner = document.createElement('span');
    inner.style.width = Math.max(4, Math.min(100, pct)) + '%'; bar.append(inner);
    const pw = document.createElement('div'); pw.className = 'pwrap'; pw.append(bar, mkSpan('pval', txt));
    return mkTd('num price', pw);
  };

  function drawAltas() {
    const tb = $('altasTable').querySelector('tbody');
    if (!ok('e_estaciones')) { tb.replaceChildren(); return; }
    const rows = stations().rows.filter((r) => r.alta && tOk(r) && inScope(r)).sort((a, b) => b.alta.localeCompare(a.alta) || b.kw - a.kw);
    const mx = d3.max(rows, (r) => r.kw) || 1;
    const frag = document.createDocumentFragment();
    rows.forEach((r, i) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.id;
      tr.append(mkTd('', mkSpan('rank', String(i + 1))), mkTd('prov', fD(day(r.alta))), mkTd('mun', r.nombre), mkTd('prov', r.operador), mkTd('prov', r.municipio), mkTd('num prov', fN(r.puntos)), barCell(fN(r.kw), r.kw / mx * 100));
      frag.append(tr);
    });
    tb.replaceChildren(frag);
    if (!rows.length) { const tr = document.createElement('tr'); const td = mkTd('empty', 'No hay altas de este tipo en ' + scopeName() + ' en el último mes.'); td.colSpan = 7; tr.append(td); tb.append(tr); }
    $('altasHead').textContent = fN(rows.length) + (rows.length === 1 ? ' alta' : ' altas') + ' · ' + scopeName();
    $('altasAvg').textContent = rows.length ? fN(d3.sum(rows, (r) => r.puntos)) + ' puntos nuevos' : '';
    $('altasNote').textContent = 'Estaciones ' + (S.tipo === 'todas' ? '' : '(' + TIPOS[S.tipo].toLowerCase() + ') ') + 'que han entrado en el registro en el último mes, de la más reciente a la más antigua. Pulsa una para verla en el mapa.';
  }

  function drawTer() {
    const tb = $('terTable').querySelector('tbody');
    document.querySelectorAll('#e-terSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ter === terMode)));
    if (!ok('e_territorios')) { tb.replaceChildren(); return; }
    const all = rowsOf('e_territorios'), k = terSort.key, dir = terSort.dir;
    const cmp = (a, b) => (k === 'nombre' ? a.nombre.localeCompare(b.nombre, 'es') : a[k] - b[k]) * dir;
    const cc = all.filter((r) => r.nivel === 'ccaa' && (!S.ccaa || r.ccaa === S.ccaa)).sort(cmp);
    const out = [];
    cc.forEach((c) => { out.push(c); if (terMode === 'prov' || S.ccaa) all.filter((r) => r.nivel === 'provincia' && r.ccaa === c.ccaa).sort(cmp).forEach((p) => out.push(p)); });
    const mx = d3.max(all.filter((r) => r.nivel === 'ccaa'), (r) => r.pts_todas) || 1;
    const frag = document.createDocumentFragment(); let ci = 0;
    out.forEach((r) => {
      const isC = r.nivel === 'ccaa';
      const tr = document.createElement('tr'); tr.dataset.key = r.clave; tr.className = isC ? 'lvl-ccaa' : 'lvl-prov'; tr.style.setProperty('--tc', ccCol(r.ccaa));
      if ((isC && !S.prov && r.ccaa === S.ccaa) || (!isC && r.codigo === S.prov)) tr.style.background = 'var(--cds-surface-popover)';
      const dot = document.createElement('span'); dot.className = 'ccdot'; dot.style.background = ccCol(r.ccaa);
      const name = mkTd('mun'); if (isC) name.append(dot); name.append(r.nombre);
      tr.append(mkTd('', isC ? mkSpan('rank', String(++ci)) : ''), name, mkTd('num prov', fN(r.est_todas)), barCell(fN(r.pts_todas), Math.sqrt(r.pts_todas / mx) * 100),
        mkTd('num pmuted', fN(r.pts_ultra)), mkTd('num pmuted', fN(r.pts_rapida)), mkTd('num pmuted', fN(r.pts_lenta)), mkTd('num pmuted', f1(r.dens_todas)), mkTd('num pmuted', f1(r.cuota) + ' %'));
      frag.append(tr);
    });
    tb.replaceChildren(frag);
    document.querySelectorAll('#e-terTable th').forEach((th) => { const bt = th.querySelector('button'); if (bt) th.setAttribute('aria-sort', bt.dataset.sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    const np = out.filter((r) => r.nivel === 'provincia').length;
    $('terHead').textContent = (S.ccaa ? S.ccaa : 'España') + ' · ' + fN(cc.length) + (cc.length === 1 ? ' comunidad' : ' comunidades') + (np ? ' y ' + fN(np) + ' provincias' : '');
    $('terLegend').textContent = 'todos los tipos de carga';
    $('terNote').textContent = 'Estaciones y puntos de recarga de cada comunidad' + (np ? ', con sus provincias debajo' : '') + ', desglosados por tipo de carga, con los puntos por cada 100.000 habitantes y el peso sobre el total de España. Ordena por cualquier columna y pulsa una fila para verla en el mapa.';
  }

  // ---------- News ----------
  function drawNews() {
    const box = $('newsBox');
    if (bad(['e_noticias'])) { failBox(box); return; }
    if (!ok('e_noticias')) { box.classList.add('dash-skeleton'); return; }
    box.classList.remove('dash-skeleton');
    const rows = rowsOf('e_noticias').slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
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
      m.textContent = f === 'n' ? fN(v) : f === 'sn' ? fS(v) : f === 'd1' ? f1(v) : f === 'd' ? fD(day(v)) : f === 'dl' ? fDL(day(v)) : String(v);
      if (m.dataset.trend) { m.classList.toggle('down', v > 0); m.classList.toggle('up', v < 0); }
    });
  }

  function draw() {
    stations(); drawControls(); fillMarks('e_kpis'); fillMarks('e_insights'); drawMap(); drawCcaa(); drawMix(); drawMixChange(); drawOps(); drawAltas(); drawTrend(); drawHist(); drawTer(); drawNews();
  }
  dash.onData(draw);
  (window.__views = window.__views || {}).ev = draw;
  window.__views.evPick = (t) => { S.tipo = t; };
})();
