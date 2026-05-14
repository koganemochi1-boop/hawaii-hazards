// PNG / PDF export of the current map view + active legend.
//
// PNG: raw canvas capture.
// PDF: letter-landscape with title bar, map image, legend column with active
//      hazard colors and labels, and an attribution/disclaimer footer.

import { HAZARDS_BY_ID } from './config.js';

export function setupExport(map) {
  document.getElementById('btn-export-png').addEventListener('click', async () => {
    try {
      const blob = await captureMapPng(map);
      downloadBlob(blob, `hawaii-hazards-${Date.now()}.png`);
    } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
  });

  document.getElementById('btn-export-pdf').addEventListener('click', async () => {
    try {
      const blob = await captureMapPng(map);
      const dataUrl = await blobToDataUrl(blob);
      await buildPdf(map, dataUrl);
    } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
  });
}

async function buildPdf(map, mapDataUrl) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('Hawaiʻi Natural Hazards — Map View', margin, margin);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Generated ${new Date().toLocaleString()}`, margin, margin + 14);

  // Layout: map on the left ~70%, legend on the right ~30%
  const contentTop = margin + 26;
  const contentBottom = pageH - margin - 14;
  const contentH = contentBottom - contentTop;

  const legendW = 200;
  const mapAreaW = pageW - margin * 2 - legendW - 16;

  // Map image — fit preserving aspect
  const img = new Image();
  img.src = mapDataUrl;
  await new Promise(r => { img.onload = r; });
  const ratio = Math.min(mapAreaW / img.width, contentH / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  pdf.addImage(mapDataUrl, 'PNG', margin, contentTop, w, h);

  // Legend column
  const legendX = margin + mapAreaW + 16;
  let y = contentTop;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Active hazard layers', legendX, y);
  y += 14;

  // Pull active layer ids from window.__app — there's only one app instance
  const activeIds = window.__app?.layerManager?.activeIds || new Set();

  if (activeIds.size === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.text('(no layers active)', legendX, y);
  } else {
    for (const id of activeIds) {
      const hazard = HAZARDS_BY_ID[id];
      if (!hazard) continue;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      const wrapped = pdf.splitTextToSize(hazard.name, legendW);
      pdf.text(wrapped, legendX, y);
      y += wrapped.length * 12;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      for (const entry of hazard.legend) {
        const [r, g, b] = hexToRgb(entry.color);
        pdf.setFillColor(r, g, b);
        pdf.rect(legendX, y - 7, 10, 8, 'F');
        pdf.setTextColor(40, 50, 70);
        pdf.text(entry.label, legendX + 14, y);
        y += 11;
        if (y > contentBottom - 30) break; // keep within page
      }
      y += 6;
      if (y > contentBottom - 30) break;
    }
  }

  // Footer
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(90, 100, 120);
  pdf.text(
    'Sources: State of Hawaiʻi Statewide GIS (Hazards), FEMA NFHL, NOAA Office for Coastal Management, USGS HVO. ' +
    'For planning awareness only — not for regulatory determination.',
    margin, pageH - margin + 4, { maxWidth: pageW - margin * 2 }
  );

  pdf.save(`hawaii-hazards-${Date.now()}.pdf`);
}

async function captureMapPng(map) {
  // Force a repaint cycle so the canvas has the freshest pixels, then snapshot.
  return new Promise((resolve, reject) => {
    map.once('render', () => {
      try {
        map.getCanvas().toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob returned null'));
        }, 'image/png');
      } catch (e) { reject(e); }
    });
    map.triggerRepaint();
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  const num = parseInt(v.length === 3 ? v.split('').map(c => c + c).join('') : v, 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
