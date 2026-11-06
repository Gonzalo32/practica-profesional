// ==========================================================================
// PEDIDOS: listado del solicitante, alta de pedidos, recepción y trazabilidad
// ==========================================================================

let loadedSolicitanteOrders = [];
const solicitanteFilters = { search: '', status: 'PENDIENTE', page: 1 };
const ORDERS_PER_PAGE = 10;

async function loadSolicitanteOrders() {
  const tbody = document.getElementById('table-solicitante-orders-body');
  if (!loadedSolicitanteOrders.length) setTableLoading(tbody, 7);
  try {
    loadedSolicitanteOrders = await apiFetch('/orders');
    renderSolicitanteOrdersTable();
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}

function filteredSolicitanteOrders() {
  const q = solicitanteFilters.search;
  return loadedSolicitanteOrders.filter(o => {
    const haystack = [
      formatOrderCode(o),
      o.FromBranch?.name,
      o.ToBranch?.name,
      ...(o.OrderItems || []).map(i => i.Product?.name)
    ].join(' ').toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const matchesStatus = !solicitanteFilters.status || o.status === solicitanteFilters.status;
    return matchesSearch && matchesStatus;
  });
}

// ¿El usuario actual puede confirmar que recibió este pedido?
function canConfirmReception(order) {
  if (order.status !== 'DESPACHADO') return false;
  if (hasRole('Administrador')) return true;
  if (hasRole('Solicitante')) return String(order.solicitanteId) === String(state.user.id);
  if (hasRole('Usuario Responsable')) return String(order.toBranchId) === String(userBranchId());
  return false;
}

// Se puede modificar o cancelar mientras nadie empezó a prepararlo (quien lo pidió o el admin)
function canEditOrder(order) {
  if (!['PENDIENTE_VALIDACION', 'PENDIENTE'].includes(order.status)) return false;
  return hasRole('Administrador') || String(order.solicitanteId) === String(state.user.id);
}

// Ojo: datos del pedido y sus productos
window.openViewOrderModal = (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  if (!order) return;
  const row = (label, value) => `<div><strong>${label}:</strong> ${value}</div>`;
  document.getElementById('view-order-title').textContent = `Pedido ${formatOrderCode(order)}`;
  document.getElementById('view-order-content').innerHTML = [
    row('Estado', statusBadge(order.status)),
    row('Fecha', formatDateTime(order.createdAt)),
    row('Envía', escapeHtml(order.FromBranch?.name || 'General')),
    row('Recibe', escapeHtml(order.ToBranch?.name || 'General')),
    row('Pidió', escapeHtml(getUserDisplayName(order.Solicitante))),
    row('Unidades', `${(order.OrderItems || []).reduce((sum, i) => sum + i.quantity, 0)} en ${(order.OrderItems || []).length} producto(s)`),
    `<div class="span-2"><strong>Notas:</strong> ${escapeHtml(order.notes || 'Sin notas')}</div>`
  ].join('');
  document.getElementById('view-order-items').innerHTML = (order.OrderItems || []).map(i => `
    <tr><td><strong>${escapeHtml(i.Product?.name || 'Insumo')}</strong></td><td>${i.quantity} u.</td></tr>`).join('');
  openModal('modal-view-order');
};

// Tacho: cancelar el pedido (libera el stock reservado en el origen)
window.cancelOrder = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  const ok = await confirmDialog({
    title: 'Cancelar pedido',
    message: `¿Cancelar el pedido ${order ? formatOrderCode(order) : ''}? Se libera el stock que tenía reservado en la sucursal de origen y no se puede volver a activar.`,
    confirmText: 'Cancelar pedido',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'CANCELADO' }) });
    showToast('Pedido cancelado y stock liberado.', 'success');
    loadSolicitanteOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function itemsSummaryHtml(order) {
  return (order.OrderItems || []).map(i => `<strong>${escapeHtml(i.Product?.name || 'Insumo')}</strong> (x${i.quantity})`).join(', ') || 'Sin ítems';
}

