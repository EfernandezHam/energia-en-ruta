(() => {
  const views = { carb: 'er-view-carb', ev: 'er-view-ev' };
  const tokens = { carb: 'carburantes', ev: 'recarga' };
  const byToken = { carburantes: 'carb', recarga: 'ev' };
  function show(v, pick, scroll) {
    const W = window.__views || {};
    if (pick && v === 'carb' && W.carbPick) W.carbPick(pick);
    if (pick && v === 'ev' && W.evPick) W.evPick(pick);
    Object.entries(views).forEach(([k, id]) => { const el = document.getElementById(id); if (el) el.hidden = k !== v; });
    document.querySelectorAll('#er-pick .er-head').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    const picked = !!v;
    document.getElementById('er-pick').classList.toggle('compact', picked);
    document.getElementById('er-hero').classList.toggle('compact', picked);
    document.getElementById('er-hint').hidden = picked;
    if (picked) {
      try { dash.setLink(tokens[v]); } catch (e) { /* sin enlace */ }
      requestAnimationFrame(() => {
        const f = (window.__views || {})[v];
        if (typeof f === 'function') f();
        if (scroll) document.getElementById('er-hero').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }
  document.getElementById('er-pick').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) show(b.dataset.view, b.dataset.pick || null, true); });
  show(byToken[(location.hash || '').replace('#', '')] || null, null, false);
})();
