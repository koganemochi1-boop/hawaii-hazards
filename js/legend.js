import { HAZARDS_BY_ID } from './config.js';

export function renderLegend(activeIds) {
  const container = document.getElementById('legend-list');
  if (!container) return;

  if (activeIds.size === 0) {
    container.innerHTML = '<p class="muted">Turn on layers to see legend entries.</p>';
    return;
  }

  const html = [...activeIds].map(id => {
    const h = HAZARDS_BY_ID[id];
    if (!h) return '';
    const rows = h.legend.map(entry => `
      <div class="legend-row">
        <div class="legend-swatch" style="background:${entry.color}"></div>
        <span>${escapeHtml(entry.label)}</span>
      </div>
    `).join('');
    return `<div class="legend-group"><h4>${escapeHtml(h.name)}</h4>${rows}</div>`;
  }).join('');

  container.innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