function renderSolicitanteOrdersTable() {
  const tbody = document.getElementById('table-solicitante-orders-body');
  const pageData = paginate(filteredSolicitanteOrders(), solicitanteFilters.page, ORDERS_PER_PAGE);
  solicitanteFilters.page = pageData.page;

  if (!pageData.total) {
    renderEmptyRow(tbody, 7, 'No hay pedidos', 'Tus solicitudes aparecerán acá con su estado y trazabilidad.');
  } else {
    tbody.innerHTML = pageData.items.map(order => `
      <tr>
        <td><strong>${escapeHtml(formatOrderCode(order))}</strong></td>
        <td>${order.FromBranch ? escapeHtml(order.FromBranch.name) : '<span class="muted">General</span>'}</td>
        <td>${order.ToBranch ? escapeHtml(order.ToBranch.name) : '<span class="muted">General</span>'}</td>
        <td><span class="cell-detail">${itemsSummaryHtml(order)}</span></td>
        <td>${statusBadge(order.status)}</td>
        <td><span class="cell-date">${formatDateTime(order.createdAt)}</span></td>
        <td>
          <div class="action-btn-group">
            ${canConfirmReception(order) ? `<button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmar recepción</button>` : ''}
            <button class="btn-icon" title="Ver pedido" onclick="openViewOrderModal('${order.id}')">${ICON_VIEW}</button>
            ${canEditOrder(order) ? `
              <button class="btn-icon" title="Modificar pedido" onclick="openEditOrderModal('${order.id}')">${ICON_EDIT}</button>
              <button class="btn-icon btn-icon-danger" title="Cancelar pedido" onclick="cancelOrder('${order.id}')">${ICON_DELETE}</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination('solicitante-orders-pagination', pageData, 'pedidos', (page) => {
    solicitanteFilters.page = page;
    renderSolicitanteOrdersTable();
  });
}

document.getElementById('solicitante-search-orders')?.addEventListener('input', debounce((e) => {
  solicitanteFilters.search = e.target.value.toLowerCase().trim();
  solicitanteFilters.page = 1;
  renderSolicitanteOrdersTable();
}, 200));

document.querySelectorAll('#orders-status-tabs .order-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#orders-status-tabs .order-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    solicitanteFilters.status = tab.dataset.status;
    solicitanteFilters.page = 1;
    renderSolicitanteOrdersTable();
  });
});

document.getElementById('solicitante-filter-status')?.addEventListener('change', (e) => {
  solicitanteFilters.status = e.target.value;
  solicitanteFilters.page = 1;
  renderSolicitanteOrdersTable();
});

registerExporter('orders', async () => ({
  title: 'Pedidos',
  columns: [
    { header: 'N° Pedido', value: o => formatOrderCode(o) },
    { header: 'Origen', value: o => o.FromBranch?.name || 'General' },
    { header: 'Destino', value: o => o.ToBranch?.name || 'General' },
    { header: 'Solicitante', value: o => getUserDisplayName(o.Solicitante) },
    { header: 'Insumos', value: o => (o.OrderItems || []).map(i => `${i.Product?.name || 'Insumo'} x${i.quantity}`).join(', ') },
    { header: 'Estado', value: o => statusLabel(o.status) },
    { header: 'Fecha', value: o => formatDateTime(o.createdAt) }
  ],
  rows: filteredSolicitanteOrders()
}));

// Confirmación de recepción (T5.3): mueve el stock entre sucursales
window.markOrderEntregado = async (orderId) => {
  const order = [...loadedSolicitanteOrders, ...(window.loadedDeliveries || [])].find(o => o.id === orderId);
  const ok = await confirmDialog({
    title: 'Confirmar recepción',
    message: `¿Confirmás que recibiste físicamente los insumos del pedido ${order ? formatOrderCode(order) : ''}? El stock se descuenta del origen y se suma al destino.`,
    confirmText: 'Sí, lo recibí'
  });
  if (!ok) return;
  try {
    const res = await apiFetch(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'ENTREGADO' }) });
    showToast('Recepción confirmada: el stock se actualizó en ambas sucursales', 'success');
    (res.discrepancies || []).forEach(d => {
      showToast(`Discrepancia registrada: faltaban ${d.missing} u. de ${d.productName} en el origen`, 'error', 8000);
    });
    if (state.currentTab === 'panel-solicitante') loadSolicitanteOrders();
    if (state.currentTab === 'panel-responsable') loadResponsablePanel();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Modal: crear pedido
// --------------------------------------------------------------------------
let draftOrderItems = [];

// El mismo formulario sirve para crear y para modificar (editingOrder != null)
let editingOrder = null;

function setOrderModalMode(order) {
  editingOrder = order;
  document.getElementById('order-modal-title').textContent = order ? `Modificar pedido ${formatOrderCode(order)}` : 'Crear Nuevo Pedido de Insumos';
  document.getElementById('order-modal-submit').textContent = order ? 'Guardar cambios' : 'Confirmar y Enviar Pedido';
  // Al modificar, el origen y el destino quedan fijos (cambia solo lo que se pide)
  document.getElementById('order-modal-from-branch').disabled = !!order;
  document.getElementById('order-modal-to-branch').disabled = !!order;
}

