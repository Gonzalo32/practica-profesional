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


  if (!sel.value && branches.length) sel.value = branches[0].id;
  if (sel.value) await loadStockForBranch(sel.value);
  else renderEmptyRow(document.getElementById('table-branch-stock-body'), 8, 'No tenés una sucursal asignada', 'Pedile al administrador que te asigne una.');
}

async function loadStockForBranch(branchId) {
  const tbody = document.getElementById('table-branch-stock-body');
  setTableLoading(tbody, 8);
  try {
    const [{ branch, stockItems }, lots] = await Promise.all([
      apiFetch(`/branches/${branchId}/stock`),
      apiFetch(`/inventory/lots?branchId=${encodeURIComponent(branchId)}&withStock=true`).catch(() => [])
    ]);
    currentStockItems = stockItems;
    currentStockBranch = branch;
    lotsByProduct = new Map();
    for (const lot of lots) {
      if (!lotsByProduct.has(lot.productId)) lotsByProduct.set(lot.productId, []);
      lotsByProduct.get(lot.productId).push(lot);
    }
    const typeLabel = branch.name.toLowerCase().startsWith((branch.type || '').toLowerCase()) ? '' : ` (${capitalize(branch.type)})`;
    document.getElementById('stock-view-branch-title').textContent = `Stock — ${branch.name}${typeLabel}`;
    stockPage = 1;
    renderStockTable();
  } catch (err) {
    renderErrorRow(tbody, 8, err.message);
  }
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

let stockPage = 1;
const STOCK_PER_PAGE = 10;

// Variantes de cada producto (lotes y vencimientos) en esta sucursal: se ven en una ventana flotante
let lotsByProduct = new Map();

function openStockLotsModal(productId) {
  const item = currentStockItems.find(i => String(i.Producto?.id || i.productId) === String(productId));
  if (!item) return;
  const lots = lotsByProduct.get(String(productId)) || [];
  const inLots = lots.reduce((sum, l) => sum + (l.remaining || 0), 0);
  const withoutLot = item.quantity - inLots;

  document.getElementById('stock-lots-title').textContent = item.Producto?.name || 'Producto';
  document.getElementById('stock-lots-summary').textContent =
    `${currentStockBranch?.name || ''}: ${item.quantity} u. en total, ${lots.length} lote${lots.length === 1 ? '' : 's'}${withoutLot > 0 ? ` y ${withoutLot} u. sin lote` : ''}. Ordenados por vencimiento.`;

  const rows = lots.map(l => `
      <tr>
        <td><span class="badge">${escapeHtml(l.lotNumber || 'Sin número')}</span></td>
        <td>${l.brandName ? escapeHtml(l.brandName) : '<span class="muted">—</span>'}</td>
        <td><strong>${l.remaining}</strong> u.</td>
        <td>${expirationCell(l.expirationDate)}</td>
        <td>${l.supplierName ? escapeHtml(l.supplierName) : '<span class="muted">—</span>'}</td>
        <td>${l.createdAt ? formatDateOnly(l.createdAt) : '<span class="muted">—</span>'}</td>
      </tr>`).join('');
  const extra = withoutLot > 0 ? `
      <tr>
        <td><span class="muted">Sin lote</span></td>
        <td><span class="muted">—</span></td>
        <td><strong>${withoutLot}</strong> u.</td>
        <td><span class="muted">—</span></td>
        <td colspan="2"><span class="muted">Ingresos sin lote o ajustes generales</span></td>
      </tr>` : '';
  document.getElementById('stock-lots-body').innerHTML = rows + extra;
  openModal('modal-stock-lots');
}

document.getElementById('table-branch-stock-body')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.stock-expand-btn');
  if (btn) openStockLotsModal(btn.dataset.product);
});

