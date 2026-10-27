// ==========================================================================
// SUCURSALES, STOCK POR SUCURSAL, AJUSTE MANUAL E HISTORIAL DE MOVIMIENTOS
// ==========================================================================

const branchFilters = { search: '', type: '' };

async function loadBranchesPanel() {
  const tbody = document.getElementById('table-branches-body');
  setTableLoading(tbody, 6, 3);
  try {
    state.branches = await apiFetch('/branches');
    document.getElementById('btn-open-create-branch-modal').classList.toggle('hidden', !hasRole('Administrador'));
    renderFilteredBranches();
  } catch (err) {
    renderErrorRow(tbody, 6, err.message);
  }
}

document.getElementById('branch-search-input')?.addEventListener('input', debounce((e) => {
  branchFilters.search = e.target.value.toLowerCase().trim();
  renderFilteredBranches();
}, 200));
document.getElementById('branch-filter-type')?.addEventListener('change', (e) => {
  branchFilters.type = e.target.value.toLowerCase();
  renderFilteredBranches();
});

function renderFilteredBranches() {
  const tbody = document.getElementById('table-branches-body');
  const filtered = state.branches.filter(b => {
    const haystack = [b.name, b.address, b.phone].join(' ').toLowerCase();
    return (!branchFilters.search || haystack.includes(branchFilters.search)) &&
      (!branchFilters.type || (b.type || '').toLowerCase() === branchFilters.type);
  });

  if (!filtered.length) {
    renderEmptyRow(tbody, 6, 'No se encontraron sucursales', 'No hay sucursales que coincidan con la búsqueda o el filtro.');
    return;
  }

  const isAdmin = hasRole('Administrador');
  tbody.innerHTML = filtered.map(branch => `
    <tr>
      <td><strong>${escapeHtml(branch.name)}</strong></td>
      <td><span class="badge badge-solicita">${escapeHtml(capitalize(branch.type))}</span></td>
      <td>${branch.address ? escapeHtml(branch.address) : '<span class="muted">Sin dirección</span>'}</td>
      <td>${branch.phone ? escapeHtml(branch.phone) : '<span class="muted">Sin registrar</span>'}</td>
      <td>${branch.description ? escapeHtml(branch.description) : '<span class="muted">—</span>'}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn-icon" title="Ver Detalle" onclick="openViewBranchModal('${branch.id}')">${ICON_VIEW}</button>
          ${isAdmin ? `
            <button class="btn-icon" title="Editar Sucursal" onclick="openBranchModal('${branch.id}')">${ICON_EDIT}</button>
            <button class="btn-icon btn-icon-danger" title="Eliminar Sucursal" onclick="deleteBranch('${branch.id}')">${ICON_DELETE}</button>
          ` : ''}
        </div>
      </td>
    </tr>`).join('');
}

window.openViewBranchModal = (branchId) => {
  const branch = state.branches.find(b => b.id === branchId);
  if (!branch) return;
  document.getElementById('view-branch-details-content').innerHTML = `
    <div class="span-2"><strong>Nombre:</strong> ${escapeHtml(branch.name)}</div>
    <div><strong>Tipo:</strong> ${escapeHtml(capitalize(branch.type))}</div>
    <div><strong>Teléfono / Contacto:</strong> ${escapeHtml(branch.phone || 'Sin registrar')}</div>
    <div class="span-2"><strong>Dirección:</strong> ${escapeHtml(branch.address || 'Sin dirección')}</div>
    <div class="span-2"><strong>Descripción:</strong> ${escapeHtml(branch.description || 'Sin descripción')}</div>`;
  openModal('modal-view-branch');
};

// Modal único para crear y editar sucursales
const branchDesc = document.getElementById('branch-description');
const branchCounter = document.getElementById('branch-desc-counter');
branchDesc?.addEventListener('input', () => { branchCounter.textContent = `${branchDesc.value.length} / 200`; });

window.openBranchModal = (branchId = null) => {
  const branch = branchId ? state.branches.find(b => b.id === branchId) : null;
  document.getElementById('form-branch').reset();
  document.getElementById('branch-id').value = branch?.id || '';
  document.getElementById('branch-name').value = branch?.name || '';
  document.getElementById('branch-type').value = branch?.type || 'sucursal';
  document.getElementById('branch-address').value = branch?.address || '';
  document.getElementById('branch-phone').value = branch?.phone || '';
  branchDesc.value = branch?.description || '';
  branchCounter.textContent = `${branchDesc.value.length} / 200`;
  document.getElementById('modal-branch-title').textContent = branch ? 'Editar Sucursal' : 'Crear Nueva Sucursal';
  document.getElementById('btn-branch-submit').textContent = branch ? 'Guardar Cambios' : 'Registrar Sucursal';
  openModal('modal-branch');
};
document.getElementById('btn-open-create-branch-modal')?.addEventListener('click', () => openBranchModal());

