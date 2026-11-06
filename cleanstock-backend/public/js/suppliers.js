// ==========================================================================
// PROVEEDORES Y ÓRDENES DE COMPRA
// ==========================================================================

let supplierSearch = '';
let loadedPurchaseOrders = [];
let suppliersPage = 1;
const SUPPLIERS_PER_PAGE = 10;

async function loadSuppliersPanel() {
  await ensureBaseData();
  const isSupplierUser = hasRole('Proveedor');
  const canManage = hasRole('Administrador', 'Usuario Responsable');

  document.getElementById('suppliers-panel-title').textContent = isSupplierUser ? 'Mis Órdenes de Compra' : 'Proveedores';
  document.getElementById('btn-open-supplier-modal')?.classList.toggle('hidden', !canManage);
  document.getElementById('suppliers-sub-nav')?.classList.add('hidden');

  await renderSuppliersTable();
}

// Menú "Provisiones": lo que entra de afuera de la empresa (órdenes de compra a proveedores e ingresos directos).
// El proveedor entra al mismo panel y ve solo sus órdenes, sin poder crear ni recibir.
async function loadProvisionsPanel() {
  await ensureBaseData();
  const isSupplierUser = hasRole('Proveedor');
  const canManage = hasRole('Administrador', 'Usuario Responsable');
  document.getElementById('provisions-panel-title').textContent = isSupplierUser ? 'Mis Órdenes de Compra' : 'Provisiones';
  document.getElementById('provisions-hint').classList.toggle('hidden', !canManage);
  document.getElementById('btn-open-po-modal')?.classList.toggle('hidden', !canManage);
  document.getElementById('btn-provisions-entry')?.classList.toggle('hidden', !canManage);
  await loadPurchaseOrders();
}

document.getElementById('btn-provisions-entry')?.addEventListener('click', () => openCreateStockEntryModal());