async function openCreateOrderModal() {
  await ensureBaseData();
  setOrderModalMode(null);
  fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { placeholder: 'Seleccionar sucursal origen...', placeholderDisabled: true, getLabel: branchLabel });
  fillSelect(document.getElementById('order-modal-to-branch'), state.branches, { placeholder: 'Seleccionar sucursal destino...', placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() });
  document.getElementById('order-modal-notes').value = '';
  document.getElementById('order-modal-available').textContent = '';
  draftOrderItems = [];
  orderOriginAvailable = new Map();
  fillOrderProducts();
  renderOrderModalItemsTable();
  openModal('modal-create-order');
}
document.getElementById('btn-open-create-order-modal')?.addEventListener('click', openCreateOrderModal);

// Lápiz: agregar, quitar o cambiar cantidades de un pedido que todavía no se preparó
window.openEditOrderModal = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  if (!order) return;
  await ensureBaseData();
  setOrderModalMode(order);
  fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { getLabel: branchLabel, value: order.fromBranchId });
  fillSelect(document.getElementById('order-modal-to-branch'), state.branches, { getLabel: branchLabel, value: order.toBranchId });
  document.getElementById('order-modal-notes').value = order.notes || '';
  draftOrderItems = (order.OrderItems || []).map(i => ({
    productId: String(i.productId || i.Product?.id),
    productName: i.Product?.name || getProductName(i.productId),
    quantity: i.quantity
  }));
  await loadOrderOriginStock();
  renderOrderModalItemsTable();
  openModal('modal-create-order');
};

// Solo se ofrecen los productos con stock disponible en la sucursal de origen
let orderOriginAvailable = new Map(); // productId -> unidades disponibles
let orderOriginRequest = 0;

