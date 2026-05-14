// Quick-jump locations across Hawaiʻi. Picked to span all major islands.

export const PLACES = [
  { name: 'All Islands',              bbox: [[-161.0, 18.5], [-154.4, 22.7]] },
  { name: 'Honolulu, Oʻahu',          center: [-157.858, 21.307], zoom: 13 },
  { name: 'Waikīkī, Oʻahu',           center: [-157.826, 21.276], zoom: 14 },
  { name: 'Kailua, Oʻahu',            center: [-157.740, 21.394], zoom: 13 },
  { name: 'Lahaina, Maui',            center: [-156.677, 20.871], zoom: 13 },
  { name: 'Kahului, Maui',            center: [-156.476, 20.890], zoom: 13 },
  { name: 'Hilo, Hawaiʻi Island',     center: [-155.084, 19.720], zoom: 12 },
  { name: 'Kailua-Kona, Hawaiʻi',     center: [-155.995, 19.640], zoom: 13 },
  { name: 'Volcanoes Nat\'l Park',    center: [-155.286, 19.430], zoom: 12 },
  { name: 'Lihuʻe, Kauaʻi',           center: [-159.366, 21.974], zoom: 13 },
  { name: 'Hanalei, Kauaʻi',          center: [-159.500, 22.207], zoom: 13 },
  { name: 'Kaunakakai, Molokaʻi',     center: [-157.020, 21.092], zoom: 13 },
  { name: 'Lānaʻi City, Lānaʻi',      center: [-156.923, 20.828], zoom: 13 },
];

export function setupQuickJump(map) {
  const sel = document.getElementById('quick-jump');
  if (!sel) return;

  // Populate
  sel.innerHTML = '<option value="">Jump to…</option>' +
    PLACES.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');

  sel.addEventListener('change', () => {
    const i = parseInt(sel.value, 10);
    if (Number.isNaN(i)) return;
    const p = PLACES[i];
    if (p.bbox) {
      map.fitBounds(p.bbox, { padding: 30, duration: 800 });
    } else if (p.center) {
      map.flyTo({ center: p.center, zoom: p.zoom, duration: 800 });
    }
    sel.value = ''; // reset to placeholder
  });
}
