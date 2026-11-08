// ==========================================================================
// PEDIDOS: listado del solicitante, alta de pedidos, recepción y trazabilidad
// ==========================================================================

let loadedSolicitanteOrders = [];
const solicitanteFilters = { search: '', status: 'PENDIENTE', page: 1 };
const ORDERS_PER_PAGE = 10;

async function loadSolicitanteOrders() {
  const tbody = document.getElementById('table-solicitante-orders-body');
  if (!loadedSolicitanteOrders.length) setTableLoading(tbody, 7);
  // Solicitante, Usuario Responsable y Administrador pueden realizar pedidos (el Despachante solo prepara y envía)
  document.getElementById('btn-open-create-order-modal')?.classList.toggle(
    'hidden',
    !hasRole('Solicitante', 'Usuario Responsable', 'Administrador')
  );
  // Precarga productos, sucursales y stock disponible por sucursal en segundo plano
  ensureBaseData().then(() => preloadBranchesStock()).catch(() => {});
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
    const matchesStatus = !solicitanteFilters.status
      || o.status === solicitanteFilters.status
      || (solicitanteFilters.status === 'PENDIENTE' && o.status === 'EN_PREPARACION');
    return matchesSearch && matchesStatus;
  });
}

// ¿El usuario actual puede confirmar que recibió este pedido? (Solicitante, U. Responsable o Admin)
function canConfirmReception(order) {
  if (order.status !== 'DESPACHADO') return false;
  if (hasRole('Administrador')) return true;
  if (hasRole('Solicitante')) return String(order.solicitanteId) === String(state.user.id);
  if (hasRole('Usuario Responsable')) {
    return String(order.solicitanteId) === String(state.user.id) || String(order.toBranchId) === String(userBranchId());
  }
  return false;
}

// ¿El usuario actual puede preparar este pedido? (Solo Administrador y Despachante en Pendientes)
function canPrepareOrder(order) {
  return ['PENDIENTE', 'EN_PREPARACION'].includes(order.status) && hasRole('Administrador', 'Despachante');
}

// ¿El usuario actual puede aprobar este pedido en Revisión? (Administrador)
function canApproveOrder(order) {
  return order.status === 'PENDIENTE_VALIDACION' && hasRole('Administrador');
}

// ¿El usuario actual puede rechazar este pedido? (En Pendiente o Revisión, solo el Administrador)
function canRejectOrder(order) {
  return ['PENDIENTE_VALIDACION', 'PENDIENTE', 'EN_PREPARACION'].includes(order.status) && hasRole('Administrador');
}

// Lápiz para modificar un pedido en Pendientes (o Revisión), mientras nadie empezó a prepararlo.
// Igual que en el servidor: el Administrador, el Usuario Responsable o quien hizo el pedido.
function canEditOrder(order) {
  if (!['PENDIENTE_VALIDACION', 'PENDIENTE'].includes(order.status)) return false;
  if (hasRole('Administrador', 'Usuario Responsable')) return true;
  return String(order.solicitanteId) === String(state.user.id);
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
    row('Unidades solicitadas', `${(order.OrderItems || []).reduce((sum, i) => sum + i.quantity, 0)} en ${(order.OrderItems || []).length} producto(s)`),
    `<div class="span-2"><strong>Notas:</strong> ${escapeHtml(order.notes || 'Sin notas')}</div>`
  ].join('');
  document.getElementById('view-order-items').innerHTML = (order.OrderItems || []).map(i => {
    const dispatched = i.dispatchedQuantity !== null && i.dispatchedQuantity !== undefined ? `${i.dispatchedQuantity} u.` : '—';
    const vars = (i.preparedVariants || []).map(v => `${escapeHtml(v.lotNumber ? `Lote ${v.lotNumber}` : 'Sin lote')}: ${v.quantity} u.`).join(' · ');
    return `
      <tr>
        <td><strong>${escapeHtml(i.Product?.name || 'Insumo')}</strong></td>
        <td>${i.quantity} u.</td>
        <td>${dispatched}${vars ? `<div class="cell-detail">${vars}</div>` : ''}</td>
      </tr>`;
  }).join('');
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
  return (order.OrderItems || []).map(i => {
    const sent = i.dispatchedQuantity !== null && i.dispatchedQuantity !== undefined && i.dispatchedQuantity !== i.quantity
      ? ` → enviado x${i.dispatchedQuantity}`
      : '';
    return `<strong>${escapeHtml(i.Product?.name || 'Insumo')}</strong> (x${i.quantity}${sent})`;
  }).join(', ') || 'Sin ítems';
}