async function renderSuppliersTable() {
  const tbody = document.getElementById('table-suppliers-body');
  if (!state.suppliers.length) setTableLoading(tbody, 6, 3);
  try {
    await loadSuppliers();
    const list = state.suppliers.filter(s => !supplierSearch ||
      [s.name, s.cuit, s.contactName, s.email].join(' ').toLowerCase().includes(supplierSearch));
    if (!list.length) {
      renderEmptyRow(tbody, 6, supplierSearch ? 'Sin resultados' : 'Todavía no hay proveedores', 'Registrá a quién le comprás para asociarlo a los ingresos y armar órdenes de compra.');
      const pag = document.getElementById('suppliers-pagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    const pageData = paginate(list, suppliersPage, SUPPLIERS_PER_PAGE);
    suppliersPage = pageData.page;

    const isAdmin = hasRole('Administrador');
    tbody.innerHTML = pageData.items.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong>${s.notes ? `<div class="cell-detail">${escapeHtml(s.notes)}</div>` : ''}</td>
        <td>${s.cuit ? escapeHtml(s.cuit) : '<span class="muted">—</span>'}</td>
        <td>${s.contactName ? escapeHtml(s.contactName) : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(s.phone || '')}${s.phone && s.email ? '<br>' : ''}<span class="muted">${escapeHtml(s.email || '')}</span>${!s.phone && !s.email ? '<span class="muted">—</span>' : ''}</td>
        <td><span class="cell-detail">${s.Products?.length ? s.Products.map(p => escapeHtml(p.name)).join(', ') : '—'}</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn-icon" title="Ver Detalle" onclick="openViewSupplierModal('${s.id}')">${ICON_VIEW}</button>
            <button class="btn-icon" title="Editar" onclick="openSupplierModal('${s.id}')">${ICON_EDIT}</button>
            ${isAdmin ? `<button class="btn-icon btn-icon-danger" title="Dar de baja" onclick="deactivateSupplier('${s.id}')">${ICON_DELETE}</button>` : ''}
          </div>
        </td>
      </tr>`).join('');

    renderPagination('suppliers-pagination', pageData, 'proveedores', (p) => {
      suppliersPage = p;
      renderSuppliersTable();
    });
  } catch (err) {
    renderErrorRow(tbody, 6, err.message);
  }
}

window.openViewSupplierModal = (supplierId) => {
  const s = state.suppliers.find(x => String(x.id) === String(supplierId));
  if (!s) return;
  const prods = (s.Products || []).map(p => escapeHtml(p.name)).join(', ') || 'Ninguno asignado';
  document.getElementById('view-supplier-details-content').innerHTML = `
    <div class="span-2"><strong>Razón Social:</strong> ${escapeHtml(s.name)}</div>
    <div><strong>CUIT:</strong> ${escapeHtml(s.cuit || 'Sin registrar')}</div>
    <div><strong>Persona de Contacto:</strong> ${escapeHtml(s.contactName || 'Sin registrar')}</div>
    <div><strong>Teléfono:</strong> ${escapeHtml(s.phone || 'Sin registrar')}</div>
    <div><strong>Email:</strong> ${escapeHtml(s.email || 'Sin registrar')}</div>
    <div class="span-2"><strong>Dirección:</strong> ${escapeHtml(s.address || 'Sin registrar')}</div>
    <div class="span-2"><strong>Productos que provee:</strong> ${prods}</div>
    <div class="span-2"><strong>Notas:</strong> ${escapeHtml(s.notes || 'Sin notas')}</div>
  `;
  openModal('modal-view-supplier');
};

document.getElementById('supplier-search')?.addEventListener('input', debounce((e) => {
  supplierSearch = e.target.value.toLowerCase().trim();
  suppliersPage = 1;
  renderSuppliersTable();
}, 250));

// --------------------------------------------------------------------------
// Alta / edición de proveedor
// --------------------------------------------------------------------------
function renderSupplierProductChecks(selectedIds = []) {
  const filter = document.getElementById('supplier-products-filter').value.toLowerCase().trim();
  const container = document.getElementById('supplier-products-list');
  const checked = new Set(selectedIds.map(String));
  container.innerHTML = state.products.map(p => `
    <label class="checkbox-item ${filter && !p.name.toLowerCase().includes(filter) ? 'hidden' : ''}">
      <input type="checkbox" value="${p.id}" ${checked.has(p.id) ? 'checked' : ''}>
      <span>${escapeHtml(p.name)}</span>
    </label>`).join('') || '<p class="empty-text">No hay productos en el catálogo.</p>';
}

function selectedSupplierProducts() {
  return [...document.querySelectorAll('#supplier-products-list input:checked')].map(i => i.value);
}

document.getElementById('supplier-products-filter')?.addEventListener('input', () => {
  renderSupplierProductChecks(selectedSupplierProducts());
});

window.openSupplierModal = (supplierId = null) => {
  const s = supplierId ? state.suppliers.find(x => x.id === supplierId) : null;
  document.getElementById('form-supplier').reset();
  document.getElementById('supplier-id').value = s?.id || '';
  document.getElementById('supplier-name').value = s?.name || '';
  document.getElementById('supplier-cuit').value = s?.cuit || '';
  document.getElementById('supplier-contact').value = s?.contactName || '';
  document.getElementById('supplier-phone').value = s?.phone || '';
  document.getElementById('supplier-email').value = s?.email || '';
  document.getElementById('supplier-address').value = s?.address || '';
  document.getElementById('supplier-notes').value = s?.notes || '';
  document.getElementById('supplier-products-filter').value = '';
  renderSupplierProductChecks(s?.productIds || []);
  document.getElementById('modal-supplier-title').textContent = s ? `Editar ${s.name}` : 'Nuevo Proveedor';
  openModal('modal-supplier');
};
document.getElementById('btn-open-supplier-modal')?.addEventListener('click', () => openSupplierModal());

document.getElementById('form-supplier')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('supplier-id').value;
  const val = (field) => document.getElementById(`supplier-${field}`).value.trim();
  const data = {
    name: val('name'),
    cuit: val('cuit'),
    contactName: val('contact'),
    phone: val('phone'),
    email: val('email'),
    address: val('address'),
    notes: val('notes'),
    productIds: selectedSupplierProducts()
  };
  try {
    await apiFetch(id ? `/suppliers/${id}` : '/suppliers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    showToast(id ? 'Proveedor actualizado' : 'Proveedor registrado', 'success');
    closeModal('modal-supplier');
    renderSuppliersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.deactivateSupplier = async (supplierId) => {
  const s = state.suppliers.find(x => x.id === supplierId);
  const ok = await confirmDialog({
    title: 'Dar de baja proveedor',
    message: `"${s?.name}" dejará de aparecer en los listados. Su historial de compras se conserva.`,
    confirmText: 'Dar de baja',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/suppliers/${supplierId}`, { method: 'DELETE' });
    showToast('Proveedor dado de baja', 'success');
    renderSuppliersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Órdenes de compra
// --------------------------------------------------------------------------
async function loadPurchaseOrders() {
  const tbody = document.getElementById('table-po-body');
  setTableLoading(tbody, 7, 3);
  try {
    const status = document.getElementById('po-filter-status').value;
    loadedPurchaseOrders = await apiFetch(`/suppliers/purchase-orders${status ? `?status=${status}` : ''}`);
    if (!loadedPurchaseOrders.length) {
      renderEmptyRow(tbody, 7, 'No hay órdenes de compra', hasRole('Proveedor') ? 'Cuando te hagan un pedido lo vas a ver acá.' : 'Generá una orden para pedirle mercadería a un proveedor.');
      return;
    }
    const canManage = hasRole('Administrador', 'Usuario Responsable');
    const statusCls = { PENDIENTE: 'status-pendiente', RECIBIDA: 'status-entregado', CANCELADA: 'status-rechazado' };
    tbody.innerHTML = loadedPurchaseOrders.map(po => `
      <tr>
        <td><span class="order-item-id">${escapeHtml(po.code)}</span></td>
        <td><strong>${escapeHtml(po.supplierName)}</strong></td>
        <td>${escapeHtml(po.branchName)}</td>
        <td><span class="cell-detail">${po.items.map(i => `${escapeHtml(i.productName)} x${i.quantity}`).join(', ')}</span></td>
        <td><span class="status-badge ${statusCls[po.status]}">${escapeHtml(capitalize(po.status.toLowerCase()))}</span></td>
        <td class="cell-date">${formatDateTime(po.createdAt)}${po.receivedAt ? `<br><small class="muted">Recibida ${formatDateTime(po.receivedAt)}</small>` : ''}</td>
        <td>${canManage && po.status === 'PENDIENTE' ? `
          <div class="btn-row">
            <button class="btn btn-success btn-sm" onclick="openReceivePoModal('${po.id}')">Recibir</button>
            <button class="btn btn-danger-soft btn-sm" onclick="cancelPurchaseOrder('${po.id}')">Cancelar</button>
          </div>` : ''}</td>
      </tr>`).join('');
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}
document.getElementById('po-filter-status')?.addEventListener('change', loadPurchaseOrders);

let draftPoItems = [];

function renderPoItems() {
  const tbody = document.getElementById('table-po-items-body');
  const count = draftPoItems.length;
  document.getElementById('po-items-count').textContent = `${count} producto${count === 1 ? '' : 's'}`;
  if (!draftPoItems.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-text">Aún no agregaste productos.</td></tr>';
    return;
  }
  tbody.innerHTML = draftPoItems.map((i, index) => `
    <tr>
      <td><strong>${escapeHtml(i.productName)}</strong></td>
      <td class="col-center"><span class="badge">${i.quantity}</span></td>
      <td class="col-center"><button type="button" class="btn-icon btn-icon-danger" title="Quitar" onclick="removePoItem(${index})">${ICON_DELETE}</button></td>
    </tr>`).join('');
}

window.removePoItem = (index) => {
  draftPoItems.splice(index, 1);
  renderPoItems();
};

// Productos del proveedor primero, después el resto del catálogo
function fillPoProducts() {
  const supplier = state.suppliers.find(s => s.id === document.getElementById('po-supplier').value);
  const own = new Set(supplier?.productIds || []);
  const sorted = [...state.products].sort((a, b) => (own.has(b.id) - own.has(a.id)) || a.name.localeCompare(b.name));
  fillSelect(document.getElementById('po-product-select'), sorted, {
    placeholder: 'Seleccioná un producto...',
    getLabel: p => (own.has(p.id) ? `${p.name} (lo provee)` : p.name)
  });
}

document.getElementById('btn-open-po-modal')?.addEventListener('click', async () => {
  await loadSuppliers();
  if (!state.suppliers.length) return showToast('Primero registrá al menos un proveedor.', 'error');
  document.getElementById('form-po').reset();
  fillSelect(document.getElementById('po-supplier'), state.suppliers, { placeholder: 'Seleccionar proveedor...', placeholderDisabled: true });
  fillSelect(document.getElementById('po-branch'), entryBranches(), { placeholder: 'Seleccionar sucursal...', placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() });
  fillPoProducts();
  draftPoItems = [];
  renderPoItems();
  openModal('modal-po');
});

document.getElementById('po-supplier')?.addEventListener('change', fillPoProducts);

document.getElementById('btn-po-add-item')?.addEventListener('click', () => {
  const productId = document.getElementById('po-product-select').value;
  const quantity = parseInt(document.getElementById('po-product-qty').value, 10) || 0;
  if (!productId) return showToast('Seleccioná un producto.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');

  const existing = draftPoItems.find(i => i.productId === productId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    draftPoItems.push({ productId, productName: getProductName(productId), quantity });
  }
  document.getElementById('po-product-select').value = '';
  document.getElementById('po-product-qty').value = 1;
  renderPoItems();
});

document.getElementById('form-po')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!draftPoItems.length) return showToast('Agregá al menos un producto a la orden.', 'error');
  try {
    const po = await apiFetch('/suppliers/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        supplierId: document.getElementById('po-supplier').value,
        branchId: document.getElementById('po-branch').value,
        notes: document.getElementById('po-notes').value.trim(),
        items: draftPoItems.map(({ productId, quantity }) => ({ productId, quantity }))
      })
    });
    showToast(`Orden ${po.code} generada`, 'success');
    closeModal('modal-po');
    document.getElementById('po-filter-status').value = '';
    loadPurchaseOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Recepción: un lote y vencimiento por producto
let receivingPo = null;

window.openReceivePoModal = (poId) => {
  receivingPo = loadedPurchaseOrders.find(p => p.id === poId);
  if (!receivingPo) return;
  document.getElementById('po-receive-title').textContent = `Recibir ${receivingPo.code} — ${receivingPo.supplierName}`;
  document.getElementById('table-po-receive-body').innerHTML = receivingPo.items.map(i => `
    <tr>
      <td><strong>${escapeHtml(i.productName)}</strong></td>
      <td class="col-center">${i.quantity}</td>
      ${i.perishable
        ? `<td><input type="text" required data-lot-for="${i.productId}" placeholder="N° de lote"></td>
      <td><input type="date" required data-exp-for="${i.productId}"></td>`
        : '<td colspan="2" class="muted">No vence: no requiere lote</td>'}
    </tr>`).join('');
  openModal('modal-po-receive');
};

document.getElementById('form-po-receive')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!receivingPo) return;
  const lots = receivingPo.items.map(i => ({
    productId: i.productId,
    lotNumber: document.querySelector(`[data-lot-for="${i.productId}"]`)?.value.trim() || null,
    expirationDate: document.querySelector(`[data-exp-for="${i.productId}"]`)?.value || null
  }));
  try {
    const res = await apiFetch(`/suppliers/purchase-orders/${receivingPo.id}/receive`, { method: 'POST', body: JSON.stringify({ lots }) });
    showToast(res.message, 'success');
    closeModal('modal-po-receive');
    await loadBaseData();
    loadPurchaseOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.cancelPurchaseOrder = async (poId) => {
  const po = loadedPurchaseOrders.find(p => p.id === poId);
  const ok = await confirmDialog({
    title: 'Cancelar orden de compra',
    message: `¿Cancelar la orden ${po?.code}? No se puede volver a activar.`,
    confirmText: 'Cancelar orden',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/suppliers/purchase-orders/${poId}/cancel`, { method: 'POST' });
    showToast('Orden de compra cancelada', 'info');
    loadPurchaseOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
};
