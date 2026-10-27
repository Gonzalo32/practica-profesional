// ==========================================================================
// PEDIDOS: listado del solicitante, alta de pedidos, recepción y trazabilidad
// ==========================================================================

let loadedSolicitanteOrders = [];
const solicitanteFilters = { search: '', status: '', page: 1 };
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
          <div class="btn-row">
            ${canConfirmReception(order) ? `<button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmar recepción</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')">Trazabilidad</button>
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

async function openCreateOrderModal() {
  await ensureBaseData();
  fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { placeholder: 'Seleccionar sucursal origen...', placeholderDisabled: true, getLabel: branchLabel });
  fillSelect(document.getElementById('order-modal-to-branch'), state.branches, { placeholder: 'Seleccionar sucursal destino...', placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() });
  fillSelect(document.getElementById('order-modal-product-select'), state.products, { placeholder: 'Seleccioná un insumo...' });
  document.getElementById('order-modal-notes').value = '';
  document.getElementById('order-modal-available').textContent = '';
  draftOrderItems = [];
  renderOrderModalItemsTable();
  openModal('modal-create-order');
}
document.getElementById('btn-open-create-order-modal')?.addEventListener('click', openCreateOrderModal);

// Muestra cuánto hay disponible en el origen del producto elegido (si el usuario puede verlo)
async function showOrderAvailability() {
  const hint = document.getElementById('order-modal-available');
  const branchId = document.getElementById('order-modal-from-branch').value;
  const productId = document.getElementById('order-modal-product-select').value;
  hint.textContent = '';
  if (!branchId || !productId) return;
  try {
    const { stockItems } = await apiFetch(`/branches/${branchId}/stock`);
    const item = stockItems.find(s => String(s.productId) === String(productId));
    hint.textContent = `Disponible en el origen: ${item ? item.availableQuantity : 0} unidades`;
  } catch (err) {
    // Sin permiso para ver el stock de esa sucursal: el servidor valida igual al confirmar
  }
}
document.getElementById('order-modal-product-select')?.addEventListener('change', showOrderAvailability);
document.getElementById('order-modal-from-branch')?.addEventListener('change', showOrderAvailability);

document.getElementById('btn-order-modal-add-item')?.addEventListener('click', () => {
  const productSelect = document.getElementById('order-modal-product-select');
  const qtyInput = document.getElementById('order-modal-product-qty');
  const productId = productSelect.value;
  const quantity = parseInt(qtyInput.value, 10) || 0;

  if (!productId) return showToast('Seleccioná un insumo para agregar.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');

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
    // Los pedidos grandes requieren aprobación del administrador
    const requiresValidation = draftOrderItems.some(item => item.quantity > 50);
    const res = await apiFetch('/orders', {
      method: 'POST',
      body: JSON.stringify({ items, requiresValidation, fromBranchId, toBranchId, notes })
    });
    showToast(`Pedido ${res.order.code} creado${requiresValidation ? '. Requiere aprobación del administrador.' : ' y enviado.'}`, 'success');
    closeModal('modal-create-order');
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