function fillOrderProducts() {
  const select = document.getElementById('order-modal-product-select');
  const branchId = document.getElementById('order-modal-from-branch').value;
  if (!branchId) {
    select.innerHTML = '<option value="">Elegí primero la sucursal de origen</option>';
    select.disabled = true;
    return;
  }
  const products = state.products
    .filter(p => orderOriginAvailable.has(String(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!products.length) {
    select.innerHTML = '<option value="">Esta sucursal no tiene stock disponible</option>';
    select.disabled = true;
    return;
  }
  select.disabled = false;
  select.innerHTML = '<option value="">Seleccioná un insumo...</option>' + products.map(p =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.Brand ? ` (${escapeHtml(p.Brand.name)})` : ''} — ${orderOriginAvailable.get(String(p.id))} disponibles</option>`).join('');
}

async function loadOrderOriginStock() {
  const branchId = document.getElementById('order-modal-from-branch').value;
  const request = ++orderOriginRequest;
  orderOriginAvailable = new Map();
  document.getElementById('order-modal-available').textContent = '';
  if (branchId) {
    try {
      const rows = await apiFetch(`/branches/${branchId}/available`);
      if (request !== orderOriginRequest) return; // llegó una respuesta vieja
      orderOriginAvailable = new Map(rows.map(r => [String(r.productId), r.available]));
      // Al modificar, lo que este mismo pedido ya tiene reservado también cuenta como disponible
      for (const item of editingOrder?.OrderItems || []) {
        const id = String(item.productId || item.Product?.id);
        orderOriginAvailable.set(id, (orderOriginAvailable.get(id) || 0) + item.quantity);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
  fillOrderProducts();

  // Si ya había productos en la lista y cambió el origen, se quitan los que ahí no hay
  const removed = draftOrderItems.filter(i => !orderOriginAvailable.has(String(i.productId)));
  if (removed.length) {
    draftOrderItems = draftOrderItems.filter(i => orderOriginAvailable.has(String(i.productId)));
    renderOrderModalItemsTable();
    showToast(`Se quitaron de la lista porque no hay stock en el nuevo origen: ${removed.map(i => i.productName).join(', ')}`, 'info', 6000);
  }
}

function showOrderAvailability() {
  const hint = document.getElementById('order-modal-available');
  const productId = document.getElementById('order-modal-product-select').value;
  const available = orderOriginAvailable.get(String(productId));
  const inList = draftOrderItems.find(i => i.productId === productId)?.quantity || 0;
  hint.textContent = productId && available !== undefined
    ? `Disponible en el origen: ${available} unidades${inList ? ` (ya agregaste ${inList})` : ''}`
    : '';
}
document.getElementById('order-modal-product-select')?.addEventListener('change', showOrderAvailability);
document.getElementById('order-modal-from-branch')?.addEventListener('change', loadOrderOriginStock);

document.getElementById('btn-order-modal-add-item')?.addEventListener('click', () => {
  const productSelect = document.getElementById('order-modal-product-select');
  const qtyInput = document.getElementById('order-modal-product-qty');
  const productId = productSelect.value;
  const quantity = parseInt(qtyInput.value, 10) || 0;

  if (!productId) return showToast('Seleccioná un insumo para agregar.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');
  const available = orderOriginAvailable.get(String(productId)) || 0;
  const already = draftOrderItems.find(item => item.productId === productId)?.quantity || 0;
  if (already + quantity > available) {
    return showToast(`En el origen hay ${available} unidades disponibles${already ? ` y ya agregaste ${already}` : ''}.`, 'error');
  }

  const existing = draftOrderItems.find(item => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else draftOrderItems.push({ productId, productName: getProductName(productId), quantity });

  qtyInput.value = '1';
  productSelect.value = '';
  document.getElementById('order-modal-available').textContent = '';
  renderOrderModalItemsTable();
});

function renderDraftItems(tbodyId, countId, items, removeFn, emptyText, extraCols = () => '') {
  const tbody = document.getElementById(tbodyId);
  const count = document.getElementById(countId);
  if (count) count.textContent = `${items.length} artículo${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    const cols = tbody.closest('table').querySelectorAll('thead th').length;
    tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-text">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }
  tbody.innerHTML = items.map((item, index) => `
    <tr>
      <td><strong>${escapeHtml(item.productName)}</strong></td>
      <td class="col-center"><span class="badge">${item.quantity}</span></td>
      ${extraCols(item)}
      <td class="col-center">
        <button type="button" class="btn-icon btn-icon-danger" title="Quitar" onclick="${removeFn}(${index})">${ICON_DELETE}</button>
      </td>
    </tr>`).join('');
}

function renderOrderModalItemsTable() {
  renderDraftItems('table-order-modal-items-body', 'order-modal-items-count', draftOrderItems, 'removeOrderModalItem', 'Aún no agregaste insumos a este pedido.');
}

window.removeOrderModalItem = (index) => {
  draftOrderItems.splice(index, 1);
  renderOrderModalItemsTable();
};

document.getElementById('form-create-order-modal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromBranchId = document.getElementById('order-modal-from-branch').value;
  const toBranchId = document.getElementById('order-modal-to-branch').value;
  const notes = document.getElementById('order-modal-notes').value.trim();

  if (!fromBranchId || !toBranchId) return showToast('Seleccioná la sucursal de origen y la de destino.', 'error');
  if (fromBranchId === toBranchId) return showToast('El origen y el destino no pueden ser la misma sucursal.', 'error');
  if (!draftOrderItems.length) return showToast('Agregá al menos un insumo al pedido antes de confirmar.', 'error');

  try {
    const items = draftOrderItems.map(item => ({ productId: item.productId, quantity: item.quantity }));
    if (editingOrder) {
      const res = await apiFetch(`/orders/${editingOrder.id}`, { method: 'PUT', body: JSON.stringify({ items, notes }) });
      showToast(`Pedido ${res.order.code} modificado${res.order.status === 'PENDIENTE_VALIDACION' ? '. Necesita aprobación del administrador.' : '.'}`, 'success');
      closeModal('modal-create-order');
      loadSolicitanteOrders();
      refreshNotifications();
      return;
    }
    const res = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({ items, fromBranchId, toBranchId, notes })
    });
    // El servidor decide si el pedido requiere aprobación del administrador (más de 50 unidades de un producto)
    showToast(`Pedido ${res.order.code} creado${res.order.requiresValidation ? '. Requiere aprobación del administrador.' : ' y enviado.'}`, 'success');
    closeModal('modal-create-order');
    solicitanteFilters.status = 'PENDIENTE';
    solicitanteFilters.page = 1;
    document.querySelectorAll('#orders-status-tabs .order-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.status === 'PENDIENTE');
    });
    loadSolicitanteOrders();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// --------------------------------------------------------------------------
// Trazabilidad del pedido (T5.4)
// --------------------------------------------------------------------------
window.openTimelineModal = async (orderId) => {
  const order = [...loadedSolicitanteOrders, ...(window.loadedDispatchOrders || []), ...(window.loadedDeliveries || [])].find(o => o.id === orderId);
  document.getElementById('modal-order-id-label').textContent = order ? formatOrderCode(order) : orderId.substring(0, 8);
  const container = document.getElementById('timeline-container');
  container.innerHTML = '<p class="empty-text">Cargando trazabilidad...</p>';
  openModal('timeline-modal');

  try {
    const history = await apiFetch(`/orders/${orderId}/history`);
    if (!history.length) {
      container.innerHTML = '<p class="empty-text">No hay eventos registrados para este pedido.</p>';
      return;
    }
    container.innerHTML = history.map(item => `
      <div class="timeline-item">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <span class="timeline-time">${formatDateTime(item.timestamp || item.createdAt)}</span>
          <span class="timeline-action">${escapeHtml(item.action)}</span>
          <span class="timeline-details">${formatLogDetails(item.details)} (por ${escapeHtml(getUserDisplayName(item.User))})</span>
        </div>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<p class="empty-text text-danger">${escapeHtml(err.message)}</p>`;
  }
};
