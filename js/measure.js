// Simple two-click distance measure tool.
// Drops a marker on each click, draws a line between them, displays distance.

import { renderResultPanel } from './ui-result.js';

const LINE_SOURCE = '__measure_line';
const POINTS_SOURCE = '__measure_points';

export function setupMeasure(map) {
  const btn = document.getElementById('btn-measure');
  let active = false;
  let points = [];

  function ensureSources() {
    if (!map.getSource(LINE_SOURCE)) {
      map.addSource(LINE_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: LINE_SOURCE,
        type: 'line',
        source: LINE_SOURCE,
        paint: { 'line-color': '#c0392b', 'line-width': 2, 'line-dasharray': [2, 1] },
      });
    }
    if (!map.getSource(POINTS_SOURCE)) {
      map.addSource(POINTS_SOURCE, { type: 'geojson', data: emptyFC() });
      map.addLayer({
        id: POINTS_SOURCE,
        type: 'circle',
        source: POINTS_SOURCE,
        paint: {
          'circle-radius': 5,
          'circle-color': '#c0392b',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
        },
      });
    }
  }

  function clear() {
    points = [];
    if (map.getSource(LINE_SOURCE)) map.getSource(LINE_SOURCE).setData(emptyFC());
    if (map.getSource(POINTS_SOURCE)) map.getSource(POINTS_SOURCE).setData(emptyFC());
  }

  btn.addEventListener('click', () => {
    active = !active;
    btn.classList.toggle('active', active);
    document.getElementById('map').classList.toggle('point-query-active', active);
    if (!active) { clear(); return; }
    ensureSources();
    clear();
    renderResultPanel({
      title: 'Measure distance',
      body: '<p class="muted">Click the first point. Click again for the second. Click <em>Measure distance</em> in the sidebar again to clear.</p>',
    });
  });

  map.on('click', (e) => {
    if (!active) return;
    points.push([e.lngLat.lng, e.lngLat.lat]);
    if (points.length === 1) {
      map.getSource(POINTS_SOURCE).setData({
        type: 'FeatureCollection',
        features: [turf.point(points[0])],
      });
      renderResultPanel({
        title: 'Measure distance',
        body: '<p class="muted">Click the second point to complete the measurement.</p>',
      });
    } else if (points.length === 2) {
      const line = turf.lineString(points);
      const km = turf.length(line, { units: 'kilometers' });
      const miles = km * 0.621371;
      const meters = km * 1000;
      map.getSource(POINTS_SOURCE).setData({
        type: 'FeatureCollection',
        features: points.map(p => turf.point(p)),
      });
      map.getSource(LINE_SOURCE).setData({
        type: 'FeatureCollection',
        features: [line],
      });
      renderResultPanel({
        title: 'Distance',
        body: `
          <p><strong>${miles.toFixed(2)} mi</strong> · ${km.toFixed(2)} km · ${meters.toFixed(0)} m</p>
          <p class="muted" style="font-size:11px">
            ${points[0][1].toFixed(5)}°N, ${(-points[0][0]).toFixed(5)}°W →
            ${points[1][1].toFixed(5)}°N, ${(-points[1][0]).toFixed(5)}°W
          </p>
          <p class="muted" style="font-size:11px">Great-circle distance. Click <em>Measure distance</em> again to clear.</p>
        `,
      });
      // Reset for a new pair on the next click
      points = [];
    }
  });
}

function emptyFC() { return { type: 'FeatureCollection', features: [] }; }
