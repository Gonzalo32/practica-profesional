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

let currentStockItems = [];
let currentStockBranch = null;
let stockSearch = '';

async function loadBranchStockPanel() {
  await ensureBaseData();
  const canManageStock = hasRole('Administrador', 'Usuario Responsable');
  document.getElementById('btn-toggle-stock-adjust')?.classList.toggle('hidden', !canManageStock);
  document.getElementById('btn-open-stock-entry-modal')?.classList.toggle('hidden', !canManageStock);

  const branches = operableBranches();
  const sel = document.getElementById('stock-view-branch-select');
  const label = document.querySelector('label[for="stock-view-branch-select"]');
  const showBranchPicker = hasRole('Administrador') && !isSingleBranch() && branches.length > 1;
  sel?.classList.toggle('hidden', !showBranchPicker);
  label?.classList.toggle('hidden', !showBranchPicker);

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
  const now = new Date();
  const days = Math.round((new Date(date) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const cls = days < 0 ? 'text-danger' : days <= 30 ? 'text-warning' : '';
  return `<span class="${cls}">${formatDateOnly(date)}</span>`;
}

let stockPage = 1;
const STOCK_PER_PAGE = 10;

let lotsByProduct = new Map();

function openStockLotsModal(productId) {
  const item = currentStockItems.find(i => String(i.Producto?.id || i.productId) === String(productId));
  if (!item) return;
  const lots = lotsByProduct.get(String(productId)) || [];
  const inLots = lots.reduce((sum, l) => sum + (l.remaining || 0), 0);
  const withoutLot = Math.max(0, item.quantity - inLots);
  const totalVariants = lots.length + (withoutLot > 0 || !lots.length ? 1 : 0);

  document.getElementById('stock-lots-title').textContent = item.Producto?.name || 'Producto';
  document.getElementById('stock-lots-summary').textContent =
    `${currentStockBranch?.name || ''}: ${item.quantity} u. en total, ${totalVariants} variante${totalVariants === 1 ? '' : 's'} (${lots.length} lote${lots.length === 1 ? '' : 's'}${withoutLot > 0 ? ` y ${withoutLot} u. sin lote` : ''}). Ordenados por vencimiento.`;

  const rows = lots.map(l => `
      <tr>
        <td><span class="badge">${escapeHtml(l.lotNumber || 'Sin número')}</span></td>
        <td>${l.brandName ? escapeHtml(l.brandName) : '<span class="muted">—</span>'}</td>
        <td><strong>${l.remaining}</strong> u.</td>
        <td>${expirationCell(l.expirationDate)}</td>
        <td>${l.supplierName ? escapeHtml(l.supplierName) : '<span class="muted">—</span>'}</td>
        <td>${l.createdAt ? formatDateOnly(l.createdAt) : '<span class="muted">—</span>'}</td>
      </tr>`).join('');
  const extra = (withoutLot > 0 || !lots.length) ? `
      <tr>
        <td><span class="badge">Sin lote</span></td>
        <td><span class="muted">—</span></td>
        <td><strong>${withoutLot}</strong> u.</td>
        <td><span class="muted">Sin vencimiento</span></td>
        <td colspan="2"><span class="muted">Stock general sin lote específico</span></td>
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
    const inLots = lots.reduce((sum, l) => sum + (l.remaining || 0), 0);
    const withoutLot = Math.max(0, (item.quantity || 0) - inLots);
    const variantsCount = lots.length + (withoutLot > 0 || !lots.length ? 1 : 0);
    const nameCell = `
      <button type="button" class="stock-expand-btn" data-product="${escapeHtml(productId)}" title="Ver variantes y lotes">
        <strong>${escapeHtml(product?.name || 'N/A')}</strong>
        <span class="stock-lot-count">${variantsCount} variante${variantsCount === 1 ? '' : 's'}</span>
      </button>`;
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

let adjustBranchStockItems = [];
let adjustBranchLotsByProduct = new Map();
let adjustLots = [];
let adjustWithoutLot = 0;
let adjustBranchRequest = 0;
let renderAdjustProductDropdown = () => {};

async function loadAdjustBranchProducts(branchId, { focusSearch = false } = {}) {
  const searchInput = document.getElementById('adjust-product-search');
  const hiddenInput = document.getElementById('adjust-product');
  const dropdown = document.getElementById('adjust-product-dropdown');
  const variantsGroup = document.getElementById('adjust-variants-group');
  const variantsBody = document.getElementById('adjust-variants-body');
  const request = ++adjustBranchRequest;

  if (hiddenInput) hiddenInput.value = '';
  if (searchInput) searchInput.value = '';
  if (dropdown) dropdown.classList.add('hidden');
  if (variantsGroup) variantsGroup.classList.add('hidden');
  if (variantsBody) variantsBody.innerHTML = '';
  adjustLots = [];
  adjustWithoutLot = 0;

  if (!branchId) {
    adjustBranchStockItems = [];
    adjustBranchLotsByProduct = new Map();
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Elegí primero la sucursal...';
    }
    return;
  }

  if (currentStockBranch && String(currentStockBranch.id) === String(branchId) && currentStockItems.length) {
    adjustBranchStockItems = currentStockItems.filter(i => (i.availableQuantity ?? i.quantity ?? 0) > 0);
    adjustBranchLotsByProduct = new Map(lotsByProduct);
    updateAdjustSearchInputState(focusSearch);
  } else if (searchInput) {
    searchInput.disabled = true;
    searchInput.placeholder = 'Cargando artículos de la sucursal...';
  }

  try {
    const [{ stockItems }, lots] = await Promise.all([
      apiFetch(`/branches/${branchId}/stock`),
      apiFetch(`/inventory/lots?branchId=${encodeURIComponent(branchId)}&withStock=true`).catch(() => [])
    ]);
    if (request !== adjustBranchRequest) return;
    adjustBranchStockItems = (stockItems || []).filter(i => (i.availableQuantity ?? i.quantity ?? 0) > 0);
    adjustBranchLotsByProduct = new Map();
    for (const lot of lots) {
      const pid = String(lot.productId);
      if (!adjustBranchLotsByProduct.has(pid)) adjustBranchLotsByProduct.set(pid, []);
      adjustBranchLotsByProduct.get(pid).push(lot);
    }
    updateAdjustSearchInputState(focusSearch);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function updateAdjustSearchInputState(focusSearch = false) {
  const searchInput = document.getElementById('adjust-product-search');
  if (!searchInput) return;
  if (!adjustBranchStockItems.length) {
    searchInput.disabled = true;
    searchInput.placeholder = 'Esta sucursal no tiene artículos con stock disponible';
    return;
  }
  searchInput.disabled = false;
  searchInput.placeholder = 'Escribí para buscar o seleccioná un artículo...';
  if (focusSearch) {
    searchInput.focus();
    renderAdjustProductDropdown('');
  }
}

function setupAdjustProductSearch() {
  const searchInput = document.getElementById('adjust-product-search');
  const hiddenInput = document.getElementById('adjust-product');
  const dropdown = document.getElementById('adjust-product-dropdown');
  const toggleBtn = document.getElementById('adjust-product-toggle');

  if (!searchInput || !dropdown) return;

  function renderDropdown(filterText = '') {
    const branchId = document.getElementById('adjust-branch')?.value;
    if (!branchId) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem;">Elegí primero la sucursal</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    const q = filterText.toLowerCase().trim();
    const list = adjustBranchStockItems
      .filter(item => {
        const p = item.Producto || {};
        if (!q) return true;
        return [p.name, p.sku, p.Category?.name].filter(Boolean).join(' ').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.Producto?.name || '').localeCompare(b.Producto?.name || ''));

    if (!list.length) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem;">No se encontraron artículos con stock en esta sucursal</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = list.map((item, idx) => {
      const p = item.Producto || {};
      const pid = String(p.id || item.productId);
      const avail = item.availableQuantity ?? item.quantity ?? 0;
      const lotsCount = (adjustBranchLotsByProduct.get(pid) || []).length;
      const isSelected = hiddenInput.value ? (hiddenInput.value === pid) : (idx === 0);
      return `
        <div class="select-search-item ${isSelected ? 'highlighted' : ''}" data-id="${escapeHtml(pid)}" data-name="${escapeHtml(p.name || 'Artículo')}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span class="select-search-item-name">${escapeHtml(p.name || 'Artículo')}</span>
            <span class="badge badge-success" style="font-size:0.75rem; padding:2px 8px; white-space:nowrap;">${avail} disp.${lotsCount ? ` · ${lotsCount} lote${lotsCount === 1 ? '' : 's'}` : ''}</span>
          </div>
          <span class="select-search-item-sub">${p.sku ? `SKU: ${escapeHtml(p.sku)} · ` : ''}${escapeHtml(p.Category?.name || 'Sin categoría')}</span>
        </div>
      `;
    }).join('');
    dropdown.classList.remove('hidden');
  }

  renderAdjustProductDropdown = renderDropdown;

  const selectItem = (item) => {
    if (!item) return;
    hiddenInput.value = item.dataset.id;
    searchInput.value = item.dataset.name;
    dropdown.classList.add('hidden');
    loadAdjustLots();
  };

  searchInput.addEventListener('focus', () => {
    if (!searchInput.disabled) renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('click', () => {
    if (!searchInput.disabled && dropdown.classList.contains('hidden')) renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    document.getElementById('adjust-variants-group')?.classList.add('hidden');
    renderDropdown(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    const items = Array.from(dropdown.querySelectorAll('.select-search-item'));
    const isClosed = dropdown.classList.contains('hidden') || !items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (isClosed) {
        renderDropdown(searchInput.value);
        return;
      }
      const currentIndex = items.findIndex(i => i.classList.contains('highlighted'));
      items.forEach(i => i.classList.remove('highlighted'));
      const nextIndex = currentIndex >= 0 && currentIndex < items.length - 1 ? currentIndex + 1 : 0;
      items[nextIndex].classList.add('highlighted');
      items[nextIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isClosed) {
        renderDropdown(searchInput.value);
        return;
      }
      const currentIndex = items.findIndex(i => i.classList.contains('highlighted'));
      items.forEach(i => i.classList.remove('highlighted'));
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
      items[prevIndex].classList.add('highlighted');
      items[prevIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!isClosed) {
        const target = items.find(i => i.classList.contains('highlighted')) || items[0];
        if (target) selectItem(target);
      }
    } else if (e.key === 'Escape') {
      if (!dropdown.classList.contains('hidden')) {
        e.stopPropagation();
        dropdown.classList.add('hidden');
      }
    }
  });

  toggleBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (searchInput.disabled) return;
    if (dropdown.classList.contains('hidden')) {
      searchInput.focus();
      renderDropdown('');
    } else {
      dropdown.classList.add('hidden');
    }
  });

  dropdown.addEventListener('mousedown', (e) => {
    const item = e.target.closest('.select-search-item');
    if (item) {
      e.preventDefault();
      selectItem(item);
    }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('adjust-product-container')?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

setupAdjustProductSearch();

function loadAdjustLots() {
  const branchId = document.getElementById('adjust-branch').value;
  const productId = document.getElementById('adjust-product').value;
  const variantsGroup = document.getElementById('adjust-variants-group');
  const variantsBody = document.getElementById('adjust-variants-body');

  adjustLots = [];
  adjustWithoutLot = 0;
  variantsBody.innerHTML = '';
  if (!branchId || !productId) {
    variantsGroup.classList.add('hidden');
    return;
  }

  const stockItem = adjustBranchStockItems.find(i => String(i.Producto?.id || i.productId) === String(productId));
  const totalAvailable = stockItem ? (stockItem.availableQuantity ?? stockItem.quantity ?? 0) : 0;
  adjustLots = (adjustBranchLotsByProduct.get(String(productId)) || []).filter(l => (l.remaining || 0) > 0);
  const inLots = adjustLots.reduce((sum, l) => sum + (l.remaining || 0), 0);
  adjustWithoutLot = Math.max(0, (stockItem?.quantity || 0) - inLots);

  const row = (lotId, label, expiration, inStock, brand = '') => `
    <tr>
      <td>${label}</td>
      <td>${brand || '<span class="muted">—</span>'}</td>
      <td>${expiration}</td>
      <td><strong>${inStock}</strong> u.</td>
      <td>
        <div style="display:inline-flex; align-items:center; gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm adjust-step-btn" data-delta="-1" style="padding:2px 8px; line-height:1;">-</button>
          <input type="number" class="adjust-variant-qty" data-lot="${escapeHtml(lotId)}" data-stock="${inStock}" value="0" min="0" max="${inStock}" step="1" aria-label="Cantidad a descontar">
          <button type="button" class="btn btn-secondary btn-sm adjust-step-btn" data-delta="1" style="padding:2px 8px; line-height:1;">+</button>
        </div>
      </td>
      <td class="adjust-variant-result">${inStock}</td>
    </tr>`;

  const rowsHtml = [
    ...adjustLots.map(l => row(l.id, `<span class="badge">${escapeHtml(l.lotNumber || 'Sin número')}</span>`, expirationCell(l.expirationDate), l.remaining, l.brandName ? escapeHtml(l.brandName) : '')),
    ...(adjustWithoutLot > 0 || !adjustLots.length ? [row('', '<span class="muted">Sin lote (Stock general)</span>', '<span class="muted">—</span>', adjustWithoutLot || totalAvailable)] : [])
  ];

  variantsBody.innerHTML = rowsHtml.join('');
  variantsGroup.classList.remove('hidden');
  updateAdjustVariantsTotal();

  const firstInput = variantsBody.querySelector('.adjust-variant-qty');
  if (firstInput) {
    firstInput.focus();
    firstInput.select();
  }
}

function readAdjustVariants() {
  return [...document.querySelectorAll('.adjust-variant-qty')].map(input => {
    const inStock = Number(input.dataset.stock) || 0;
    const rawDeduct = Math.max(0, parseInt(input.value, 10) || 0);
    return {
      input,
      lotId: input.dataset.lot || null,
      inStock,
      deduct: rawDeduct,
      quantity: -rawDeduct
    };
  });
}

function updateAdjustVariantsTotal() {
  const variants = readAdjustVariants();
  let totalDeduct = 0;
  for (const v of variants) {
    const result = v.inStock - v.deduct;
    const cell = v.input.closest('tr').querySelector('.adjust-variant-result');
    cell.textContent = `${result} u.`;
    cell.className = `adjust-variant-result ${v.deduct > 0 ? 'qty-out' : ''} ${result < 0 ? 'text-danger' : ''}`;
    totalDeduct += v.deduct;
  }
  const changed = variants.filter(v => v.deduct > 0).length;
  document.getElementById('adjust-variants-total').textContent = changed
    ? `Se descontarán ${totalDeduct} u. en ${changed} variante${changed === 1 ? '' : 's'}.`
    : 'Indicá cuántas unidades descontar en la(s) variante(s) que quieras dar de baja.';
}

document.getElementById('adjust-variants-body')?.addEventListener('input', updateAdjustVariantsTotal);
document.getElementById('adjust-variants-body')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.adjust-step-btn');
  if (!btn) return;
  const input = btn.closest('tr')?.querySelector('.adjust-variant-qty');
  if (!input) return;
  const max = Number(input.dataset.stock) || 0;
  const delta = Number(btn.dataset.delta) || 0;
  const current = parseInt(input.value, 10) || 0;
  input.value = String(Math.min(max, Math.max(0, current + delta)));
  updateAdjustVariantsTotal();
});

document.getElementById('adjust-branch')?.addEventListener('change', (e) => {
  loadAdjustBranchProducts(e.target.value, { focusSearch: true });
});

document.getElementById('btn-toggle-stock-adjust')?.addEventListener('click', () => {
  if (!hasRole('Administrador', 'Usuario Responsable')) return showToast('Tu rol no puede dar de baja stock.', 'error');
  const branches = operableBranches();
  const current = document.getElementById('stock-view-branch-select').value || userBranchId() || branches[0]?.id || '';
  fillSelect(document.getElementById('adjust-branch'), branches, { placeholder: 'Seleccionar sucursal...', getLabel: branchLabel, value: current });
  document.getElementById('form-stock-adjust').reset();
  document.getElementById('adjust-branch').value = current;
  document.getElementById('adjust-reason-other-group').classList.add('hidden');
  openModal('modal-stock-adjust');
  loadAdjustBranchProducts(current, { focusSearch: false });
});

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

  const lines = readAdjustVariants().filter(v => v.deduct > 0);

  if (!branchId || !productId || !reason) {
    return showToast('Seleccioná la sucursal, el artículo y el motivo de la baja.', 'error');
  }
  if (!lines.length) {
    return showToast('Indicá la cantidad a descontar (mayor a 0) en al menos una variante.', 'error');
  }
  const tooMuch = lines.find(v => v.deduct > v.inStock);
  if (tooMuch) {
    const lot = adjustLots.find(l => l.id === tooMuch.lotId);
    return showToast(`La variante ${lot?.lotNumber ? `Lote ${lot.lotNumber}` : 'Sin lote'} tiene ${tooMuch.inStock} u. disponibles; no se pueden descontar ${tooMuch.deduct}.`, 'error');
  }

  const fmt = (q) => `<span class="qty-out strong">${q}</span>`;
  const lineLabel = (v) => {
    const lot = adjustLots.find(l => l.id === v.lotId);
    return lot ? `Lote ${escapeHtml(lot.lotNumber)}` : 'Sin lote';
  };
  const net = lines.reduce((sum, v) => sum + v.quantity, 0);
  const ok = await confirmDialog({
    title: 'Confirmar baja de stock',
    danger: true,
    html: `
      <div class="confirm-summary">
        <div><strong>Sucursal:</strong> ${escapeHtml(getBranchName(branchId))}</div>
        <div><strong>Artículo:</strong> ${escapeHtml(getProductName(productId))}</div>
        ${lines.map(v => `<div><strong>${lineLabel(v)}:</strong> ${fmt(v.quantity)} u.</div>`).join('')}
        ${lines.length > 1 ? `<div><strong>Total a descontar:</strong> ${fmt(net)} u.</div>` : ''}
        <div><strong>Motivo:</strong> ${escapeHtml(reason)}</div>
      </div>`,
    confirmText: 'Confirmar baja'
  });
  if (!ok) return;

  try {
    await apiFetch(`/branches/${branchId}/stock/adjust`, {
      method: 'POST',
      body: JSON.stringify({ productId, reason, adjustments: lines.map(v => ({ lotId: v.lotId, quantity: v.quantity })) })
    });
    showToast(lines.length > 1 ? `Baja aplicada en ${lines.length} variantes` : 'Baja de stock aplicada correctamente', 'success');
    closeModal('modal-stock-adjust');
    document.getElementById('stock-view-branch-select').value = branchId;
    loadStockForBranch(branchId);
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

const movementFilters = { page: 1, type: '', productId: '', from: '', to: '' };

async function loadMovementsPanel() {
  await ensureBaseData();
  const branches = operableBranches();
  const sel = document.getElementById('movements-branch-select');
  const filterCard = sel?.closest('.filter-card');
  const showBranchPicker = hasRole('Administrador') && !isSingleBranch() && branches.length > 1;
  filterCard?.classList.toggle('hidden', !showBranchPicker);

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

makeSelectSearchable(document.getElementById('movements-filter-product'), { inline: true });
