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

// Avisos ya vistos: se guardan por usuario para que el número de la campanita
// desaparezca al abrirla y solo vuelva a aparecer si llega algo nuevo.
let currentNotificationKeys = [];

// Un aviso se identifica por el producto y el lugar (lo que va antes de ":"), no por la
// cantidad: si solo cambian las unidades no se vuelve a contar como nuevo.
// Sí cuenta como nuevo si empeora (por ejemplo, de "Stock bajo" a "Sin stock").
const notificationKey = (item) => `${item.kind}|${item.severity}|${item.text.split(':')[0]}`;
const seenStorageKey = () => `cleanstock_notif_seen_${state.user?.id || ''}`;

function getSeenNotifications() {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenStorageKey()) || '[]'));
  } catch (err) {
    return new Set();
  }
}

function markNotificationsAsSeen() {
  try {
    localStorage.setItem(seenStorageKey(), JSON.stringify(currentNotificationKeys));
  } catch (err) { /* sin almacenamiento */ }
  updateBellCount(0);
}

function updateBellCount(unseen) {
  const count = document.getElementById('notif-count');
  count.textContent = unseen > 99 ? '99+' : unseen;
  count.classList.toggle('hidden', !unseen);
  bellBtn.classList.toggle('has-notifications', unseen > 0);
}

async function refreshNotifications() {
  if (!state.token) return;
  try {
    const summary = await apiFetch('/alerts/summary');
    const seen = getSeenNotifications();
    currentNotificationKeys = summary.items.map(notificationKey);
    const isOpen = !bellDropdown.classList.contains('hidden');
    if (isOpen) markNotificationsAsSeen();
    else updateBellCount(currentNotificationKeys.filter(k => !seen.has(k)).length);

    const list = document.getElementById('notif-list');
    if (!summary.items.length) {
      list.innerHTML = '<p class="empty-text">Sin novedades. Todo en orden.</p>';
      return;
    }
    list.innerHTML = summary.items.map(item => `
      <button type="button" class="notif-item notif-${escapeHtml(item.severity)} ${seen.has(notificationKey(item)) ? '' : 'notif-new'}" data-kind="${escapeHtml(item.kind)}">
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
  // Al abrir la campanita el número desaparece; la recarga marca la lista como vista
  // (y antes de eso señala con "Nuevo" lo que no se había visto)
  if (!bellDropdown.classList.contains('hidden')) {
    updateBellCount(0);
    refreshNotifications();
  }
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