document.getElementById('form-branch')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('branch-id').value;
  const data = {
    name: document.getElementById('branch-name').value.trim(),
    type: document.getElementById('branch-type').value,
    address: document.getElementById('branch-address').value.trim(),
    phone: document.getElementById('branch-phone').value.trim(),
    description: branchDesc.value.trim()
  };
  try {
    await apiFetch(id ? `/branches/${id}` : '/branches', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    showToast(id ? 'Sucursal actualizada' : 'Sucursal registrada', 'success');
    closeModal('modal-branch');
    loadBranchesPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.deleteBranch = async (branchId) => {
  const branch = state.branches.find(b => b.id === branchId);
  const ok = await confirmDialog({
    title: 'Eliminar sucursal',
    message: `¿Seguro que querés eliminar "${branch?.name}"? Sus usuarios quedarán sin sucursal y se borrará su stock. Esta acción no se puede deshacer.`,
    confirmText: 'Eliminar sucursal',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/branches/${branchId}`, { method: 'DELETE' });
    showToast('Sucursal eliminada', 'success');
    loadBranchesPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Stock por sucursal
// --------------------------------------------------------------------------
let currentStockItems = [];
let currentStockBranch = null;
let stockSearch = '';

async function loadBranchStockPanel() {
  await ensureBaseData();
  const branches = operableBranches();
  const sel = document.getElementById('stock-view-branch-select');
  fillSelect(sel, branches, { placeholder: branches.length > 1 ? '— Seleccionar sucursal —' : null, getLabel: branchLabel, value: sel.value || userBranchId() || branches[0]?.id });
  sel.disabled = branches.length <= 1;

  fillSelect(document.getElementById('movements-filter-product'), state.products, { placeholder: 'Todos los productos' });

  if (!sel.value && branches.length) sel.value = branches[0].id;
  if (sel.value) await loadStockForBranch(sel.value);
  else renderEmptyRow(document.getElementById('table-branch-stock-body'), 9, 'No tenés una sucursal asignada', 'Pedile al administrador que te asigne una.');
}

async function loadStockForBranch(branchId) {
  const tbody = document.getElementById('table-branch-stock-body');
  setTableLoading(tbody, 9);
  try {
    const { branch, stockItems, totalValue } = await apiFetch(`/branches/${branchId}/stock`);
    currentStockItems = stockItems;
    currentStockBranch = branch;
    const typeLabel = branch.name.toLowerCase().startsWith((branch.type || '').toLowerCase()) ? '' : ` (${capitalize(branch.type)})`;
    document.getElementById('stock-view-branch-title').textContent = `Stock — ${branch.name}${typeLabel}`;
    document.getElementById('stock-view-total-value').textContent = `Valor total: ${formatMoney(totalValue)}`;
    renderStockTable();
  } catch (err) {
    renderErrorRow(tbody, 9, err.message);
  }
  movementFilters.page = 1;
  loadMovementsTraceability();
}

function filteredStockItems() {
  const onlyLow = document.getElementById('stock-view-filter').value === 'low';
  return currentStockItems.filter(item => {
    const p = item.Producto || {};
    const matchesSearch = !stockSearch || [p.name, p.sku].join(' ').toLowerCase().includes(stockSearch);
    const isLow = item.quantity <= (item.effectiveMinStock || 0);
    return matchesSearch && (!onlyLow || isLow);
  });
}

function expirationCell(date) {
  if (!date) return '<span class="muted">—</span>';
  // Vencimientos guardados como medianoche UTC: "hoy" se compara en el mismo formato
  const now = new Date();
  const days = Math.round((new Date(date) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const cls = days < 0 ? 'text-danger' : days <= 30 ? 'text-warning' : '';
  return `<span class="${cls}">${formatDateOnly(date)}</span>`;
}

function renderStockTable() {
  const tbody = document.getElementById('table-branch-stock-body');
  const items = filteredStockItems();
  if (!items.length) {
    const onlyLow = document.getElementById('stock-view-filter').value === 'low';
    renderEmptyRow(tbody, 9, stockSearch ? 'Sin resultados' : onlyLow ? 'No hay productos con stock bajo' : 'Esta sucursal no tiene stock registrado aún');
    return;
  }
  tbody.innerHTML = items.map(item => {
    const product = item.Producto;
    const minStock = item.effectiveMinStock || 0;
    const available = item.availableQuantity;
    const stockClass = item.quantity === 0 ? 'stock-critical' : item.quantity <= minStock ? 'stock-low' : 'stock-ok';
    return `
      <tr>
        <td><strong>${escapeHtml(product?.name || 'N/A')}</strong></td>
        <td>${product?.sku ? escapeHtml(product.sku) : '<span class="muted">—</span>'}</td>
        <td><span class="badge">${escapeHtml(product?.Category?.name || '—')}</span></td>
        <td><span class="stock-qty ${stockClass}">${item.quantity}</span></td>
        <td><span class="text-warning strong">${item.reservedQuantity}</span></td>
        <td><span class="stock-qty ${stockClass}">${available}</span></td>
        <td><span class="muted">${minStock}</span></td>
        <td>${expirationCell(item.nextExpiration)}</td>
        <td>${item.costPrice ? formatMoney(item.stockValue) : '<span class="muted">—</span>'}</td>
      </tr>`;
  }).join('');
}

document.getElementById('stock-view-branch-select')?.addEventListener('change', (e) => {
  if (e.target.value) loadStockForBranch(e.target.value);
});
document.getElementById('stock-view-filter')?.addEventListener('change', renderStockTable);
document.getElementById('stock-view-search')?.addEventListener('input', debounce((e) => {
  stockSearch = e.target.value.toLowerCase().trim();
  renderStockTable();
}, 200));

registerExporter('stock', async () => ({
  title: `Stock ${currentStockBranch?.name || ''}`.trim(),
  columns: [
    { header: 'Producto', value: i => i.Producto?.name },
    { header: 'SKU', value: i => i.Producto?.sku || '' },
    { header: 'Categoría', value: i => i.Producto?.Category?.name || '' },
    { header: 'Total', value: i => i.quantity },
    { header: 'Reservado', value: i => i.reservedQuantity },
    { header: 'Disponible', value: i => i.availableQuantity },
    { header: 'Mínimo', value: i => i.effectiveMinStock },
    { header: 'Próximo vencimiento', value: i => (i.nextExpiration ? formatDateOnly(i.nextExpiration) : '') },
    { header: 'Costo unitario', value: i => i.costPrice },
    { header: 'Valor', value: i => i.stockValue }
  ],
  rows: filteredStockItems()
}));

// --------------------------------------------------------------------------
// Ajuste manual de stock
// --------------------------------------------------------------------------
let pendingAdjustData = null;

document.getElementById('btn-toggle-stock-adjust')?.addEventListener('click', () => {
  if (!hasRole('Administrador', 'Usuario Responsable')) return showToast('Tu rol no puede ajustar stock.', 'error');
  const branches = operableBranches();
  const current = document.getElementById('stock-view-branch-select').value;
  fillSelect(document.getElementById('adjust-branch'), branches, { getLabel: branchLabel, value: current });
  fillSelect(document.getElementById('adjust-product'), state.products, { placeholder: '— Seleccionar Producto —' });
  document.getElementById('form-stock-adjust').reset();
  document.getElementById('adjust-branch').value = current;
  document.getElementById('adjust-reason-other-group').classList.add('hidden');
  openModal('modal-stock-adjust');
});

const adjustQty = document.getElementById('adjust-quantity');
document.getElementById('btn-adjust-qty-minus')?.addEventListener('click', () => { adjustQty.value = (parseInt(adjustQty.value, 10) || 0) - 1; });
document.getElementById('btn-adjust-qty-plus')?.addEventListener('click', () => { adjustQty.value = (parseInt(adjustQty.value, 10) || 0) + 1; });

document.getElementById('adjust-reason-select')?.addEventListener('change', (e) => {
  const isOther = e.target.value === 'Otro';
  document.getElementById('adjust-reason-other-group').classList.toggle('hidden', !isOther);
  document.getElementById('adjust-reason-other').required = isOther;
});

document.getElementById('form-stock-adjust')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const branchId = document.getElementById('adjust-branch').value;
  const productId = document.getElementById('adjust-product').value;
  const quantity = parseInt(adjustQty.value, 10);
  const reasonSelect = document.getElementById('adjust-reason-select').value;
  const reason = reasonSelect === 'Otro' ? document.getElementById('adjust-reason-other').value.trim() : reasonSelect;

  if (!branchId || !productId || !quantity || !reason) {
    return showToast('Completá todos los campos. La cantidad no puede ser 0.', 'error');
  }

  const ok = await confirmDialog({
    title: 'Confirmar ajuste de stock',
    html: `
      <div class="confirm-summary">
        <div><strong>Sucursal:</strong> ${escapeHtml(getBranchName(branchId))}</div>
        <div><strong>Producto:</strong> ${escapeHtml(getProductName(productId))}</div>
        <div><strong>Ajuste:</strong> ${quantity > 0 ? `<span class="qty-in strong">+${quantity} unidades</span>` : `<span class="qty-out strong">${quantity} unidades</span>`}</div>
        <div><strong>Motivo:</strong> ${escapeHtml(reason)}</div>
      </div>`,
    confirmText: 'Aplicar ajuste'
  });
  if (!ok) return;

  try {
    await apiFetch(`/branches/${branchId}/stock/adjust`, { method: 'POST', body: JSON.stringify({ productId, quantity, reason }) });
    showToast('Ajuste de stock aplicado correctamente', 'success');
    closeModal('modal-stock-adjust');
    document.getElementById('stock-view-branch-select').value = branchId;
    loadStockForBranch(branchId);
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// --------------------------------------------------------------------------
// Historial de movimientos (paginado y filtrado en el servidor)
// --------------------------------------------------------------------------
const movementFilters = { page: 1, type: '', productId: '', from: '', to: '' };

function movementsQuery(extra = {}) {
  const params = new URLSearchParams({ page: movementFilters.page, limit: 15, ...extra });
  const branchId = document.getElementById('stock-view-branch-select').value;
  if (branchId) params.set('branchId', branchId);
  ['type', 'productId', 'from', 'to'].forEach(k => { if (movementFilters[k]) params.set(k, movementFilters[k]); });
  return `/branches/movements?${params}`;
}

async function loadMovementsTraceability() {
  const tbody = document.getElementById('table-movements-body');
  setTableLoading(tbody, 7, 4);
  try {
    const data = await apiFetch(movementsQuery());
    if (!data.items.length) {
      renderEmptyRow(tbody, 7, 'No hay movimientos con estos filtros');
    } else {
      tbody.innerHTML = data.items.map(m => `
        <tr>
          <td class="cell-date">${formatDateTime(m.createdAt)}</td>
          <td>${movementBadge(m)}</td>
          <td><strong>${escapeHtml(m.productName || '—')}</strong></td>
          <td>${signedQty(m.quantity)}</td>
          <td>${m.lotNumber ? escapeHtml(m.lotNumber) : '—'}</td>
          <td class="cell-detail">${escapeHtml([m.supplierName ? `Proveedor: ${m.supplierName}` : '', m.reason || ''].filter(Boolean).join(' — ') || '—')}</td>
          <td><strong>${escapeHtml(getUserDisplayName(m.User))}</strong></td>
        </tr>`).join('');
    }
    renderPagination('movements-pagination', data, 'movimientos', (page) => {
      movementFilters.page = page;
      loadMovementsTraceability();
    });
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}

[['type', 'movements-filter-type'], ['productId', 'movements-filter-product'], ['from', 'movements-filter-from'], ['to', 'movements-filter-to']].forEach(([key, id]) => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    movementFilters[key] = e.target.value;
    movementFilters.page = 1;
    loadMovementsTraceability();
  });
});

registerExporter('movements', async () => ({
  title: `Movimientos ${currentStockBranch?.name || ''}`.trim(),
  columns: [
    { header: 'Fecha', value: m => formatDateTime(m.createdAt) },
    { header: 'Tipo', value: m => (MOVEMENT_LABELS[m.type]?.[0] || m.type) + (m.subtype ? ` (${m.subtype})` : '') },
    { header: 'Sucursal', value: m => m.branchName },
    { header: 'Producto', value: m => m.productName },
    { header: 'Cantidad', value: m => m.quantity },
    { header: 'Lote', value: m => m.lotNumber || '' },
    { header: 'Proveedor', value: m => m.supplierName || '' },
    { header: 'Detalle', value: m => m.reason || '' },
    { header: 'Usuario', value: m => getUserDisplayName(m.User) }
  ],
  rows: (await apiFetch(movementsQuery({ page: 1, limit: 0 }))).items
}));
