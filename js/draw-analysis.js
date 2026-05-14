import { scorePolygon } from './risk.js';
import { renderResultPanel } from './ui-result.js';

export function setupDrawAnalysis(map, layerManager) {
  const draw = new MapboxDraw({
    displayControlsDefault: false,
    controls: { polygon: true, trash: true },
    styles: drawStyles(),
  });
  // MapboxDraw expects mapbox-gl, but works with maplibre-gl via this shim:
  patchMapboxDrawForMaplibre(map);
  map.addControl(draw);

  // Hide the default Mapbox-draw button group — we drive it from the sidebar
  setTimeout(() => {
    const ctrl = document.querySelector('.mapboxgl-ctrl-group, .maplibregl-ctrl-group');
    // Don't hide entirely; just make sure it's not the only interface.
  }, 100);

  const btn = document.getElementById('btn-draw');
  btn.addEventListener('click', () => {
    btn.classList.add('active');
    draw.deleteAll();
    draw.changeMode('draw_polygon');
    renderResultPanel({
      title: 'Drawing mode',
      body: '<p>Click on the map to add vertices. Double-click to finish the polygon.</p>',
    });
  });

  map.on('draw.create', async (e) => {
    btn.classList.remove('active');
    const feat = e.features[0];
    await analyzeAndShow(feat, layerManager);
  });
  map.on('draw.update', async (e) => {
    const feat = e.features[0];
    await analyzeAndShow(feat, layerManager);
  });
  map.on('draw.delete', () => {
    renderResultPanel({ title: 'Drawing cleared', body: '<p class="muted">Draw a new polygon to analyze another area.</p>' });
  });
}

async function analyzeAndShow(feature, layerManager) {
  renderResultPanel({ title: 'Analyzing area…', body: '<p class="muted">Computing hazard coverage…</p>' });

  try {
    const { results, composite, bucket, polyAreaM2 } = await scorePolygon(feature, layerManager);

    const areaAcres = polyAreaM2 / 4046.8564224;
    const areaKm2 = polyAreaM2 / 1e6;

    const hit = results.filter(r => r.coverPct > 0).sort((a, b) => b.coverPct - a.coverPct);

    let body = `
      <p>
        <strong>Composite max risk:</strong>
        <span class="risk-badge ${bucket.cls}">${bucket.label}</span>
        <span class="muted"> (${composite.toFixed(2)})</span>
      </p>
      <p class="muted" style="font-size:11px">
        Area: ${areaKm2.toFixed(3)} km² (${areaAcres.toFixed(1)} acres)
      </p>
    `;

    if (!hit.length) {
      body += '<p>No mapped hazards intersect this area.</p>';
    } else {
      body += '<table><thead><tr><th>Hazard</th><th>Coverage</th><th>Max</th></tr></thead><tbody>';
      for (const r of hit) {
        const cats = r.categories.length ? ` <span class="muted">(${escapeHtml(r.categories.slice(0, 3).join(', '))})</span>` : '';
        body += `<tr>
          <td>${escapeHtml(r.hazardName)}${cats}</td>
          <td>${r.coverPct.toFixed(1)}%</td>
          <td>${r.maxScore.toFixed(2)}</td>
        </tr>`;
      }
      body += '</tbody></table>';
    }

    renderResultPanel({ title: 'Area hazard summary', body });
  } catch (err) {
    console.error(err);
    renderResultPanel({ title: 'Analysis failed', body: `<p class="muted">${escapeHtml(err.message)}</p>` });
  }
}

// MapboxDraw assumes window.mapboxgl exists. Alias maplibregl for it.
function patchMapboxDrawForMaplibre() {
  if (!window.mapboxgl) {
    window.mapboxgl = window.maplibregl;
  }
}

function drawStyles() {
  // Light, accessible styling for the drawn polygon
  return [
    {
      id: 'gl-draw-polygon-fill',
      type: 'fill',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'fill-color': '#0a6cc1', 'fill-opacity': 0.15 },
    },
    {
      id: 'gl-draw-polygon-stroke',
      type: 'line',
      filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
      paint: { 'line-color': '#0a6cc1', 'line-width': 2 },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-halo-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 5, 'circle-color': '#fff' },
    },
    {
      id: 'gl-draw-polygon-and-line-vertex-active',
      type: 'circle',
      filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
      paint: { 'circle-radius': 3, 'circle-color': '#0a6cc1' },
    },
    {
      id: 'gl-draw-line-active',
      type: 'line',
      filter: ['all', ['==', '$type', 'LineString'], ['==', 'active', 'true']],
      paint: { 'line-color': '#0a6cc1', 'line-dasharray': [0.2, 2], 'line-width': 2 },
    },
  ];
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
