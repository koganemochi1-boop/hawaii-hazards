// PNG / PDF export of the current map view + sidebar legend.

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
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(14);
      pdf.text('Hawaiʻi Natural Hazards — Map View', 36, 36);
      pdf.setFontSize(9);
      pdf.text(`Generated ${new Date().toLocaleString()}`, 36, 50);

      // Fit map image to page below the title, preserving aspect
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => { img.onload = r; });
      const maxW = pageW - 72;
      const maxH = pageH - 100;
      const ratio = Math.min(maxW / img.width, maxH / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      pdf.addImage(dataUrl, 'PNG', 36, 66, w, h);

      pdf.setFontSize(8);
      pdf.text(
        'Sources: State of Hawaiʻi Statewide GIS (Hazards), FEMA NFHL, NOAA, USGS HVO. For planning awareness only.',
        36, pageH - 24
      );

      pdf.save(`hawaii-hazards-${Date.now()}.pdf`);
    } catch (e) { console.error(e); toast('Export failed: ' + e.message); }
  });
}

async function captureMapPng(map) {
  // MapLibre's canvas isn't `preserveDrawingBuffer` by default. We force a
  // synchronous repaint then read from the canvas before the buffer clears.
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

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}