function renderStockTable() {
  const tbody = document.getElementById('table-branch-stock-body');
  const items = filteredStockItems();
  if (!items.length) {
    const onlyLow = document.getElementById('stock-view-filter').value === 'low';
    renderEmptyRow(tbody, 8, stockSearch ? 'Sin resultados' : onlyLow ? 'No hay productos con stock bajo' : 'Esta sucursal no tiene stock registrado aún');
    const pag = document.getElementById('stock-view-pagination');
    if (pag) pag.innerHTML = '';
    return;
  }

  const pageData = paginate(items, stockPage, STOCK_PER_PAGE);
  stockPage = pageData.page;

  tbody.innerHTML = pageData.items.map(item => {
    const product = item.Producto;
    const minStock = item.effectiveMinStock || 0;
    const available = item.availableQuantity;
    const stockClass = item.quantity === 0 ? 'stock-critical' : item.quantity <= minStock ? 'stock-low' : 'stock-ok';
    const productId = String(product?.id || item.productId || '');
    const lots = lotsByProduct.get(productId) || [];
    const nameCell = lots.length
      ? `<button type="button" class="stock-expand-btn" data-product="${escapeHtml(productId)}" title="Ver lotes y vencimientos">
           <strong>${escapeHtml(product?.name || 'N/A')}</strong>
           <span class="stock-lot-count">${lots.length} lote${lots.length === 1 ? '' : 's'}</span>
         </button>`
      : `<strong>${escapeHtml(product?.name || 'N/A')}</strong>`;
    return `
      <tr>
        <td>${nameCell}</td>
        <td>${product?.sku ? escapeHtml(product.sku) : '<span class="muted">—</span>'}</td>
        <td><span class="badge">${escapeHtml(product?.Category?.name || '—')}</span></td>
        <td><span class="stock-qty ${stockClass}">${item.quantity}</span></td>
        <td><span class="text-warning strong">${item.reservedQuantity}</span></td>
        <td><span class="stock-qty ${stockClass}">${available}</span></td>
        <td><span class="muted">${minStock}</span></td>
        <td>${expirationCell(item.nextExpiration)}</td>
      </tr>`;
  }).join('');

  renderPagination('stock-view-pagination', pageData, 'productos', (p) => {
    stockPage = p;
    renderStockTable();
  });
}

document.getElementById('stock-view-branch-select')?.addEventListener('change', (e) => {
  if (e.target.value) loadStockForBranch(e.target.value);
});
document.getElementById('stock-view-filter')?.addEventListener('change', () => {
  stockPage = 1;
  renderStockTable();
});
document.getElementById('stock-view-search')?.addEventListener('input', debounce((e) => {
  stockSearch = e.target.value.toLowerCase().trim();
  stockPage = 1;
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
    { header: 'Próximo vencimiento', value: i => (i.nextExpiration ? formatDateOnly(i.nextExpiration) : '') }
  ],
  rows: filteredStockItems()
}));

// --------------------------------------------------------------------------
// Ajuste manual de stock
// --------------------------------------------------------------------------
let pendingAdjustData = null;

