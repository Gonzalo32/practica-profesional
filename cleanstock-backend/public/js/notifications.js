// ==========================================================================
// CAMPANITA DE NOTIFICACIONES
// Consulta /alerts/summary cada minuto: stock bajo, vencimientos, pedidos
// para aprobar, despachar o recibir (según el rol).
// ==========================================================================

let notificationTimer = null;

const bellBtn = document.getElementById('btn-notifications');
const bellDropdown = document.getElementById('notif-dropdown');

function notificationTarget(kind) {
  const role = state.user?.role;
  if (kind === 'expiration') return { panel: 'panel-expirations' };
  if (kind === 'approval') return { panel: 'panel-admin', sub: 'admin-approvals' };
  if (kind === 'dispatch') return { panel: 'panel-despachante' };
  if (kind === 'receive') return { panel: role === 'Solicitante' ? 'panel-solicitante' : 'panel-responsable' };
  if (kind === 'stock') return role === 'Administrador' ? { panel: 'panel-admin', sub: 'admin-alerts' } : { panel: 'panel-stock-view' };
  return null;
}

async function refreshNotifications() {
  if (!state.token) return;
  try {
    const summary = await apiFetch('/alerts/summary');
    const count = document.getElementById('notif-count');
    count.textContent = summary.total > 99 ? '99+' : summary.total;
    count.classList.toggle('hidden', !summary.total);
    bellBtn.classList.toggle('has-notifications', summary.total > 0);

    const list = document.getElementById('notif-list');
    if (!summary.items.length) {
      list.innerHTML = '<p class="empty-text">Sin novedades. Todo en orden.</p>';
      return;
    }
    list.innerHTML = summary.items.map(item => `
      <button type="button" class="notif-item notif-${escapeHtml(item.severity)}" data-kind="${escapeHtml(item.kind)}">
        <span class="notif-dot"></span>
        <span class="notif-body">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.text)}</span>
        </span>
      </button>
    `).join('');
  } catch (err) {
    console.error('Error actualizando notificaciones:', err.message);
  }
}

function startNotificationPolling() {
  stopNotificationPolling();
  refreshNotifications();
  notificationTimer = setInterval(refreshNotifications, 60000);
}

function stopNotificationPolling() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
}

bellBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  bellDropdown.classList.toggle('hidden');
  if (!bellDropdown.classList.contains('hidden')) refreshNotifications();
});

document.getElementById('btn-notif-refresh')?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshNotifications();
});

document.addEventListener('click', (e) => {
  const item = e.target.closest('.notif-item');
  if (item) {
    const target = notificationTarget(item.dataset.kind);
    bellDropdown.classList.add('hidden');
    if (target) {
      goToPanel(target.panel);
      if (target.sub) document.querySelector(`.btn-tab[data-sub="${target.sub}"]`)?.click();
    }
    return;
  }
  if (bellDropdown && !bellDropdown.contains(e.target)) bellDropdown.classList.add('hidden');
});
