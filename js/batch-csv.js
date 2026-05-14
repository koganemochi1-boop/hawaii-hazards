import { geocodeOne } from './search.js';
import { scorePoint } from './risk.js';

export function setupBatchCsv(layerManager) {
  const openBtn = document.getElementById('btn-batch');
  const panel = document.getElementById('batch-panel');
  const runBtn = document.getElementById('btn-batch-run');
  const uploadBtn = document.getElementById('btn-batch-upload');
  const fileInput = document.getElementById('batch-file');
  const status = document.getElementById('batch-status');
  const resultsEl = document.getElementById('batch-results');
  const input = document.getElementById('batch-input');

  openBtn.addEventListener('click', () => {
    panel.classList.remove('hidden');
  });

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    input.value = text;
    status.textContent = `Loaded ${f.name} (${(f.size / 1024).toFixed(1)} KB)`;
  });

  runBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) { status.textContent = 'Paste rows or load a CSV first.'; return; }

    const rows = parseInput(text);
    if (!rows.length) { status.textContent = 'No rows found.'; return; }

    runBtn.disabled = true;
    resultsEl.innerHTML = '';
    const results = [];

    const usesGeocoder = rows.some(r => r.kind === 'address');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      status.textContent = `Processing ${i + 1}/${rows.length}${row.kind === 'address' ? ' (geocoding)' : ''}…`;
      try {
        let lng, lat, label;
        if (row.kind === 'latlng') {
          lng = row.lng; lat = row.lat; label = row.label || `${lat.toFixed(4)},${lng.toFixed(4)}`;
        } else {
          const geo = await geocodeOne(row.address);
          if (!geo) {
            results.push({ input: row.address, error: 'not found' });
            renderTable(results, resultsEl);
            if (i < rows.length - 1) await sleep(1100);
            continue;
          }
          lng = geo.lng; lat = geo.lat; label = geo.label;
        }

        const { results: scored, composite, bucket } = await scorePoint([lng, lat], layerManager, { onlyActive: false });
        const hits = scored.filter(r => r.hit && r.score > 0);
        results.push({
          input: row.kind === 'address' ? row.address : row.label || `${lat.toFixed(4)},${lng.toFixed(4)}`,
          matched: label,
          lng, lat,
          composite, bucket,
          hits,
        });
      } catch (e) {
        results.push({ input: row.kind === 'address' ? row.address : `${row.lat},${row.lng}`, error: e.message });
      }
      // Be polite to Nominatim only when we're actually using it
      if (row.kind === 'address' && i < rows.length - 1) await sleep(1100);
      renderTable(results, resultsEl);
    }

    status.textContent = `Done. ${results.length} rows.`;
    runBtn.disabled = false;

    const dl = document.createElement('button');
    dl.className = 'btn';
    dl.textContent = 'Download CSV';
    dl.style.marginLeft = '10px';
    dl.addEventListener('click', () => downloadCsv(results));
    status.appendChild(dl);
  });
}

function parseInput(text) {
  // Detect CSV header
  if (/^[^\n]*,[^\n]*$/m.test(text.split('\n')[0]) || text.includes(',')) {
    try {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      const fields = (parsed.meta?.fields || []).map(f => f.toLowerCase());
      const latField = parsed.meta.fields[fields.indexOf('lat')] ?? parsed.meta.fields[fields.indexOf('latitude')];
      const lngField = parsed.meta.fields[fields.indexOf('lng')]
        ?? parsed.meta.fields[fields.indexOf('lon')]
        ?? parsed.meta.fields[fields.indexOf('longitude')];
      const addrField = parsed.meta.fields[fields.indexOf('address')];
      const labelField = parsed.meta.fields[fields.indexOf('label')] ?? parsed.meta.fields[fields.indexOf('name')];

      if (latField && lngField) {
        return parsed.data
          .map(r => ({
            kind: 'latlng',
            lat: parseFloat(r[latField]),
            lng: parseFloat(r[lngField]),
            label: labelField ? r[labelField] : null,
          }))
          .filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));
      }
      if (addrField) {
        return parsed.data
          .map(r => ({ kind: 'address', address: String(r[addrField] || '').trim() }))
          .filter(r => r.address);
      }
    } catch (_) { /* fall through */ }
  }

  // Plain text fallback
  return text.split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.startsWith('#'))
    .map(addr => ({ kind: 'address', address: addr }));
}

function renderTable(rows, el) {
  let html = '<table><thead><tr><th>Location</th><th>Risk</th><th>Score</th><th>Hazards</th></tr></thead><tbody>';
  for (const r of rows) {
    if (r.error) {
      html += `<tr><td>${escapeHtml(r.input)}</td><td colspan="3" class="muted">${escapeHtml(r.error)}</td></tr>`;
      continue;
    }
    const hazardList = r.hits.map(h => `${h.hazardName.split(' ')[0]}:${h.score.toFixed(2)}`).join(', ') || '—';
    const labelText = r.matched && r.matched !== r.input ? `${r.input} <span class="muted">→ ${truncate(r.matched, 40)}</span>` : r.input;
    html += `<tr>
      <td>${escapeHtml(labelText, false)}</td>
      <td><span class="risk-badge ${r.bucket.cls}">${r.bucket.label}</span></td>
      <td>${r.composite.toFixed(2)}</td>
      <td>${escapeHtml(hazardList)}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  el.innerHTML = html;
}

function downloadCsv(rows) {
  const out = rows.map(r => {
    if (r.error) return { input: r.input, error: r.error };
    return {
      input: r.input,
      matched_label: r.matched || '',
      lat: r.lat,
      lng: r.lng,
      composite: r.composite.toFixed(3),
      bucket: r.bucket.label,
      hazards: r.hits.map(h => `${h.hazardId}:${h.score.toFixed(2)}`).join('|'),
    };
  });
  const csv = Papa.unparse(out);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hazard-lookup-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function escapeHtml(s, escapeAll = true) {
  if (!escapeAll) return s; // already-safe HTML
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
