import { scorePoint } from './risk.js';
import { renderResultPanel } from './ui-result.js';

export function setupPointQuery(map, layerManager) {
  const btn = document.getElementById('btn-point-query');
  let active = false;
  let marker = null;

  btn.addEventListener('click', () => {
    active = !active;
    btn.classList.toggle('active', active);
    document.getElementById('map').classList.toggle('point-query-active', active);
    if (!active && marker) { marker.remove(); marker = null; }
  });

  map.on('click', async (e) => {
    if (!active) return;
    if (marker) marker.remove();
    marker = new maplibregl.Marker({ color: '#c0392b' })
      .setLngLat(e.lngLat)
      .addTo(map);

    renderResultPanel({
      title: 'Analyzing location…',
      body: '<p class="muted">Querying hazard layers…</p>',
    });

    const lngLat = [e.lngLat.lng, e.lngLat.lat];
    const { results, composite, bucket } = await scorePoint(lngLat, layerManager, { onlyActive: false });

    const hits = results.filter(r => r.hit);
    const misses = results.filter(r => !r.hit);

    let body = `
      <p>
        <strong>Composite risk:</strong>
        <span class="risk-badge ${bucket.cls}">${bucket.label}</span>
        <span class="muted"> (${composite.toFixed(2)})</span>
      </p>
      <p class="muted" style="font-size:11px">
        ${lngLat[1].toFixed(5)}°N, ${(-lngLat[0]).toFixed(5)}°W
      </p>
    `;

    if (hits.length === 0) {
      body += '<p>No mapped hazards intersect this point.</p>';
    } else {
      body += '<h4 style="margin:10px 0 4px;font-size:13px">Hazards present</h4><table>';
      body += '<thead><tr><th>Hazard</th><th>Detail</th><th>Score</th></tr></thead><tbody>';
      for (const r of hits) {
        const detail = describeFeature(r);
        body += `<tr><td>${escapeHtml(r.hazardName)}</td><td>${escapeHtml(detail)}</td><td>${r.score.toFixed(2)}</td></tr>`;
      }
      body += '</tbody></table>';
    }

    if (misses.length) {
      const names = misses.map(m => m.hazardName).join(', ');
      body += `<p class="muted" style="font-size:11px;margin-top:8px">Not present: ${escapeHtml(names)}</p>`;
    }

    renderResultPanel({
      title: 'Location risk summary',
      body,
    });
  });
}

function describeFeature(r) {
  if (!r.topFeature) return '';
  const p = r.topFeature.properties || {};
  const h = r.hazard;
  const main = h.popup.fields[0];
  const v = main.transform ? main.transform(p[main.field]) : p[main.field];
  return v ?? '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
