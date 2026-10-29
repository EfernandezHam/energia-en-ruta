/* Energía en Ruta: motor de datos del dashboard en versión independiente.
 *
 * Sustituye al motor de Claude con la misma interfaz (dash.data, dash.calc,
 * dash.onData, dash.setLink...), así carb.js y ev.js funcionan sin cambios.
 * Los datos son los CSV/JSON de la carpeta data/, que GitHub Actions
 * regenera cada día.
 */
(() => {
  const SOURCES = {
    c_estaciones: 'data/c_estaciones.csv',
    c_historico_espana: 'data/c_historico_espana.csv',
    c_historico_provincias: 'data/c_historico_provincias.csv',
    c_noticias: 'data/c_noticias.json',
    e_estaciones: 'data/e_estaciones.csv',
    e_historico_provincias: 'data/e_historico_provincias.csv',
    e_noticias: 'data/e_noticias.json',
    e_poblacion: 'data/e_poblacion.csv',
    limites: 'data/limites.json',
  };
  // Cambia cada día: evita que el navegador sirva datos de ayer desde la caché.
  const STAMP = new Date().toISOString().slice(0, 10);

  const store = {};   // id -> {status, data, columns, message}
  const calcs = {};   // id -> {inputs, fn, cache, ver}
  const listeners = [];
  let version = 0;
  let scheduled = false;

  function notify() {
    version += 1;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      listeners.forEach((fn) => {
        try { fn(); } catch (e) { console.error('[dash] onData', e); }
      });
    });
  }

  function load(id) {
    const url = SOURCES[id];
    if (!url) { store[id] = { status: 'missing', data: [], columns: [], message: 'Fuente desconocida: ' + id }; return; }
    store[id] = { status: 'loading', data: [], columns: [] };
    fetch(url + '?v=' + STAMP)
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((text) => {
        if (url.endsWith('.json')) {
          const js = JSON.parse(text);
          const rows = Array.isArray(js) ? js : (js.rows || js.data || js.results || js);
          store[id] = { status: 'ok', data: rows, columns: Array.isArray(rows) && rows[0] ? Object.keys(rows[0]) : [] };
        } else {
          const rows = d3.csvParse(text);
          store[id] = { status: 'ok', data: rows, columns: rows.columns || [] };
        }
      })
      .catch((e) => {
        console.error('[dash] no se pudo cargar', id, e);
        store[id] = { status: 'error', data: [], columns: [], message: String(e.message || e) };
      })
      .finally(notify);
  }

  function result(entry) {
    return { status: entry.status, data: entry.data, columns: entry.columns || [], message: entry.message, refreshing: false, meta: [],
      get rows() { return entry.data; }, get value() { return entry.data; } };
  }

  function data(id) {
    if (calcs[id]) return result(runCalc(id));
    if (!store[id]) load(id);
    return result(store[id]);
  }

  function runCalc(id) {
    const c = calcs[id];
    if (c.cache && c.ver === version) return c.cache;
    const ins = c.inputs.map((i) => data(i));
    let out;
    const failed = ins.find((r) => ['error', 'missing'].includes(r.status));
    if (failed) out = { status: 'error', data: [], message: failed.message };
    else if (ins.some((r) => r.status !== 'ok')) out = { status: 'loading', data: [] };
    else {
      try {
        const val = c.fn(...ins.map((r) => r.data));
        out = { status: 'ok', data: val == null ? [] : val, columns: Array.isArray(val) && val[0] && typeof val[0] === 'object' ? Object.keys(val[0]) : [] };
      } catch (e) {
        console.error('[dash] cálculo', id, e);
        out = { status: 'error', data: [], message: String(e.message || e) };
      }
    }
    c.cache = out; c.ver = version;
    return out;
  }

  let lastWidth = 0;
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = document.documentElement.clientWidth;
      if (w !== lastWidth) { lastWidth = w; notify(); }
    }, 150);
  });

  const params = {};
  window.dash = {
    data,
    calc(id, spec) { calcs[id] = { inputs: spec.inputs || [], fn: spec.fn, cache: null, ver: -1 }; },
    loader() { /* no hace falta: los datos ya vienen como filas */ },
    onData(fn) {
      listeners.push(fn);
      lastWidth = document.documentElement.clientWidth;
      try { fn(); } catch (e) { console.error('[dash] onData', e); }
    },
    refresh(id) { if (SOURCES[id]) { load(id); notify(); } },
    setLink(token) { try { history.replaceState(null, '', token ? '#' + token : location.pathname); } catch (e) { /* nada */ } },
    params: () => ({ ...params }),
    setParams(p) { Object.assign(params, p); notify(); },
    resetParams() { Object.keys(params).forEach((k) => delete params[k]); notify(); },
    colors: ['#c96442', '#4b7bb5', '#5b9a6b', '#c49a2c', '#8a63b8', '#3b9a9a', '#b8577a', '#7a7a72'],
  };

  // Línea de "última actualización" al pie, a partir de data/meta.json.
  fetch('data/meta.json?v=' + STAMP).then((r) => (r.ok ? r.json() : null)).then((m) => {
    if (!m) return;
    const f = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }) : '—');
    const p = document.createElement('p');
    p.className = 'er-upd';
    p.textContent = 'Actualización automática diaria · carburantes: ' + f(m.carburantes && m.carburantes.actualizado) +
      ' · recarga: ' + f(m.recarga && m.recarga.actualizado) + ' · noticias: ' + f(m.noticias && m.noticias.actualizado);
    (document.getElementById('dash-root') || document.body).append(p);
  }).catch(() => {});
})();
