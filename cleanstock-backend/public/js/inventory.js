// ==========================================================================
// INGRESOS Y EGRESOS: pedidos por recibir, últimos movimientos y los modales
// de ingreso con lote, ingreso extraordinario y egreso (mermas)
// ==========================================================================

window.loadedDeliveries = [];
const respMovementFilters = { page: 1, type: 'INGRESO,INGRESO_EXTRAORDINARIO,EGRESO' };

async function loadResponsablePanel() {
  await ensureBaseData();
  if (!isSingleBranch()) loadResponsableDeliveries();
  loadRecentStockTable();
}

// Pedidos despachados que llegan a la sucursal del usuario (el admin ve todos)
async function loadResponsableDeliveries() {
  const tbody = document.getElementById('table-resp-deliveries-body');
  setTableLoading(tbody, 6, 2);
  try {
    const query = hasRole('Administrador') ? '' : `&toBranchId=${userBranchId() || 'none'}`;
    window.loadedDeliveries = hasRole('Administrador') || userBranchId()
      ? await apiFetch(`/orders?status=DESPACHADO${query}`)
      : [];
    if (!window.loadedDeliveries.length) {
      renderEmptyRow(tbody, 6, 'No hay pedidos en camino', 'Cuando un pedido hacia tu sucursal se despache, vas a poder confirmar la recepción acá.');
      return;
    }
    tbody.innerHTML = window.loadedDeliveries.map(order => `
      <tr>
        <td><span class="order-item-id">${escapeHtml(formatOrderCode(order))}</span></td>
        <td>${escapeHtml(order.FromBranch?.name || 'Central')}</td>
        <td><strong>${escapeHtml(order.ToBranch?.name || 'General')}</strong></td>
        <td><div class="order-item-details">${itemsSummaryHtml(order)}</div></td>
        <td class="cell-date">${formatDateTime(order.updatedAt)}</td>
        <td>
          <div class="btn-row">
            <button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmar recepción</button>
            <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')">Detalle</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (err) {
    renderErrorRow(tbody, 6, err.message);
  }
}

const MOVEMENT_LABELS = {
  INGRESO: ['Ingreso', 'status-entregado'],
  INGRESO_EXTRAORDINARIO: ['Ingreso extraordinario', 'status-warning'],
  EGRESO: ['Egreso', 'status-rechazado'],
  AJUSTE: ['Ajuste manual', 'status-preparacion'],
  TRANSFERENCIA_SALIDA: ['Transferencia (salida)', 'status-despachado'],
  TRANSFERENCIA_ENTRADA: ['Transferencia (entrada)', 'status-despachado'],
  CONTEO: ['Conteo físico', 'status-preparacion'],
  DISCREPANCIA: ['Discrepancia', 'status-rechazado']
};

function movementBadge(m) {
  const [label, cls] = MOVEMENT_LABELS[m.type] || [m.type, 'status-preparacion'];
  const sub = m.subtype ? ` · ${capitalize(String(m.subtype).toLowerCase().replace(/_/g, ' '))}` : '';
  return `<span class="status-badge ${cls}">${escapeHtml(label + sub)}</span>`;
}

function signedQty(q) {
  const cls = q > 0 ? 'qty-in' : q < 0 ? 'qty-out' : '';
  return `<span class="qty-signed ${cls}">${q > 0 ? '+' : ''}${q}</span>`;
}

async function loadRecentStockTable() {
  const tbody = document.getElementById('table-resp-recent-stock');
  setTableLoading(tbody, 7, 4);
  try {
    const params = new URLSearchParams({ page: respMovementFilters.page, limit: 15, type: respMovementFilters.type });
    if (!hasRole('Administrador') && userBranchId()) params.set('branchId', userBranchId());
    const data = await apiFetch(`/branches/movements?${params}`);

    if (!data.items.length) {
      renderEmptyRow(tbody, 7, 'Sin movimientos registrados', 'Los ingresos y egresos que cargues aparecerán acá.');
    } else {
      tbody.innerHTML = data.items.map(m => `
        <tr>
          <td class="cell-date">${formatDateTime(m.createdAt)}</td>
          <td><strong>${escapeHtml(m.branchName || '—')}</strong></td>
          <td><strong>${escapeHtml(m.productName || '—')}</strong></td>
          <td>${signedQty(m.quantity)}</td>
          <td>${m.lotNumber ? `<span class="badge">${escapeHtml(m.lotNumber)}</span>` : '—'}</td>
          <td>${m.expirationDate ? formatDateOnly(m.expirationDate) : '—'}</td>
          <td>
            ${movementBadge(m)}
            <div class="cell-detail">${escapeHtml([m.supplierName ? `Proveedor: ${m.supplierName}` : '', m.reason || ''].filter(Boolean).join(' — '))}</div>
            <small class="muted">${escapeHtml(getUserDisplayName(m.User))}</small>
          </td>
        </tr>`).join('');
    }
    renderPagination('resp-movements-pagination', data, 'movimientos', (page) => {
      respMovementFilters.page = page;
      loadRecentStockTable();
    });
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}

document.getElementById('resp-movements-type')?.addEventListener('change', (e) => {
  respMovementFilters.type = e.target.value;
  respMovementFilters.page = 1;
  loadRecentStockTable();
});

// Recarga los paneles afectados después de mover stock
function afterStockChange() {
  if (state.currentTab === 'panel-responsable') loadRecentStockTable();
  if (state.currentTab === 'panel-stock-view') loadBranchStockPanel();
  if (state.currentTab === 'panel-expirations') loadExpirationsPanel();
  refreshNotifications();
}

// --------------------------------------------------------------------------
// Modal: ingreso con lote y vencimiento
// --------------------------------------------------------------------------
let draftStockEntryItems = [];

async function openCreateStockEntryModal() {
  await ensureBaseData();
  const suppliers = await loadSuppliers().catch(() => []);
  fillSelect(document.getElementById('stock-modal-branch'), entryBranches(), { placeholder: 'Seleccionar sucursal destino...', placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() });
  fillSelect(document.getElementById('stock-modal-supplier'), suppliers, { placeholder: 'Sin proveedor' });
  fillSelect(document.getElementById('stock-modal-product-select'), state.products, { placeholder: 'Seleccioná insumo...' });
  draftStockEntryItems = [];
  updateLotFields(null);
  ['stock-modal-lot-number', 'stock-modal-expiration-date'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('stock-modal-product-qty').value = 1;
  renderStockModalItemsTable();
  openModal('modal-create-stock-entry');
}
document.getElementById('btn-open-stock-entry-modal')?.addEventListener('click', openCreateStockEntryModal);

// Los productos que no vencen no piden lote ni fecha: esos campos se desactivan
function updateLotFields(product) {
  const needsLot = !product || product.perishable !== false;
  ['stock-modal-lot-number', 'stock-modal-expiration-date'].forEach(id => {
    const input = document.getElementById(id);
    input.disabled = !needsLot;
    if (!needsLot) input.value = '';
  });
  document.getElementById('stock-modal-lot-number').placeholder = needsLot ? 'Ej: LOT-2026-99' : 'No vence';
  document.querySelectorAll('#modal-create-stock-entry .lot-req').forEach(el => el.classList.toggle('hidden', !needsLot));
}

// Al elegir un producto se muestran u ocultan los campos de lote
document.getElementById('stock-modal-product-select')?.addEventListener('change', (e) => {
  updateLotFields(state.products.find(p => p.id === e.target.value));
});

document.getElementById('btn-stock-modal-add-item')?.addEventListener('click', () => {
  const productId = document.getElementById('stock-modal-product-select').value;
  const quantity = parseInt(document.getElementById('stock-modal-product-qty').value, 10) || 0;
  const lotNumber = document.getElementById('stock-modal-lot-number').value.trim();
  const expirationDate = document.getElementById('stock-modal-expiration-date').value;

  if (!productId) return showToast('Seleccioná un insumo o producto.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');
  const needsLot = state.products.find(p => p.id === productId)?.perishable !== false;
  if (needsLot && !lotNumber) return showToast('Este producto tiene vencimiento: ingresá el número de lote.', 'error');
  if (needsLot && !expirationDate) return showToast('Este producto tiene vencimiento: seleccioná la fecha.', 'error');
  if (expirationDate && expirationDate < new Date().toISOString().slice(0, 10)) {
    showToast('Atención: la fecha de vencimiento ya pasó. El lote quedará marcado como vencido.', 'info');
  }

  const existing = draftStockEntryItems.find(item =>
    item.productId === productId && item.lotNumber.toLowerCase() === lotNumber.toLowerCase() && item.expirationDate === expirationDate
  );
  if (existing) {
    existing.quantity += quantity;
    showToast(`Se sumaron ${quantity} unidades al mismo lote.`, 'info');
  } else {
    draftStockEntryItems.push({ productId, productName: getProductName(productId), quantity, lotNumber, expirationDate });
  }

  document.getElementById('stock-modal-product-select').value = '';
  document.getElementById('stock-modal-product-qty').value = 1;
  ['stock-modal-lot-number', 'stock-modal-expiration-date'].forEach(id => { document.getElementById(id).value = ''; });
  updateLotFields(null);
  renderStockModalItemsTable();
});

function renderStockModalItemsTable() {
  renderDraftItems('table-stock-modal-items-body', 'stock-modal-items-count', draftStockEntryItems, 'removeStockModalItem',
    'Aún no agregaste insumos a la lista de ingreso.',
    item => `<td>${item.lotNumber ? `<span class="badge">${escapeHtml(item.lotNumber)}</span>` : '<span class="muted">No vence</span>'}</td><td>${formatDateOnly(item.expirationDate)}</td>`);
}

window.removeStockModalItem = (index) => {
  draftStockEntryItems.splice(index, 1);
  renderStockModalItemsTable();
};

// Envía los ítems de a uno y avisa cuáles fallaron (los que se guardaron se quitan de la lista)
async function submitDraftItems(items, send) {
  const failed = [];
  for (const item of [...items]) {
    try {
      await send(item);
      items.splice(items.indexOf(item), 1);
    } catch (err) {
      failed.push(`${item.productName}: ${err.message}`);
    }
  }
  return failed;
}

document.getElementById('form-create-stock-entry-modal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const branchId = document.getElementById('stock-modal-branch').value;
  const supplierId = document.getElementById('stock-modal-supplier').value || null;
  if (!branchId) return showToast('Seleccioná la sucursal destino.', 'error');
  if (!draftStockEntryItems.length) return showToast('Agregá al menos un insumo a la lista de ingreso.', 'error');

  const total = draftStockEntryItems.length;
  const failed = await submitDraftItems(draftStockEntryItems, item => apiFetch('/inventory/stock', {
    method: 'POST',
    body: JSON.stringify({ ...item, branchId, supplierId })
  }));

  if (failed.length) {
    renderStockModalItemsTable();
    showToast(`Se registraron ${total - failed.length} de ${total}. Revisá: ${failed.join(' | ')}`, 'error', 9000);
  } else {
    showToast('Ingreso de stock registrado exitosamente', 'success');
    closeModal('modal-create-stock-entry');
  }
  afterStockChange();
});

// --------------------------------------------------------------------------
// Modal: ingreso extraordinario
// --------------------------------------------------------------------------
let draftInformalEntryItems = [];

async function openCreateInformalEntryModal() {
  await ensureBaseData();
  fillSelect(document.getElementById('informal-modal-branch'), entryBranches(), { placeholder: 'Seleccionar sucursal destino...', placeholderDisabled: true, getLabel: branchLabel, value: userBranchId() });
  fillSelect(document.getElementById('informal-modal-product-select'), state.products, { placeholder: 'Seleccioná un producto...' });
  draftInformalEntryItems = [];
  document.getElementById('informal-modal-description').value = '';
  document.getElementById('informal-modal-product-qty').value = 1;
  renderInformalModalItemsTable();
  openModal('modal-create-informal-entry');
}
document.getElementById('btn-open-informal-entry-modal')?.addEventListener('click', openCreateInformalEntryModal);

document.getElementById('btn-informal-modal-add-item')?.addEventListener('click', () => {
  const productId = document.getElementById('informal-modal-product-select').value;
  const quantity = parseInt(document.getElementById('informal-modal-product-qty').value, 10) || 0;
  if (!productId) return showToast('Seleccioná un producto.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');

  const existing = draftInformalEntryItems.find(item => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else draftInformalEntryItems.push({ productId, productName: getProductName(productId), quantity });

  document.getElementById('informal-modal-product-select').value = '';
  document.getElementById('informal-modal-product-qty').value = 1;
  renderInformalModalItemsTable();
});

function renderInformalModalItemsTable() {
  renderDraftItems('table-informal-modal-items-body', 'informal-modal-items-count', draftInformalEntryItems, 'removeInformalModalItem', 'Aún no agregaste artículos a este ingreso extraordinario.');
}

window.removeInformalModalItem = (index) => {
  draftInformalEntryItems.splice(index, 1);
  renderInformalModalItemsTable();
};

document.getElementById('form-create-informal-entry-modal')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const branchId = document.getElementById('informal-modal-branch').value;
  const entryType = document.getElementById('informal-modal-entry-type').value;
  const description = document.getElementById('informal-modal-description').value.trim();
  if (!branchId || !entryType || !description) return showToast('Completá la sucursal, el tipo de ingreso y la descripción.', 'error');
  if (!draftInformalEntryItems.length) return showToast('Agregá al menos un artículo.', 'error');

  const total = draftInformalEntryItems.length;
  const failed = await submitDraftItems(draftInformalEntryItems, item => apiFetch('/inventory/informal-entry', {
    method: 'POST',
    body: JSON.stringify({ productId: item.productId, quantity: item.quantity, branchId, entryType, description })
  }));

  if (failed.length) {
    renderInformalModalItemsTable();
    showToast(`Se registraron ${total - failed.length} de ${total}. Revisá: ${failed.join(' | ')}`, 'error', 9000);
  } else {
    showToast('Ingreso extraordinario registrado correctamente', 'success');
    closeModal('modal-create-informal-entry');
  }
  afterStockChange();
});

// --------------------------------------------------------------------------
// Modal: egreso (venta, consumo, rotura, vencido)
// --------------------------------------------------------------------------
let draftExitItems = [];

// prefill: { branchId, productId, quantity, exitType, description } (ej: desde Vencimientos)
async function openExitModal(prefill = {}) {
  await ensureBaseData();
  const branches = operableBranches();
  if (!branches.length) return showToast('No tenés una sucursal asignada para registrar egresos.', 'error');

  fillSelect(document.getElementById('exit-branch'), branches, { getLabel: branchLabel, value: prefill.branchId || userBranchId() });
  fillSelect(document.getElementById('exit-product-select'), state.products, { placeholder: 'Seleccioná un producto...' });
  document.getElementById('exit-type').value = prefill.exitType || 'VENTA';
  document.getElementById('exit-description').value = prefill.description || '';
  document.getElementById('exit-product-qty').value = 1;
  document.getElementById('exit-available').textContent = '';
  draftExitItems = [];
  if (prefill.productId) {
    draftExitItems.push({ productId: prefill.productId, productName: getProductName(prefill.productId), quantity: prefill.quantity || 1 });
  }
  renderExitItemsTable();
  openModal('modal-exit');
}
document.getElementById('btn-open-exit-modal')?.addEventListener('click', () => openExitModal());

async function showExitAvailability() {
  const hint = document.getElementById('exit-available');
  const branchId = document.getElementById('exit-branch').value;
  const productId = document.getElementById('exit-product-select').value;
  hint.textContent = '';
  if (!branchId || !productId) return;
  try {
    const { stockItems } = await apiFetch(`/branches/${branchId}/stock`);
    const item = stockItems.find(s => String(s.productId) === String(productId));
    hint.textContent = item
      ? `Stock: ${item.quantity} u. — reservado: ${item.reservedQuantity} — disponible para egreso: ${item.availableQuantity}`
      : 'Este producto no tiene stock en la sucursal.';
  } catch (err) {
    // sin acceso a esa sucursal
  }
}
document.getElementById('exit-product-select')?.addEventListener('change', showExitAvailability);
document.getElementById('exit-branch')?.addEventListener('change', showExitAvailability);

document.getElementById('btn-exit-add-item')?.addEventListener('click', () => {
  const productId = document.getElementById('exit-product-select').value;
  const quantity = parseInt(document.getElementById('exit-product-qty').value, 10) || 0;
  if (!productId) return showToast('Seleccioná un producto.', 'error');
  if (quantity <= 0) return showToast('La cantidad debe ser mayor a 0.', 'error');

  const existing = draftExitItems.find(item => item.productId === productId);
  if (existing) existing.quantity += quantity;
  else draftExitItems.push({ productId, productName: getProductName(productId), quantity });

  document.getElementById('exit-product-select').value = '';
  document.getElementById('exit-product-qty').value = 1;
  document.getElementById('exit-available').textContent = '';
  renderExitItemsTable();
});

function renderExitItemsTable() {
  renderDraftItems('table-exit-items-body', 'exit-items-count', draftExitItems, 'removeExitItem', 'Aún no agregaste artículos.');
}

window.removeExitItem = (index) => {
  draftExitItems.splice(index, 1);
  renderExitItemsTable();
};

document.getElementById('form-exit')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const branchId = document.getElementById('exit-branch').value;
  const exitType = document.getElementById('exit-type').value;
  const description = document.getElementById('exit-description').value.trim();
  if (exitType === 'OTRO' && !description) return showToast('Indicá el motivo del egreso.', 'error');
  if (!draftExitItems.length) return showToast('Agregá al menos un artículo.', 'error');

  const ok = await confirmDialog({
    title: 'Confirmar egreso',
    html: `<p>Se descontarán del stock de <strong>${escapeHtml(getBranchName(branchId))}</strong>:</p>
      <ul class="confirm-list">${draftExitItems.map(i => `<li>${escapeHtml(i.productName)}: <strong>${i.quantity}</strong> u.</li>`).join('')}</ul>`,
    confirmText: 'Registrar egreso',
    danger: true
  });
  if (!ok) return;

  const total = draftExitItems.length;
  const failed = await submitDraftItems(draftExitItems, item => apiFetch('/inventory/exit', {
    method: 'POST',
    body: JSON.stringify({ productId: item.productId, quantity: item.quantity, branchId, exitType, description })
  }));

  if (failed.length) {
    renderExitItemsTable();
    showToast(`Se registraron ${total - failed.length} de ${total}. Revisá: ${failed.join(' | ')}`, 'error', 9000);
  } else {
    showToast('Egreso registrado correctamente', 'success');
    closeModal('modal-exit');
  }
  afterStockChange();
});