function setupAdjustProductSearch() {
  const searchInput = document.getElementById('adjust-product-search');
  const hiddenInput = document.getElementById('adjust-product');
  const dropdown = document.getElementById('adjust-product-dropdown');
  const toggleBtn = document.getElementById('adjust-product-toggle');

  if (!searchInput || !dropdown) return;

  function renderDropdown(filterText = '') {
    const q = filterText.toLowerCase().trim();
    const list = state.products
      .filter(p => !q || [p.name, p.sku, p.Category?.name].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!list.length) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem;">No se encontraron productos</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = list.map(p => `
      <div class="select-search-item ${hiddenInput.value === p.id ? 'highlighted' : ''}" data-id="${p.id}" data-name="${escapeHtml(p.name)}">
        <span class="select-search-item-name">${escapeHtml(p.name)}</span>
        <span class="select-search-item-sub">${p.sku ? `SKU: ${escapeHtml(p.sku)} · ` : ''}${escapeHtml(p.Category?.name || 'Sin categoría')}</span>
      </div>
    `).join('');
    dropdown.classList.remove('hidden');
  }

  searchInput.addEventListener('focus', () => {
    renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    loadAdjustLots();
    renderDropdown(searchInput.value);
  });

  toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropdown.classList.contains('hidden')) {
      searchInput.focus();
      renderDropdown('');
    } else {
      dropdown.classList.add('hidden');
    }
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.select-search-item');
    if (!item) return;
    hiddenInput.value = item.dataset.id;
    searchInput.value = item.dataset.name;
    dropdown.classList.add('hidden');
    loadAdjustLots();
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('adjust-product-container')?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

setupAdjustProductSearch();

// Variantes (lotes) del producto elegido en la sucursal elegida: se ajustan todas en un solo movimiento
let adjustLots = [];
let adjustWithoutLot = 0;
let adjustLotsRequest = 0;

const variantsMode = () => !document.getElementById('adjust-variants-group').classList.contains('hidden');

function setAdjustVariantsMode(on) {
  document.getElementById('adjust-variants-group').classList.toggle('hidden', !on);
  document.getElementById('adjust-quantity-group').classList.toggle('hidden', on);
  document.getElementById('adjust-quantity').required = !on;
}

async function loadAdjustLots() {
  const branchId = document.getElementById('adjust-branch').value;
  const productId = document.getElementById('adjust-product').value;
  const request = ++adjustLotsRequest;
  adjustLots = [];
  adjustWithoutLot = 0;
  document.getElementById('adjust-variants-body').innerHTML = '';
  setAdjustVariantsMode(false);
  if (!branchId || !productId) return;

  let total = 0;
  try {
    const [lots, branchStock] = await Promise.all([
      apiFetch(`/inventory/lots?branchId=${encodeURIComponent(branchId)}&productId=${encodeURIComponent(productId)}&withStock=true`),
      apiFetch(`/branches/${branchId}/stock`)
    ]);
    if (request !== adjustLotsRequest) return; // llegó una respuesta vieja
    adjustLots = lots;
    const item = branchStock.stockItems.find(i => String(i.Producto?.id || i.productId) === String(productId));
    total = item?.quantity || 0;
  } catch {
    return;
  }
  if (!adjustLots.length) return;

  adjustWithoutLot = Math.max(0, total - adjustLots.reduce((sum, l) => sum + (l.remaining || 0), 0));
  const row = (lotId, label, expiration, inStock, brand = '') => `
    <tr>
      <td>${label}</td>
      <td>${brand || '<span class="muted">—</span>'}</td>
      <td>${expiration}</td>
      <td><strong>${inStock}</strong></td>
      <td><input type="number" class="adjust-variant-qty" data-lot="${escapeHtml(lotId)}" data-stock="${inStock}" value="0" step="1" aria-label="Ajuste"></td>
      <td class="adjust-variant-result">${inStock}</td>
    </tr>`;
  document.getElementById('adjust-variants-body').innerHTML = [
    ...adjustLots.map(l => row(l.id, `<span class="badge">${escapeHtml(l.lotNumber || 'Sin número')}</span>`, expirationCell(l.expirationDate), l.remaining, l.brandName ? escapeHtml(l.brandName) : '')),
    row('', '<span class="muted">Sin lote</span>', '<span class="muted">—</span>', adjustWithoutLot)
  ].join('');
  setAdjustVariantsMode(true);
  updateAdjustVariantsTotal();
}

function readAdjustVariants() {
  return [...document.querySelectorAll('.adjust-variant-qty')].map(input => ({
    input,
    lotId: input.dataset.lot || null,
    inStock: Number(input.dataset.stock) || 0,
    quantity: parseInt(input.value, 10) || 0
  }));
}

function updateAdjustVariantsTotal() {
  const variants = readAdjustVariants();
  let net = 0;
  for (const v of variants) {
    const result = v.inStock + v.quantity;
    const cell = v.input.closest('tr').querySelector('.adjust-variant-result');
    cell.textContent = result;
    cell.className = `adjust-variant-result ${v.quantity > 0 ? 'qty-in' : v.quantity < 0 ? 'qty-out' : ''} ${result < 0 && v.lotId ? 'text-danger' : ''}`;
    net += v.quantity;
  }
  const changed = variants.filter(v => v.quantity).length;
  document.getElementById('adjust-variants-total').textContent = changed
    ? `${changed} variante${changed === 1 ? '' : 's'} con cambios. Diferencia total: ${net > 0 ? '+' : ''}${net} u.`
    : 'Sin cambios todavía. En "Sin lote", si restás, se descuenta del lote que vence primero.';
}

document.getElementById('adjust-variants-body')?.addEventListener('input', updateAdjustVariantsTotal);
document.getElementById('adjust-branch')?.addEventListener('change', loadAdjustLots);

document.getElementById('btn-toggle-stock-adjust')?.addEventListener('click', () => {
  if (!hasRole('Administrador', 'Usuario Responsable')) return showToast('Tu rol no puede ajustar stock.', 'error');
  const branches = operableBranches();
  const current = document.getElementById('stock-view-branch-select').value;
  fillSelect(document.getElementById('adjust-branch'), branches, { getLabel: branchLabel, value: current });
  document.getElementById('form-stock-adjust').reset();
  document.getElementById('adjust-product').value = '';
  document.getElementById('adjust-product-search').value = '';
  document.getElementById('adjust-product-dropdown')?.classList.add('hidden');
  document.getElementById('adjust-branch').value = current;
  document.getElementById('adjust-reason-other-group').classList.add('hidden');
  loadAdjustLots();
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
  const reasonSelect = document.getElementById('adjust-reason-select').value;
  const reason = reasonSelect === 'Otro' ? document.getElementById('adjust-reason-other').value.trim() : reasonSelect;
  const withVariants = variantsMode();

  // Con variantes: una línea por lote cambiado. Sin variantes: una sola cantidad.
  const lines = withVariants
    ? readAdjustVariants().filter(v => v.quantity)
    : [{ lotId: null, quantity: parseInt(adjustQty.value, 10) || 0, inStock: null }].filter(v => v.quantity);

  if (!branchId || !productId || !reason) {
    return showToast('Completá todos los campos.', 'error');
  }
  if (!lines.length) {
    return showToast(withVariants ? 'Cargá el ajuste en al menos una variante.' : 'La cantidad no puede ser 0.', 'error');
  }
  const tooMuch = lines.find(v => v.lotId && v.inStock + v.quantity < 0);
  if (tooMuch) {
    const lot = adjustLots.find(l => l.id === tooMuch.lotId);
    return showToast(`El lote ${lot?.lotNumber || ''} tiene ${tooMuch.inStock} u.; no se pueden descontar ${-tooMuch.quantity}.`, 'error');
  }

  const fmt = (q) => q > 0 ? `<span class="qty-in strong">+${q}</span>` : `<span class="qty-out strong">${q}</span>`;
  const lineLabel = (v) => {
    const lot = adjustLots.find(l => l.id === v.lotId);
    return lot ? `Lote ${escapeHtml(lot.lotNumber)}` : withVariants ? 'Sin lote' : 'Ajuste';
  };
  const net = lines.reduce((sum, v) => sum + v.quantity, 0);
  const ok = await confirmDialog({
    title: 'Confirmar ajuste de stock',
    html: `
      <div class="confirm-summary">
        <div><strong>Sucursal:</strong> ${escapeHtml(getBranchName(branchId))}</div>
        <div><strong>Producto:</strong> ${escapeHtml(getProductName(productId))}</div>
        ${lines.map(v => `<div><strong>${lineLabel(v)}:</strong> ${fmt(v.quantity)} u.</div>`).join('')}
        ${lines.length > 1 ? `<div><strong>Diferencia total:</strong> ${fmt(net)} u.</div>` : ''}
        <div><strong>Motivo:</strong> ${escapeHtml(reason)}</div>
      </div>`,
    confirmText: 'Aplicar ajuste'
  });
  if (!ok) return;

  try {
    await apiFetch(`/branches/${branchId}/stock/adjust`, {
      method: 'POST',
      body: JSON.stringify({ productId, reason, adjustments: lines.map(v => ({ lotId: v.lotId, quantity: v.quantity })) })
    });
    showToast(lines.length > 1 ? `Ajuste aplicado en ${lines.length} variantes` : 'Ajuste de stock aplicado correctamente', 'success');
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

// Menú "Movimientos": la misma sucursal por defecto que en "Stock por sucursal"
async function loadMovementsPanel() {
  await ensureBaseData();
  const branches = operableBranches();
  const sel = document.getElementById('movements-branch-select');
  const preferred = sel.value || document.getElementById('stock-view-branch-select').value || userBranchId() || branches[0]?.id;
  fillSelect(sel, branches, { placeholder: branches.length > 1 ? '— Seleccionar sucursal —' : null, getLabel: branchLabel, value: preferred });
  sel.disabled = branches.length <= 1;
  if (!sel.value && branches.length) sel.value = branches[0].id;

  const productSel = document.getElementById('movements-filter-product');
  fillSelect(productSel, state.products, { placeholder: 'Todos los productos', value: movementFilters.productId });

  updateMovementsTitle();
  movementFilters.page = 1;
  if (sel.value) loadMovementsTraceability();
  else renderEmptyRow(document.getElementById('table-movements-body'), 7, 'No tenés una sucursal asignada', 'Pedile al administrador que te asigne una.');
}

function updateMovementsTitle() {
  const branchId = document.getElementById('movements-branch-select').value;
  document.getElementById('movements-branch-title').textContent = branchId ? `Movimientos — ${getBranchName(branchId)}` : 'Movimientos de Stock';
}

document.getElementById('movements-branch-select')?.addEventListener('change', () => {
  updateMovementsTitle();
  movementFilters.page = 1;
  loadMovementsTraceability();
});

function movementsQuery(extra = {}) {
  const params = new URLSearchParams({ page: movementFilters.page, limit: 15, ...extra });
  const branchId = document.getElementById('movements-branch-select').value;
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
  title: `Movimientos ${getBranchName(document.getElementById('movements-branch-select').value) || ''}`.trim(),
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
