import { HAZARDS, HAZARDS_BY_ID } from './config.js';

export function attachFeaturePopups(map) {
  map.on('click', (e) => {
    // Find features under cursor across all hazard fill layers
    const layerIds = HAZARDS.map(h => `${h.id}-fill`).filter(id => map.getLayer(id));
    if (!layerIds.length) return;

    const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
    if (!features.length) return;

    // Group by source (hazard id)
    const grouped = new Map();
    for (const f of features) {
      const id = f.source;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id).push(f);
    }

    const html = [...grouped.entries()].map(([hazardId, fs]) => {
      const hazard = HAZARDS_BY_ID[hazardId];
      if (!hazard) return '';
      const f = fs[0];
      return renderFeatureBlock(hazard, f.properties);
    }).join('<hr style="border:0;border-top:1px solid var(--border);margin:6px 0">');

    new maplibregl.Popup({ maxWidth: '320px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  // Pointer cursor on hover
  HAZARDS.forEach(h => {
    const id = `${h.id}-fill`;
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  });
}

export function renderFeatureBlock(hazard, props) {
  const rows = hazard.popup.fields.map(f => {
    const raw = props[f.field];
    const val = f.transform ? f.transform(raw) : (raw == null || raw === '' ? '—' : raw);
    return `<tr><td>${escapeHtml(f.label)}</td><td>${escapeHtml(val)}</td></tr>`;
  }).join('');

  const note = hazard.popup.note
    ? `<div class="muted" style="font-size:11px;margin-top:6px">${escapeHtml(hazard.popup.note)}</div>`
    : '';

  return `
    <div class="popup-title">${escapeHtml(hazard.popup.title)}</div>
    <table class="popup-table">${rows}</table>
    ${note}
  `;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
