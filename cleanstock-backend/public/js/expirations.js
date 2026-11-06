// ==========================================================================
// CONTROL DE VENCIMIENTOS
// Lotes vencidos o por vencer, con acceso directo a darlos de baja
// ==========================================================================

let loadedExpirations = [];

async function loadExpirationsPanel() {
  await ensureBaseData();
  const branchFilter = document.getElementById('exp-filter-branch');
  if (hasRole('Administrador')) {
    fillSelect(branchFilter, state.branches, { placeholder: 'Todas las sucursales', getLabel: branchLabel });
    branchFilter.classList.remove('hidden');
  } else {
    branchFilter.classList.add('hidden');
  }

  const tbody = document.getElementById('table-expirations-body');
  setTableLoading(tbody, 8);
  try {
    const days = document.getElementById('exp-filter-days').value;
    loadedExpirations = await apiFetch(`/alerts/expirations?days=${days}`);
    renderExpirations();
  } catch (err) {
    renderErrorRow(tbody, 8, err.message);
  }
}

function filteredExpirations() {
  const branchId = document.getElementById('exp-filter-branch').value;
  return loadedExpirations.filter(e => !branchId || e.branchId === branchId);
}

function renderExpirations() {
  const list = filteredExpirations();
  const expExpired = document.getElementById('exp-stat-expired');
  if (expExpired) expExpired.textContent = list.filter(e => e.daysLeft < 0).length;
  const expUrgent = document.getElementById('exp-stat-urgent');
  if (expUrgent) expUrgent.textContent = list.filter(e => e.daysLeft >= 0 && e.daysLeft <= 7).length;
  const expUpcoming = document.getElementById('exp-stat-upcoming');
  if (expUpcoming) expUpcoming.textContent = list.filter(e => e.daysLeft >= 0).length;

  const tbody = document.getElementById('table-expirations-body');
  if (!list.length) {
    renderEmptyRow(tbody, 8, 'No hay lotes por vencer en este período', 'Los lotes se cargan con cada ingreso de stock con número de lote y vencimiento.');
    return;
  }

  const canExit = hasRole('Administrador', 'Usuario Responsable');
  tbody.innerHTML = list.map(e => {
    const badge = e.daysLeft < 0
      ? '<span class="status-badge status-rechazado">Vencido</span>'
      : e.daysLeft <= 7
        ? '<span class="status-badge status-warning">Urgente</span>'
        : '<span class="status-badge status-preparacion">Por vencer</span>';
    const daysText = e.daysLeft < 0 ? `hace ${-e.daysLeft} d` : e.daysLeft === 0 ? 'hoy' : `${e.daysLeft} d`;
    return `
      <tr>
        <td><strong>${escapeHtml(e.productName)}</strong></td>
        <td>${escapeHtml(e.branchName)}</td>
        <td><span class="badge">${escapeHtml(e.lotNumber)}</span></td>
        <td>${formatDateOnly(e.expirationDate)}</td>
        <td class="${e.daysLeft < 0 ? 'text-danger' : e.daysLeft <= 7 ? 'text-warning' : ''} strong">${daysText}</td>
        <td><span class="stock-qty ${e.daysLeft < 0 ? 'stock-critical' : 'stock-low'}">${e.remaining}</span></td>
        <td>${badge}</td>
        <td>${canExit && e.daysLeft < 0 ? `<button class="btn btn-danger-soft btn-sm" onclick="writeOffLot('${e.id}')">Dar de baja</button>` : ''}</td>
      </tr>`;
  }).join('');
}

// Abre el egreso precargado como "Producto vencido" con las unidades del lote
window.writeOffLot = (lotId) => {
  const lot = loadedExpirations.find(e => e.id === lotId);
  if (!lot) return;
  openExitModal({
    branchId: lot.branchId,
    productId: lot.productId,
    quantity: lot.remaining,
    exitType: 'VENCIDO',
    description: `Baja del lote ${lot.lotNumber} vencido el ${formatDateOnly(lot.expirationDate)}`
  });
};

document.getElementById('exp-filter-days')?.addEventListener('change', loadExpirationsPanel);
document.getElementById('exp-filter-branch')?.addEventListener('change', renderExpirations);

registerExporter('expirations', async () => ({
  title: 'Vencimientos',
  columns: [
    { header: 'Producto', value: e => e.productName },
    { header: 'Sucursal', value: e => e.branchName },
    { header: 'Lote', value: e => e.lotNumber },
    { header: 'Vencimiento', value: e => formatDateOnly(e.expirationDate) },
    { header: 'Días restantes', value: e => e.daysLeft },
    { header: 'Unidades', value: e => e.remaining },
    { header: 'Estado', value: e => (e.daysLeft < 0 ? 'Vencido' : e.daysLeft <= 7 ? 'Urgente' : 'Por vencer') }
  ],
  rows: filteredExpirations()
}));