function renderSolicitanteOrdersTable() {
  const tbody = document.getElementById('table-solicitante-orders-body');
  const pageData = paginate(filteredSolicitanteOrders(), solicitanteFilters.page, ORDERS_PER_PAGE);
  solicitanteFilters.page = pageData.page;

  if (!pageData.total) {
    renderEmptyRow(tbody, 7, 'No hay pedidos', 'Las solicitudes aparecerán acá con su estado y trazabilidad.');
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
            ${canApproveOrder(order) ? `<button class="btn btn-primary btn-sm" onclick="approveOrderFromPedidos('${order.id}')">Aprobar</button>` : ''}
            ${canPrepareOrder(order) ? `<button class="btn btn-primary btn-sm" onclick="openPrepareOrderModal('${order.id}')">Preparar</button>` : ''}
            ${canConfirmReception(order) ? `<button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmación de recepción</button>` : ''}
            ${canRejectOrder(order) ? `<button class="btn btn-danger-soft btn-sm" onclick="rejectOrderFromPedidos('${order.id}')">Rechazar</button>` : ''}
            <button class="btn-icon" title="Ver pedido" onclick="openViewOrderModal('${order.id}')">${ICON_VIEW}</button>
            ${canEditOrder(order) ? `<button class="btn-icon" title="Modificar pedido" onclick="openEditOrderModal('${order.id}')">${ICON_EDIT}</button>` : ''}
          </div>
        </td>
      </tr>`).join('');
  }

  renderPagination('solicitante-orders-pagination', pageData, 'pedidos', (page) => {
    solicitanteFilters.page = page;
    renderSolicitanteOrdersTable();
  });
}

// Aprobar pedido en Revisión (pasa a Pendiente para que el despachante lo prepare)
window.approveOrderFromPedidos = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  const ok = await confirmDialog({
    title: 'Aprobar pedido en revisión',
    message: `¿Aprobar el pedido ${order ? formatOrderCode(order) : ''}? Pasará a la solapa Pendientes esperando a que el despachante lo prepare.`,
    confirmText: 'Aprobar pedido'
  });
  if (!ok) return;
  try {
    await apiFetch(`/orders/${orderId}/approve`, { method: 'POST', body: JSON.stringify({}) });
    showToast('Pedido aprobado: pasó a Pendientes para su preparación.', 'success');
    loadSolicitanteOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Rechazar pedido desde Revisión o Pendiente (termina su vida y libera el stock reservado)
window.rejectOrderFromPedidos = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  const ok = await confirmDialog({
    title: 'Rechazar pedido',
    message: `¿Rechazar el pedido ${order ? formatOrderCode(order) : ''}? El pedido pasará a Rechazados, finalizará su ciclo y se liberará el stock reservado en la sucursal de origen.`,
    confirmText: 'Rechazar pedido',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'RECHAZADO' }) });
    showToast('Pedido rechazado y reserva liberada.', 'success');
    loadSolicitanteOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Modal: Preparar pedido (seleccionar cantidad a enviar de cada variante)
// --------------------------------------------------------------------------
let preparingOrder = null;

window.openPrepareOrderModal = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  if (!order) return;
  preparingOrder = order;

  document.getElementById('prepare-order-id').value = order.id;
  document.getElementById('prepare-order-title').textContent = `Preparar Pedido ${formatOrderCode(order)}`;
  document.getElementById('prepare-order-summary').innerHTML = `
    Origen: <strong>${escapeHtml(order.FromBranch?.name || 'General')}</strong> → Destino: <strong>${escapeHtml(order.ToBranch?.name || 'General')}</strong> · Solicitó: <strong>${escapeHtml(getUserDisplayName(order.Solicitante))}</strong>
  `;

  const container = document.getElementById('prepare-order-items-container');
  container.innerHTML = '<p class="empty-text">Cargando variantes disponibles en la sucursal de origen...</p>';
  openModal('modal-prepare-order');

  try {
    const branchId = order.fromBranchId;
    const [lots, stockRows] = branchId
      ? await Promise.all([
          apiFetch(`/inventory/lots?branchId=${encodeURIComponent(branchId)}&withStock=true`).catch(() => []),
          apiFetch(`/branches/${encodeURIComponent(branchId)}/available?includeTotal=true`).catch(() => [])
        ])
      : [[], []];

    const lotsByProduct = new Map();
    for (const lot of lots) {
      const pid = String(lot.productId);
      if (!lotsByProduct.has(pid)) lotsByProduct.set(pid, []);
      lotsByProduct.get(pid).push(lot);
    }
    const stockByProduct = new Map(stockRows.map(r => [String(r.productId), r]));

    container.innerHTML = (order.OrderItems || []).map(item => {
      const prodId = String(item.productId || item.Product?.id);
      const prodName = item.Product?.name || getProductName(prodId);
      const requested = item.quantity;
      const prodLots = (lotsByProduct.get(prodId) || []).filter(l => (l.remaining || 0) > 0);
      const inLots = prodLots.reduce((sum, l) => sum + (l.remaining || 0), 0);
      const totalBranchQty = stockByProduct.get(prodId)?.quantity ?? Math.max(inLots, requested);
      const withoutLotQty = Math.max(0, totalBranchQty - inLots);

      // Autocompletar inicialmente en orden FEFO hasta completar la cantidad solicitada
      let remainingToAutoFill = requested;
      const variantRows = [];

      for (const lot of prodLots) {
        const inStock = lot.remaining || 0;
        const autoSend = Math.min(inStock, remainingToAutoFill);
        remainingToAutoFill -= autoSend;
        variantRows.push({
          lotId: lot.id,
          label: `<span class="badge">${escapeHtml(lot.lotNumber || 'Sin número')}</span>`,
          brand: lot.brandName ? escapeHtml(lot.brandName) : '<span class="muted">—</span>',
          expiration: typeof expirationCell === 'function' ? expirationCell(lot.expirationDate) : formatDateOnly(lot.expirationDate),
          inStock,
          initialSend: autoSend
        });
      }

      if (withoutLotQty > 0 || !variantRows.length) {
        const inStock = withoutLotQty || requested;
        const autoSend = Math.min(inStock, remainingToAutoFill);
        remainingToAutoFill -= autoSend;
        variantRows.push({
          lotId: '',
          label: '<span class="muted">Sin lote (Stock general)</span>',
          brand: '<span class="muted">—</span>',
          expiration: '<span class="muted">—</span>',
          inStock,
          initialSend: autoSend
        });
      }

      return `
        <div class="card glass-light prepare-product-card" data-product-id="${escapeHtml(prodId)}" data-requested="${requested}" style="padding:14px;">
          <div class="item-list-header" style="margin-bottom:8px;">
            <div>
              <strong>${escapeHtml(prodName)}</strong>
              <span class="muted" style="font-size:0.82rem; margin-left:6px;">Solicitado: <strong>${requested} u.</strong> (máx. ${requested} u.)</span>
            </div>
            <span class="badge prepare-item-counter" data-counter-for="${escapeHtml(prodId)}">0 / ${requested} u.</span>
          </div>
          <div class="table-responsive">
            <table class="adjust-variants-table">
              <thead>
                <tr>
                  <th>Variante / Lote</th>
                  <th>Marca</th>
                  <th>Vence</th>
                  <th>En sucursal</th>
                  <th>Cantidad a enviar</th>
                </tr>
              </thead>
              <tbody>
                ${variantRows.map(v => {
                  const maxForVariant = Math.min(v.inStock, requested);
                  return `
                    <tr>
                      <td>${v.label}</td>
                      <td>${v.brand}</td>
                      <td>${v.expiration}</td>
                      <td><strong>${v.inStock}</strong> u.</td>
                      <td>
                        <div style="display:inline-flex; align-items:center; gap:6px;">
                          <button type="button" class="btn btn-secondary btn-sm prepare-step-btn" data-delta="-1" style="padding:2px 8px; line-height:1;">-</button>
                          <input type="number" class="prepare-variant-qty" data-product="${escapeHtml(prodId)}" data-lot="${escapeHtml(v.lotId)}" data-stock="${v.inStock}" data-requested="${requested}" value="${v.initialSend}" min="0" max="${maxForVariant}" step="1" aria-label="Cantidad a enviar">
                          <button type="button" class="btn btn-secondary btn-sm prepare-step-btn" data-delta="1" style="padding:2px 8px; line-height:1;">+</button>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }).join('');

    updatePrepareOrderTotals();
  } catch (err) {
    container.innerHTML = `<p class="empty-text text-danger">${escapeHtml(err.message)}</p>`;
  }
};

function updatePrepareOrderTotals(changedInput = null) {
  const cards = document.querySelectorAll('#prepare-order-items-container .prepare-product-card');
  cards.forEach(card => {
    const requested = Number(card.dataset.requested) || 0;
    const inputs = [...card.querySelectorAll('.prepare-variant-qty')];

    // Clamping individual por stock de cada variante
    inputs.forEach(inp => {
      const stockMax = Number(inp.dataset.stock) || 0;
      let val = Math.max(0, parseInt(inp.value, 10) || 0);
      if (val > stockMax) val = stockMax;
      inp.value = String(val);
    });

    // Nunca permitir que la suma de variantes de un artículo supere lo solicitado
    let sum = inputs.reduce((acc, inp) => acc + (parseInt(inp.value, 10) || 0), 0);
    if (sum > requested && changedInput && card.contains(changedInput)) {
      const othersSum = inputs.filter(i => i !== changedInput).reduce((acc, inp) => acc + (parseInt(inp.value, 10) || 0), 0);
      const allowed = Math.max(0, requested - othersSum);
      changedInput.value = String(allowed);
      sum = othersSum + allowed;
      showToast(`No podés enviar más de las ${requested} u. solicitadas para este artículo.`, 'info', 2500);
    }

    const counter = card.querySelector('.prepare-item-counter');
    if (counter) {
      counter.textContent = `Enviar: ${sum} / ${requested} u.`;
      counter.className = `badge prepare-item-counter ${sum === requested ? 'badge-success' : sum > 0 ? 'badge-warning' : ''}`;
    }
  });
}

document.getElementById('prepare-order-items-container')?.addEventListener('input', (e) => {
  const input = e.target.closest('.prepare-variant-qty');
  if (input) updatePrepareOrderTotals(input);
});

document.getElementById('prepare-order-items-container')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.prepare-step-btn');
  if (!btn) return;
  const input = btn.closest('tr')?.querySelector('.prepare-variant-qty');
  if (!input) return;
  const delta = Number(btn.dataset.delta) || 0;
  const stockMax = Number(input.dataset.stock) || 0;
  const current = parseInt(input.value, 10) || 0;
  input.value = String(Math.min(stockMax, Math.max(0, current + delta)));
  updatePrepareOrderTotals(input);
});

document.getElementById('form-prepare-order')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!preparingOrder) return;

  const cards = [...document.querySelectorAll('#prepare-order-items-container .prepare-product-card')];
  const itemsPayload = [];
  let grandTotal = 0;

  for (const card of cards) {
    const productId = card.dataset.productId;
    const requested = Number(card.dataset.requested) || 0;
    const inputs = [...card.querySelectorAll('.prepare-variant-qty')];
    const variants = inputs.map(inp => ({
      lotId: inp.dataset.lot || null,
      quantity: Math.max(0, parseInt(inp.value, 10) || 0)
    })).filter(v => v.quantity > 0);

    const sum = variants.reduce((acc, v) => acc + v.quantity, 0);
    if (sum > requested) {
      return showToast(`No se puede enviar más de lo solicitado (${requested} u.).`, 'error');
    }
    grandTotal += sum;
    itemsPayload.push({ productId, variants });
  }

  if (grandTotal <= 0) {
    return showToast('Seleccioná al menos 1 unidad para enviar.', 'error');
  }

  const submitBtn = document.getElementById('btn-prepare-order-submit');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
  }

  try {
    await apiFetch(`/orders/${preparingOrder.id}/prepare`, {
      method: 'POST',
      body: JSON.stringify({ items: itemsPayload })
    });
    showToast(`Pedido ${formatOrderCode(preparingOrder)} preparado y despachado.`, 'success');
    closeModal('modal-prepare-order');
    solicitanteFilters.status = 'DESPACHADO';
    solicitanteFilters.page = 1;
    document.querySelectorAll('#orders-status-tabs .order-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.status === 'DESPACHADO');
    });
    loadSolicitanteOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar';
    }
  }
});

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

// Caché de stock disponible por sucursal para respuesta instantánea (0ms) al cambiar sucursal
const branchAvailableCache = new Map(); // branchId -> Map(productId -> available)
let orderOriginAvailable = new Map(); // productId -> unidades disponibles
let orderOriginRequest = 0;
let renderOrderProductDropdown = () => {};

async function fetchBranchAvailableMap(branchId) {
  const rows = await apiFetch(`/branches/${branchId}/available`);
  const map = new Map(rows.map(r => [String(r.productId), r.available]));
  branchAvailableCache.set(String(branchId), map);
  return map;
}

async function preloadBranchesStock() {
  if (!state.branches?.length) return;
  await Promise.all(
    state.branches.map(b => fetchBranchAvailableMap(b.id).catch(() => {}))
  );
}

function buildEffectiveOriginMap(baseMap) {
  const map = new Map(baseMap || []);
  for (const item of editingOrder?.OrderItems || []) {
    const id = String(item.productId || item.Product?.id);
    map.set(id, (map.get(id) || 0) + item.quantity);
  }
  return map;
}

function getRemainingAvailable(productId) {
  const totalAvail = orderOriginAvailable.get(String(productId)) || 0;
  const inCart = draftOrderItems.find(i => String(i.productId) === String(productId))?.quantity || 0;
  return Math.max(0, totalAvail - inCart);
}

function setOrderModalMode(order) {
  editingOrder = order;
  document.getElementById('order-modal-title').textContent = order ? `Modificar pedido ${formatOrderCode(order)}` : 'Crear Nuevo Pedido de Insumos';
  const submitBtn = document.getElementById('order-modal-submit');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = order ? 'Guardar cambios' : 'Confirmar y Enviar Pedido';
  }
  // Al modificar, el origen y el destino quedan fijos. Al crear, Solicitante y Usuario Responsable solo piden para su propia sucursal.
  document.getElementById('order-modal-from-branch').disabled = !!order;
  const lockToOwnBranch = !hasRole('Administrador') && !!userBranchId();
  document.getElementById('order-modal-to-branch').disabled = !!order || lockToOwnBranch;
}

async function openCreateOrderModal() {
  setOrderModalMode(null);
  document.getElementById('order-modal-notes').value = '';
  document.getElementById('order-modal-available').textContent = '';
  draftOrderItems = [];
  orderOriginAvailable = new Map();
  renderOrderModalItemsTable();

  const toBranches = hasRole('Administrador') ? state.branches : operableBranches();
  if (state.branches?.length) {
    fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { placeholder: 'Seleccionar sucursal origen...', placeholderDisabled: true, getLabel: branchLabel });
    fillSelect(document.getElementById('order-modal-to-branch'), toBranches, { placeholder: toBranches.length > 1 ? 'Seleccionar sucursal destino...' : null, placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() || toBranches[0]?.id });
  }
  fillOrderProducts();
  openModal('modal-create-order');

  if (!state.products.length || !state.branches.length) {
    await ensureBaseData();
    const freshToBranches = hasRole('Administrador') ? state.branches : operableBranches();
    fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { placeholder: 'Seleccionar sucursal origen...', placeholderDisabled: true, getLabel: branchLabel });
    fillSelect(document.getElementById('order-modal-to-branch'), freshToBranches, { placeholder: freshToBranches.length > 1 ? 'Seleccionar sucursal destino...' : null, placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() || freshToBranches[0]?.id });
    setOrderModalMode(null);
    fillOrderProducts();
  }
  preloadBranchesStock();
}
document.getElementById('btn-open-create-order-modal')?.addEventListener('click', openCreateOrderModal);

// Lápiz: agregar, quitar o cambiar cantidades de un pedido que todavía no se preparó
window.openEditOrderModal = async (orderId) => {
  const order = loadedSolicitanteOrders.find(o => o.id === orderId);
  if (!order) return;
  setOrderModalMode(order);
  document.getElementById('order-modal-notes').value = order.notes || '';
  draftOrderItems = (order.OrderItems || []).map(i => ({
    productId: String(i.productId || i.Product?.id),
    productName: i.Product?.name || getProductName(i.productId),
    quantity: i.quantity
  }));
  renderOrderModalItemsTable();

  if (state.branches?.length) {
    fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { getLabel: branchLabel, value: order.fromBranchId });
    fillSelect(document.getElementById('order-modal-to-branch'), state.branches, { getLabel: branchLabel, value: order.toBranchId });
  }
  openModal('modal-create-order');

  await ensureBaseData();
  fillSelect(document.getElementById('order-modal-from-branch'), state.branches, { getLabel: branchLabel, value: order.fromBranchId });
  fillSelect(document.getElementById('order-modal-to-branch'), state.branches, { getLabel: branchLabel, value: order.toBranchId });
  await loadOrderOriginStock({ focusSearch: false });
};

function fillOrderProducts({ keepDropdown = false } = {}) {
  const hiddenInput = document.getElementById('order-modal-product-select');
  const searchInput = document.getElementById('order-modal-product-search');
  const dropdown = document.getElementById('order-product-search-dropdown');
  const branchId = document.getElementById('order-modal-from-branch')?.value;

  if (hiddenInput) hiddenInput.value = '';
  if (searchInput) searchInput.value = '';
  if (dropdown && !keepDropdown) dropdown.classList.add('hidden');
  const hint = document.getElementById('order-modal-available');
  if (hint) hint.textContent = '';

  if (!branchId) {
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Elegí primero la sucursal de origen';
    }
    return;
  }

  const availableCount = (state.products || []).filter(p => {
    const avail = orderOriginAvailable.get(String(p.id));
    return avail !== undefined && avail > 0;
  }).length;

  if (!availableCount) {
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Esta sucursal no tiene stock disponible';
    }
    return;
  }

  if (searchInput) {
    searchInput.disabled = false;
    searchInput.placeholder = 'Escribí para buscar o usá las flechas ↓↑...';
  }
}

function setupOrderProductSearch() {
  const searchInput = document.getElementById('order-modal-product-search');
  const hiddenInput = document.getElementById('order-modal-product-select');
  const dropdown = document.getElementById('order-product-search-dropdown');
  const toggleBtn = document.getElementById('order-product-search-toggle');

  if (!searchInput || !dropdown) return;

  function renderDropdown(filterText = '') {
    const branchId = document.getElementById('order-modal-from-branch')?.value;
    if (!branchId) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem;">Elegí primero la sucursal de origen</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    const q = filterText.toLowerCase().trim();
    // Solo sugerir los artículos que tiene la sucursal que envía con saldo disponible (> 0)
    const list = (state.products || [])
      .filter(p => getRemainingAvailable(p.id) > 0)
      .filter(p => {
        if (!q) return true;
        const haystack = [p.name, p.sku, p.Category?.name, p.Brand?.name].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!list.length) {
      dropdown.innerHTML = '<div style="padding:10px 14px; color:var(--text-muted); font-size:0.85rem;">No quedan insumos con stock disponible para ese filtro</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    dropdown.innerHTML = list.map((p, idx) => {
      const remaining = getRemainingAvailable(p.id);
      const isSelected = hiddenInput.value ? (hiddenInput.value === String(p.id)) : (idx === 0);
      const brandText = p.Brand?.name ? `Marca: ${escapeHtml(p.Brand.name)} · ` : '';
      const skuText = p.sku ? `SKU: ${escapeHtml(p.sku)} · ` : '';
      const catText = escapeHtml(p.Category?.name || 'Sin categoría');
      return `
        <div class="select-search-item ${isSelected ? 'highlighted' : ''}" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span class="select-search-item-name">${escapeHtml(p.name)}</span>
            <span class="badge badge-success" style="font-size:0.75rem; padding:2px 8px; white-space:nowrap;">${remaining} disp.</span>
          </div>
          <span class="select-search-item-sub">${brandText}${skuText}${catText}</span>
        </div>
      `;
    }).join('');
    dropdown.classList.remove('hidden');
  }

  renderOrderProductDropdown = renderDropdown;

  searchInput.addEventListener('focus', () => {
    if (!searchInput.disabled) {
      renderDropdown(searchInput.value);
    }
  });

  searchInput.addEventListener('click', () => {
    if (!searchInput.disabled && dropdown.classList.contains('hidden')) {
      renderDropdown(searchInput.value);
    }
  });

  searchInput.addEventListener('input', () => {
    hiddenInput.value = '';
    showOrderAvailability();
    renderDropdown(searchInput.value);
  });

  const selectItem = (item) => {
    if (!item) return;
    hiddenInput.value = item.dataset.id;
    searchInput.value = item.dataset.name;
    dropdown.classList.add('hidden');
    showOrderAvailability();
    const qtyInput = document.getElementById('order-modal-product-qty');
    if (qtyInput) {
      qtyInput.max = String(getRemainingAvailable(item.dataset.id) || 1);
      qtyInput.focus();
      qtyInput.select();
    }
  };

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
        if (target) {
          selectItem(target);
          return;
        }
      }
      if (hiddenInput.value) {
        const qtyInput = document.getElementById('order-modal-product-qty');
        qtyInput?.focus();
        qtyInput?.select();
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
      e.preventDefault(); // evita blur y responde al instante
      selectItem(item);
    }
  });

  document.addEventListener('click', (e) => {
    if (!document.getElementById('order-product-search-container')?.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

setupOrderProductSearch();

async function loadOrderOriginStock({ focusSearch = true } = {}) {
  const branchId = document.getElementById('order-modal-from-branch').value;
  const searchInput = document.getElementById('order-modal-product-search');
  const hiddenInput = document.getElementById('order-modal-product-select');
  const dropdown = document.getElementById('order-product-search-dropdown');
  const hint = document.getElementById('order-modal-available');
  const request = ++orderOriginRequest;

  if (hiddenInput) hiddenInput.value = '';
  if (hint) hint.textContent = '';

  if (!branchId) {
    orderOriginAvailable = new Map();
    fillOrderProducts();
    return;
  }

  // Si ya está en caché, activamos el buscador en 0ms sin bloquear la interfaz
  const cached = branchAvailableCache.get(String(branchId));
  if (cached) {
    orderOriginAvailable = buildEffectiveOriginMap(cached);
    fillOrderProducts();
    pruneUnavailableDraftItems();
    if (focusSearch && searchInput && !searchInput.disabled) {
      searchInput.focus();
      renderOrderProductDropdown('');
    }
  } else {
    orderOriginAvailable = new Map();
    if (searchInput) {
      searchInput.value = '';
      searchInput.disabled = true;
      searchInput.placeholder = 'Cargando stock disponible...';
    }
    if (dropdown) dropdown.classList.add('hidden');
  }

  try {
    const freshMap = await fetchBranchAvailableMap(branchId);
    if (request !== orderOriginRequest) return;
    orderOriginAvailable = buildEffectiveOriginMap(freshMap);
    const wasDisabled = searchInput?.disabled;
    if (wasDisabled) {
      fillOrderProducts();
      if (focusSearch && searchInput && !searchInput.disabled) {
        searchInput.focus();
        renderOrderProductDropdown('');
      }
    } else if (dropdown && !dropdown.classList.contains('hidden')) {
      renderOrderProductDropdown(searchInput?.value || '');
    }
    pruneUnavailableDraftItems();
  } catch (err) {
    if (!cached) showToast(err.message, 'error');
  }
}

function pruneUnavailableDraftItems() {
  const removed = draftOrderItems.filter(i => (orderOriginAvailable.get(String(i.productId)) || 0) <= 0);
  if (removed.length) {
    draftOrderItems = draftOrderItems.filter(i => (orderOriginAvailable.get(String(i.productId)) || 0) > 0);
    renderOrderModalItemsTable();
    showToast(`Se quitaron de la lista porque no hay stock en el nuevo origen: ${removed.map(i => i.productName).join(', ')}`, 'info', 6000);
  }
}

function showOrderAvailability() {
  const hint = document.getElementById('order-modal-available');
  if (!hint) return;
  const productId = document.getElementById('order-modal-product-select')?.value;
  const available = orderOriginAvailable.get(String(productId));
  const inList = draftOrderItems.find(i => i.productId === productId)?.quantity || 0;
  hint.textContent = productId && available !== undefined
    ? `Disponible en el origen: ${Math.max(0, available - inList)} u.${inList ? ` (de ${available} totales, ya agregaste ${inList})` : ''}`
    : '';
}
document.getElementById('order-modal-product-select')?.addEventListener('change', showOrderAvailability);
document.getElementById('order-modal-from-branch')?.addEventListener('change', () => loadOrderOriginStock({ focusSearch: true }));

function addOrderItemFromPicker() {
  const productSelect = document.getElementById('order-modal-product-select');
  const searchInput = document.getElementById('order-modal-product-search');
  const qtyInput = document.getElementById('order-modal-product-qty');
  let productId = productSelect?.value;

  // Si el usuario escribió y apretó Agregar/Enter sin haber confirmado el ítem resaltado, toma el resaltado
  if (!productId) {
    const highlighted = document.querySelector('#order-product-search-dropdown .select-search-item.highlighted');
    if (highlighted) productId = highlighted.dataset.id;
  }

  const quantity = parseInt(qtyInput?.value, 10) || 0;

  if (!productId) return showToast('Seleccioná un insumo para agregar.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');
  const available = orderOriginAvailable.get(String(productId)) || 0;
  const already = draftOrderItems.find(item => item.productId === productId)?.quantity || 0;
  if (already + quantity > available) {
    return showToast(`En el origen quedan ${Math.max(0, available - already)} unidades disponibles${already ? ` (ya agregaste ${already} de ${available})` : ''}.`, 'error');
  }

  const existing = draftOrderItems.find(item => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else draftOrderItems.push({ productId, productName: getProductName(productId), quantity });

  if (qtyInput) {
    qtyInput.value = '1';
    qtyInput.removeAttribute('max');
  }
  if (productSelect) productSelect.value = '';
  const hint = document.getElementById('order-modal-available');
  if (hint) hint.textContent = '';
  renderOrderModalItemsTable();

  if (searchInput) {
    searchInput.value = '';
    searchInput.focus(); // El cursor vuelve al campo de artículos y muestra los restantes listos para bajar con flechas
    renderOrderProductDropdown('');
  }
}

document.getElementById('btn-order-modal-add-item')?.addEventListener('click', addOrderItemFromPicker);

document.getElementById('order-modal-product-qty')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addOrderItemFromPicker();
  }
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
  const tbody = document.getElementById('table-order-modal-items-body');
  const count = document.getElementById('order-modal-items-count');
  const totalUnits = draftOrderItems.reduce((sum, i) => sum + i.quantity, 0);
  if (count) {
    count.textContent = draftOrderItems.length
      ? `${draftOrderItems.length} insumo${draftOrderItems.length === 1 ? '' : 's'} (${totalUnits} u.)`
      : '0 insumos';
  }
  if (!draftOrderItems.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-text">Aún no agregaste insumos a este pedido.</td></tr>`;
    return;
  }
  tbody.innerHTML = draftOrderItems.map((item, index) => {
    const maxAvail = orderOriginAvailable.get(String(item.productId)) || item.quantity;
    return `
      <tr>
        <td><strong>${escapeHtml(item.productName)}</strong> <span class="muted" style="font-size:0.76rem;">(máx. ${maxAvail})</span></td>
        <td class="col-center">
          <div style="display:inline-flex; align-items:center; gap:6px;">
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; line-height:1;" onclick="stepOrderModalItemQty(${index}, -1)" title="Restar 1">-</button>
            <span class="badge" style="min-width:34px; text-align:center;">${item.quantity}</span>
            <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px; line-height:1;" onclick="stepOrderModalItemQty(${index}, 1)" title="Sumar 1" ${item.quantity >= maxAvail ? 'disabled' : ''}>+</button>
          </div>
        </td>
        <td class="col-center">
          <button type="button" class="btn-icon btn-icon-danger" title="Quitar" onclick="removeOrderModalItem(${index})">${ICON_DELETE}</button>
        </td>
      </tr>`;
  }).join('');
}

window.stepOrderModalItemQty = (index, delta) => {
  const item = draftOrderItems[index];
  if (!item) return;
  const maxAvail = orderOriginAvailable.get(String(item.productId)) || item.quantity;
  const next = item.quantity + delta;
  if (next <= 0) {
    removeOrderModalItem(index);
    return;
  }
  if (next > maxAvail) {
    showToast(`En el origen hay como máximo ${maxAvail} unidades disponibles de ${item.productName}.`, 'error');
    return;
  }
  item.quantity = next;
  renderOrderModalItemsTable();
  showOrderAvailability();
};

window.removeOrderModalItem = (index) => {
  draftOrderItems.splice(index, 1);
  renderOrderModalItemsTable();
  showOrderAvailability();
};

document.getElementById('form-create-order-modal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromBranchId = document.getElementById('order-modal-from-branch').value;
  const toBranchId = document.getElementById('order-modal-to-branch').value;
  const notes = document.getElementById('order-modal-notes').value.trim();

  if (!fromBranchId || !toBranchId) return showToast('Seleccioná la sucursal de origen y la de destino.', 'error');
  if (fromBranchId === toBranchId) return showToast('El origen y el destino no pueden ser la misma sucursal.', 'error');
  if (!draftOrderItems.length) return showToast('Agregá al menos un insumo al pedido antes de confirmar.', 'error');

  const submitBtn = document.getElementById('order-modal-submit');
  const prevText = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = editingOrder ? 'Guardando...' : 'Enviando pedido...';
  }

  try {
    const items = draftOrderItems.map(item => ({ productId: item.productId, quantity: item.quantity }));
    if (editingOrder) {
      const res = await apiFetch(`/orders/${editingOrder.id}`, { method: 'PUT', body: JSON.stringify({ items, notes }) });
      branchAvailableCache.delete(String(fromBranchId));
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
    branchAvailableCache.delete(String(fromBranchId));
    // El servidor decide si el pedido requiere aprobación del administrador (más de 50 unidades de un producto)
    const targetStatus = res.order.status || (res.order.requiresValidation ? 'PENDIENTE_VALIDACION' : 'PENDIENTE');
    showToast(`Pedido ${res.order.code} creado${res.order.requiresValidation ? '. Requiere aprobación del administrador.' : ' y enviado.'}`, 'success');
    closeModal('modal-create-order');
    solicitanteFilters.status = targetStatus;
    solicitanteFilters.page = 1;
    document.querySelectorAll('#orders-status-tabs .order-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.status === targetStatus);
    });
    loadSolicitanteOrders();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = prevText || 'Confirmar y Enviar Pedido';
    }
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
