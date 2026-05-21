// Minimal turf shims for the engine's needs. The real turf library ships in
// the browser via CDN; under Node tests we don't pull it in as a dependency.
// The engine only uses turf.point() and turf.booleanPointInPolygon(); both are
// small enough to inline.

export function point(coords, properties = {}) {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: coords },
  };
}

/**
 * Ray-casting point-in-polygon. Handles Polygon and MultiPolygon.
 * Good enough for our unit tests where features are simple bounding boxes.
 */
export function booleanPointInPolygon(point, polygon) {
  const [x, y] = point.geometry.coordinates;
  const geom = polygon.geometry || polygon;
  if (geom.type === 'Polygon') {
    return pip(x, y, geom.coordinates);
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(rings => pip(x, y, rings));
  }
  return false;
}

function pip(x, y, rings) {
  // Outer ring only for our test fixtures; holes ignored.
  const ring = rings[0];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
