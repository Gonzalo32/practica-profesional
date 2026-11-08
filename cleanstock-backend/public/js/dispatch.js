window.loadedDispatchOrders = [];
let dispatchView = 'board';

const NEXT_STATUS = { PENDIENTE: 'EN_PREPARACION', EN_PREPARACION: 'DESPACHADO' };
const NEXT_ACTION_LABEL = { PENDIENTE: 'Iniciar preparación', EN_PREPARACION: 'Marcar despachado' };

async function loadDespachantePanel() {
  if (!window.loadedDispatchOrders.length) {
    document.querySelectorAll('#dispatch-board .kanban-cards').forEach(col => {
      col.innerHTML = '<div class="kanban-card skeleton-card"><span class="skeleton"></span><span class="skeleton"></span></div>';
    });
  }
  try {
    const orders = await apiFetch('/orders');
    window.loadedDispatchOrders = orders.filter(o => !['PENDIENTE_VALIDACION', 'RECHAZADO', 'CANCELADO'].includes(o.status));
    renderDispatchBoard();
    renderDispatchList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function dispatchCardHtml(order) {
  const next = NEXT_STATUS[order.status];
  const items = (order.OrderItems || []).map(i => `<li>${escapeHtml(i.Product?.name || 'Insumo')} <strong>x${i.quantity}</strong></li>`).join('');
  return `
    <article class="kanban-card" ${next ? `draggable="true" data-order-id="${order.id}" data-status="${order.status}"` : ''}>
      <header class="kanban-card-header">
        <span class="order-item-id">${escapeHtml(formatOrderCode(order))}</span>
        <span class="cell-date">${formatDateTime(order.createdAt)}</span>
      </header>
      <div class="kanban-route">
        <span>${escapeHtml(order.FromBranch?.name || 'Central')}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        <strong>${escapeHtml(order.ToBranch?.name || 'General')}</strong>
      </div>
      <ul class="kanban-items">${items}</ul>
      <div class="kanban-meta">Pidió: ${escapeHtml(getUserDisplayName(order.Solicitante))}</div>
      ${order.notes ? `<div class="kanban-notes">${escapeHtml(order.notes)}</div>` : ''}
      <footer class="kanban-actions">
        ${next ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${order.id}', '${next}')">${NEXT_ACTION_LABEL[order.status]}</button>` : ''}
        ${canConfirmReception(order) ? `<button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmar recepción</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')">Detalle</button>
      </footer>
    </article>`;
}

function renderDispatchBoard() {
  const byStatus = { PENDIENTE: [], EN_PREPARACION: [], DESPACHADO: [], ENTREGADO: [] };
  window.loadedDispatchOrders.forEach(o => byStatus[o.status]?.push(o));
  byStatus.PENDIENTE.reverse();
  byStatus.EN_PREPARACION.reverse();
  byStatus.ENTREGADO = byStatus.ENTREGADO.slice(0, 10);

  Object.entries(byStatus).forEach(([status, list]) => {
    const col = document.querySelector(`[data-cards="${status}"]`);
    document.querySelector(`[data-count="${status}"]`).textContent = list.length;
    col.innerHTML = list.length ? list.map(dispatchCardHtml).join('') : '<p class="kanban-empty">Sin pedidos</p>';
  });
}

function renderDispatchList() {
  const tbody = document.getElementById('table-despachante-orders-body');
  const selectedStatus = document.getElementById('despachante-filter-status')?.value || '';
  const list = window.loadedDispatchOrders.filter(o => !selectedStatus || o.status === selectedStatus);

  if (!list.length) {
    renderEmptyRow(tbody, 7, 'No hay pedidos en este estado');
    return;
  }
  tbody.innerHTML = list.map(order => {
    const next = NEXT_STATUS[order.status];
    return `
      <tr>
        <td><span class="order-item-id">${escapeHtml(formatOrderCode(order))}</span></td>
        <td><strong>${escapeHtml(getUserDisplayName(order.Solicitante))}</strong><br><small class="muted">${escapeHtml(order.Solicitante?.email || '')}</small></td>
        <td><strong>${escapeHtml(order.ToBranch?.name || 'Sede Central')}</strong></td>
        <td class="cell-date">${formatDateTime(order.createdAt)}</td>
        <td>${statusBadge(order.status)}</td>
        <td><div class="order-item-details">${itemsSummaryHtml(order)}</div></td>
        <td>
          <div class="btn-row">
            ${next ? `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${order.id}', '${next}')">${NEXT_ACTION_LABEL[order.status]}</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')">Detalle</button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

document.getElementById('despachante-filter-status')?.addEventListener('change', renderDispatchList);

document.querySelectorAll('[data-dispatch-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    dispatchView = btn.dataset.dispatchView;
    document.querySelectorAll('[data-dispatch-view]').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('dispatch-board').classList.toggle('hidden', dispatchView !== 'board');
    document.getElementById('dispatch-list').classList.toggle('hidden', dispatchView !== 'list');
  });
});

window.updateOrderStatus = async (orderId, newStatus) => {
  try {
    await apiFetch(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    showToast(`Pedido actualizado a "${statusLabel(newStatus)}"`, 'success');
    if (state.currentTab === 'panel-despachante') loadDespachantePanel();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
    if (state.currentTab === 'panel-despachante') loadDespachantePanel();
  }
};

let draggedCard = null;

document.addEventListener('dragstart', (e) => {
  const card = e.target.closest?.('.kanban-card[draggable="true"]');
  if (!card) return;
  draggedCard = card;
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', card.dataset.orderId);
  const target = NEXT_STATUS[card.dataset.status];
  document.querySelector(`.kanban-col[data-status="${target}"]`)?.classList.add('drop-allowed');
});

document.addEventListener('dragend', () => {
  draggedCard?.classList.remove('dragging');
  draggedCard = null;
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.remove('drop-allowed', 'drop-hover'));
});

document.querySelectorAll('.kanban-col').forEach(col => {
  col.addEventListener('dragover', (e) => {
    if (!draggedCard || NEXT_STATUS[draggedCard.dataset.status] !== col.dataset.status) return;
    e.preventDefault();
    col.classList.add('drop-hover');
  });
  col.addEventListener('dragleave', () => col.classList.remove('drop-hover'));
  col.addEventListener('drop', (e) => {
    if (!draggedCard || NEXT_STATUS[draggedCard.dataset.status] !== col.dataset.status) return;
    e.preventDefault();
    const orderId = draggedCard.dataset.orderId;
    col.querySelector('.kanban-cards').prepend(draggedCard);
    updateOrderStatus(orderId, col.dataset.status);
  });
});
