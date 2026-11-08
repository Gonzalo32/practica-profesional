const EXPORT_LIBS = {
  xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
  pdf: [
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
  ]
};

const loadedScripts = new Map();
function loadScript(src) {
  if (!loadedScripts.has(src)) {
    loadedScripts.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => {
        loadedScripts.delete(src);
        reject(new Error('No se pudo descargar la librería de exportación (¿hay conexión a internet?)'));
      };
      document.head.appendChild(script);
    }));
  }
  return loadedScripts.get(src);
}

async function loadExportLibs(format) {
  for (const src of EXPORT_LIBS[format]) await loadScript(src);
}

const exporters = {};

function registerExporter(name, provider) {
  exporters[name] = provider;
}

function exportFileName(base) {
  const date = new Date().toISOString().slice(0, 10);
  return `${base}_${date}`.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, '_');
}

async function exportData(name, format) {
  const provider = exporters[name];
  if (!provider) return;
  try {
    const [{ title, filename, columns, rows }] = await Promise.all([provider(), loadExportLibs(format)]);
    if (!rows.length) {
      showToast('No hay datos para exportar con los filtros actuales.', 'info');
      return;
    }
    const header = columns.map(c => c.header);
    const body = rows.map(row => columns.map(c => {
      const v = c.value(row);
      return v === null || v === undefined ? '' : v;
    }));

    if (format === 'xlsx') {
      const sheet = window.XLSX.utils.aoa_to_sheet([header, ...body]);
      sheet['!cols'] = header.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...body.map(r => String(r[i]).length)) + 2) }));
      const book = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(book, sheet, title.substring(0, 31));
      window.XLSX.writeFile(book, `${exportFileName(filename || title)}.xlsx`);
    } else {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: columns.length > 5 ? 'landscape' : 'portrait' });
      doc.setFontSize(14);
      doc.text(`CleanStock — ${title}`, 14, 15);
      doc.setFontSize(9);
      doc.setTextColor(110);
      doc.text(`Generado el ${new Date().toLocaleString('es-AR')} por ${getUserDisplayName(state.user)}`, 14, 21);
      doc.autoTable({
        head: [header],
        body: body.map(r => r.map(String)),
        startY: 26,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [31, 111, 139] },
        alternateRowStyles: { fillColor: [244, 247, 250] }
      });
      doc.save(`${exportFileName(filename || title)}.pdf`);
    }
    showToast(`Exportado: ${title} (${rows.length} filas)`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-export]');
  if (!btn) return;
  exportData(btn.dataset.export, btn.dataset.format);
});
