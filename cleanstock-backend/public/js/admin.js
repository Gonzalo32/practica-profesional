// ==========================================================================
// PANEL ADMINISTRADOR: KPIs, gráficos, usuarios, aprobaciones, alertas y auditoría
// ==========================================================================

async function loadAdminPanel() {
  loadAdminStats();
  loadDashboardCharts();
  await loadAdminUsers();
  // Recarga la sub-pestaña que esté abierta
  const active = document.querySelector('#panel-admin .btn-tab.active')?.dataset.sub;
  if (active && subTabLoaders[`subpanel-${active}`]) subTabLoaders[`subpanel-${active}`]();
}

async function loadAdminStats() {
  try {
    const [users, kpis] = await Promise.all([apiFetch('/users'), apiFetch('/alerts/kpis')]);

    document.getElementById('admin-stat-users').textContent = users.filter(u => u.isActive).length;
    document.getElementById('admin-stat-products').textContent = state.products.length;
    document.getElementById('admin-stat-orders').textContent = kpis.totalOrders;
    document.getElementById('admin-stat-alerts').textContent = kpis.activeAlerts;
    document.getElementById('admin-stat-critical').textContent = `${kpis.criticalAlerts} críticas`;
    document.getElementById('admin-stat-transit').textContent = kpis.inTransitOrders;
    document.getElementById('admin-stat-approvals').textContent = kpis.pendingApprovals;
    document.getElementById('admin-stat-today').textContent = kpis.todayStockEntries;
    document.getElementById('admin-stat-expiring').textContent = kpis.expiringLots;
    document.getElementById('admin-stat-expired').textContent = `${kpis.expiredLots} vencidos`;

    document.querySelector('.stat-card-alert')?.classList.toggle('has-alerts', kpis.activeAlerts > 0);
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('card-admin-alerts')?.addEventListener('click', () => {
  const tab = document.querySelector('#panel-admin .btn-tab[data-sub="admin-alerts"]');
  if (tab) {
    tab.click();
    document.getElementById('subpanel-admin-alerts')?.scrollIntoView({ behavior: 'smooth' });
  }
});

document.getElementById('card-admin-approvals')?.addEventListener('click', () => {
  const tab = document.querySelector('#panel-admin .btn-tab[data-sub="admin-approvals"]');
  if (tab) {
    tab.click();
    document.getElementById('subpanel-admin-approvals')?.scrollIntoView({ behavior: 'smooth' });
  }
});

// --------------------------------------------------------------------------
// Gráficos (Chart.js)
// --------------------------------------------------------------------------
const charts = {};
let lastDashboardData = null;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function chartTheme() {
  return {
    text: cssVar('--text-muted'),
    grid: cssVar('--chart-grid'),
    primary: cssVar('--color-primary'),
    success: cssVar('--color-success'),
    danger: cssVar('--color-danger'),
    warning: cssVar('--color-warning'),
    purple: cssVar('--color-purple')
  };
}

function renderChart(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new window.Chart(canvas, config);
}

function baseChartOptions(t, extra = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: t.text, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: t.text }, grid: { color: t.grid } },
      y: { ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, beginAtZero: true }
    },
    ...extra
  };
}

function drawDashboardCharts(data) {
  if (!data) return;
  if (!window.Chart) {
    // Chart.js se carga con defer: si todavía no llegó, se reintenta
    setTimeout(() => drawDashboardCharts(data), 300);
    return;
  }
  const t = chartTheme();

  renderChart('chart-stock-branch', {
    type: 'bar',
    data: {
      labels: data.stockByBranch.map(b => b.branchName),
      datasets: [{ label: 'Unidades', data: data.stockByBranch.map(b => b.totalUnits), backgroundColor: t.primary, borderRadius: 6 }]
    },
    options: baseChartOptions(t, {
      plugins: {
        legend: { display: false }
      }
    })
  });

  renderChart('chart-shortages', {
    type: 'bar',
    data: {
      // Dos renglones (producto y sucursal) para que los nombres largos no se corten
      labels: data.topShortages.length ? data.topShortages.map(s => [s.productName, s.branchName]) : ['Sin faltantes'],
      datasets: [{ label: 'Unidades faltantes para el mínimo', data: data.topShortages.map(s => s.deficit), backgroundColor: t.danger, borderRadius: 6 }]
    },
    options: baseChartOptions(t, {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: t.text, precision: 0 }, grid: { color: t.grid }, beginAtZero: true },
        y: { ticks: { color: t.text, autoSkip: false, font: { size: 11 } }, grid: { display: false } }
      }
    })
  });

  // Esperando validación, pendiente, en preparación, despachado, entregado, rechazado
  const statusColors = [t.text, t.warning, t.primary, t.purple, t.success, t.danger];
  renderChart('chart-orders-status', {
    type: 'doughnut',
    data: {
      labels: data.ordersByStatus.map(o => statusLabel(o.status)),
      datasets: [{ data: data.ordersByStatus.map(o => o.count), backgroundColor: statusColors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'right', labels: { color: t.text, boxWidth: 12 } } }
    }
  });

  renderChart('chart-movements', {
    type: 'line',
    data: {
      labels: data.movementsLast30.map(m => m.date.slice(8, 10) + '/' + m.date.slice(5, 7)),
      datasets: [
        { label: 'Entradas', data: data.movementsLast30.map(m => m.entradas), borderColor: t.success, backgroundColor: t.success, tension: 0.3, pointRadius: 2 },
        { label: 'Salidas', data: data.movementsLast30.map(m => m.salidas), borderColor: t.danger, backgroundColor: t.danger, tension: 0.3, pointRadius: 2 }
      ]
    },
    options: baseChartOptions(t, { interaction: { mode: 'index', intersect: false } })
  });
}

async function loadDashboardCharts() {
  try {
    lastDashboardData = await apiFetch('/reports/dashboard');
    drawDashboardCharts(lastDashboardData);
  } catch (err) {
    console.error('Error cargando gráficos:', err.message);
  }
}

// Al cambiar de tema se redibujan con los colores nuevos
document.addEventListener('theme:changed', () => {
  if (state.currentTab === 'panel-admin') drawDashboardCharts(lastDashboardData);
});

// --------------------------------------------------------------------------
// Usuarios
// --------------------------------------------------------------------------
let loadedUsersList = [];
const userFilters = { search: '', role: '', branch: '', page: 1 };
const USERS_PER_PAGE = 8;

async function loadAdminUsers() {
  const tbody = document.getElementById('table-users-body');
  if (!loadedUsersList.length) setTableLoading(tbody, 8);
  try {
    const allUsers = await apiFetch('/users');
    loadedUsersList = allUsers.filter(u => u.isActive);
    fillSelect(document.getElementById('user-filter-branch'), state.branches, { placeholder: 'Todas las Sucursales' });
    renderFilteredUsers();
  } catch (err) {
    renderErrorRow(tbody, 8, err.message);
  }
}

document.getElementById('user-search-input')?.addEventListener('input', debounce((e) => {
  userFilters.search = e.target.value.toLowerCase().trim();
  userFilters.page = 1;
  renderFilteredUsers();
}, 200));
document.getElementById('user-filter-role')?.addEventListener('change', (e) => {
  userFilters.role = e.target.value;
  userFilters.page = 1;
  renderFilteredUsers();
});
document.getElementById('user-filter-branch')?.addEventListener('change', (e) => {
  userFilters.branch = e.target.value;
  userFilters.page = 1;
  renderFilteredUsers();
});

function renderFilteredUsers() {
  const tbody = document.getElementById('table-users-body');

  const filtered = loadedUsersList.filter(user => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
    const emailStr = (user.email || user.username || '').toLowerCase();
    const docStr = (user.document || user.cuil || '').toLowerCase();
    const matchesSearch = !userFilters.search || fullName.includes(userFilters.search) || emailStr.includes(userFilters.search) || docStr.includes(userFilters.search);
    const matchesRole = !userFilters.role || user.role === userFilters.role;
    const matchesBranch = !userFilters.branch || String(user.physicalSpaceId) === String(userFilters.branch);
    return matchesSearch && matchesRole && matchesBranch;
  });

  const pageData = paginate(filtered, userFilters.page, USERS_PER_PAGE);
  userFilters.page = pageData.page;

  if (!pageData.total) {
    renderEmptyRow(tbody, 8, 'No se encontraron usuarios', 'No hay usuarios activos que coincidan con la búsqueda o los filtros.');
  } else {
    tbody.innerHTML = pageData.items.map(user => {
      const branch = user.EspacioFisico?.name || (user.physicalSpaceId ? getBranchName(user.physicalSpaceId) : null);
      const extra = user.role === 'Proveedor' && user.Supplier ? `<br><small class="muted">${escapeHtml(user.Supplier.name)}</small>` : '';
      return `
        <tr>
          <td><strong>${escapeHtml(user.firstName || 'Sin nombre')}</strong></td>
          <td><strong>${escapeHtml(user.lastName || 'Sin apellido')}</strong></td>
          <td>${escapeHtml(user.email || user.username || 'Sin email')}</td>
          <td>${escapeHtml(user.phone || 'Sin registrar')}</td>
          <td>${branch ? escapeHtml(branch) : '<span class="muted">Sin asignar</span>'}</td>
          <td>${escapeHtml(user.document || user.cuil || 'Sin registrar')}</td>
          <td><span class="badge ${user.role === 'Administrador' ? 'badge-admin' : 'badge-solicita'}">${escapeHtml(user.role)}</span>${extra}</td>
          <td>
            <div class="action-btn-group">
              <button class="btn-icon" title="Ver Detalle" onclick="openViewUserModal('${user.id}')">${ICON_VIEW}</button>
              <button class="btn-icon" title="Editar Usuario" onclick="openEditUserModal('${user.id}')">${ICON_EDIT}</button>
              <button class="btn-icon btn-icon-danger" title="Dar de baja" onclick="deactivateUser('${user.id}')">${ICON_DELETE}</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  }

  renderPagination('users-pagination', pageData, 'usuarios', (page) => {
    userFilters.page = page;
    renderFilteredUsers();
  });
}

window.openViewUserModal = (userId) => {
  const user = loadedUsersList.find(u => String(u.id) === String(userId));
  if (!user) return;
  const field = (label, value) => `<div><strong>${label}:</strong> ${escapeHtml(value || '-')}</div>`;
  document.getElementById('view-user-details-content').innerHTML = [
    field('Nombre', user.firstName),
    field('Apellido', user.lastName),
    field('Correo', user.email || user.username),
    field('Teléfono', user.phone),
    field('DNI / CUIL / Doc', user.document || user.cuil),
    field('Fecha Nacimiento', user.birthDate),
    field('Dirección', user.address),
    field('Código Postal', user.zipCode),
    field('Rol', user.role),
    field('Sucursal', user.EspacioFisico?.name || (user.physicalSpaceId ? getBranchName(user.physicalSpaceId) : 'Sin asignar')),
    ...(user.role === 'Proveedor' ? [field('Empresa proveedora', user.Supplier?.name)] : [])
  ].join('');
  openModal('modal-view-user');
};

// Muestra el selector de empresa solo para el rol Proveedor
function setupSupplierRoleToggle(roleSelectId, groupId, supplierSelectId) {
  const roleSelect = document.getElementById(roleSelectId);
  const update = () => {
    const isSupplier = roleSelect.value === 'Proveedor';
    document.getElementById(groupId).classList.toggle('hidden', !isSupplier);
    document.getElementById(supplierSelectId).required = isSupplier;
  };
  roleSelect.addEventListener('change', update);
  return update;
}

function setupBranchRoleToggle(roleSelectId, spaceSelectId, reqId) {
  const roleSelect = document.getElementById(roleSelectId);
  const spaceSelect = document.getElementById(spaceSelectId);
  const reqEl = document.getElementById(reqId);
  const update = () => {
    const requiresBranch = roleSelect.value !== 'Administrador' && roleSelect.value !== 'Proveedor';
    if (spaceSelect) spaceSelect.required = requiresBranch;
    if (reqEl) reqEl.classList.toggle('hidden', !requiresBranch);
  };
  roleSelect?.addEventListener('change', update);
  return update;
}

const updateNewUserSupplierField = setupSupplierRoleToggle('new-user-role', 'new-user-supplier-group', 'new-user-supplier');
const updateEditUserSupplierField = setupSupplierRoleToggle('edit-user-role', 'edit-user-supplier-group', 'edit-user-supplier');
const updateNewUserBranchField = setupBranchRoleToggle('new-user-role', 'new-user-space', 'new-user-space-req');
const updateEditUserBranchField = setupBranchRoleToggle('edit-user-role', 'edit-user-space', 'edit-user-space-req');

async function prepareUserFormSelects(prefix, user = null) {
  const suppliers = await apiFetch('/suppliers');
  fillSelect(document.getElementById(`${prefix}-supplier`), suppliers, { placeholder: 'Seleccionar empresa...', value: user?.supplierId });
  fillSelect(document.getElementById(`${prefix}-space`), state.branches, { placeholder: 'Seleccionar Sucursal...', value: user?.physicalSpaceId, getLabel: branchLabel });
}

document.getElementById('btn-open-create-user-modal')?.addEventListener('click', async () => {
  document.getElementById('form-create-user').reset();
  await prepareUserFormSelects('new-user');
  updateNewUserSupplierField();
  updateNewUserBranchField();
  openModal('modal-create-user');
});

window.openEditUserModal = async (userId) => {
  const user = loadedUsersList.find(u => String(u.id) === String(userId));
  if (!user) return;
  const form = document.getElementById('form-edit-user');
  form.reset();
  await prepareUserFormSelects('edit-user', user);

  document.getElementById('edit-user-id').value = user.id;
  document.getElementById('edit-user-email').value = user.email || user.username || '';
  document.getElementById('edit-user-firstname').value = user.firstName || '';
  document.getElementById('edit-user-lastname').value = user.lastName || '';
  document.getElementById('edit-user-document').value = user.document || user.cuil || '';
  document.getElementById('edit-user-birthdate').value = user.birthDate || '';
  document.getElementById('edit-user-phone').value = user.phone || '';
  document.getElementById('edit-user-address').value = user.address || '';
  document.getElementById('edit-user-zipcode').value = user.zipCode || '';
  document.getElementById('edit-user-role').value = user.role;
  updateEditUserSupplierField();
  updateEditUserBranchField();
  openModal('modal-edit-user');
};

function readUserForm(prefix) {
  const val = (id) => document.getElementById(`${prefix}-${id}`).value.trim();
  const email = val('email');
  const documentStr = val('document');
  const role = val('role');
  return {
    username: email,
    email,
    firstName: val('firstname'),
    lastName: val('lastname'),
    document: documentStr,
    cuil: documentStr,
    birthDate: val('birthdate'),
    phone: val('phone'),
    address: val('address'),
    zipCode: val('zipcode'),
    role,
    physicalSpaceId: val('space') || null,
    supplierId: role === 'Proveedor' ? (val('supplier') || null) : null
  };
}

document.getElementById('form-create-user')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = { ...readUserForm('new-user'), password: document.getElementById('new-user-password').value };
  if (data.role !== 'Administrador' && data.role !== 'Proveedor' && !data.physicalSpaceId) {
    showToast('Los usuarios que no sean Administrador o Proveedor deben tener una sucursal asignada.', 'error');
    return;
  }
  try {
    await apiFetch('/users', { method: 'POST', body: JSON.stringify(data) });
    showToast('Usuario registrado exitosamente', 'success');
    closeModal('modal-create-user');
    loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('form-edit-user')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('edit-user-id').value;
  const data = readUserForm('edit-user');
  const password = document.getElementById('edit-user-password').value;
  if (password) data.password = password;
  if (data.role !== 'Administrador' && data.role !== 'Proveedor' && !data.physicalSpaceId) {
    showToast('Los usuarios que no sean Administrador o Proveedor deben tener una sucursal asignada.', 'error');
    return;
  }
  try {
    await apiFetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    showToast('Usuario actualizado exitosamente', 'success');
    closeModal('modal-edit-user');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.deactivateUser = async (userId) => {
  const user = loadedUsersList.find(u => String(u.id) === String(userId));
  const ok = await confirmDialog({
    title: 'Dar de baja usuario',
    message: `¿Seguro que querés dar de baja a ${getUserDisplayName(user)}? No va a poder iniciar sesión, pero su historial se conserva.`,
    confirmText: 'Dar de baja',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
    showToast('Usuario dado de baja', 'success');
    loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Aprobación de pedidos (T4.3)
// --------------------------------------------------------------------------
let activeApprovalOrderId = null;

async function loadAdminApprovals() {
  const tbody = document.getElementById('table-admin-approvals-body');
  setTableLoading(tbody, 5, 2);
  try {
    const orders = await apiFetch('/orders?status=PENDIENTE_VALIDACION');
    if (!orders.length) {
      renderEmptyRow(tbody, 5, 'No hay pedidos pendientes de validación');
      return;
    }
    tbody.innerHTML = orders.map(order => {
      const itemsText = (order.OrderItems || []).map(i => `${escapeHtml(i.Product?.name || 'Insumo')} (x${i.quantity})`).join(', ');
      return `
        <tr>
          <td><span class="order-item-id">${escapeHtml(formatOrderCode(order))}</span></td>
          <td><strong>${escapeHtml(getUserDisplayName(order.Solicitante))}</strong></td>
          <td>${formatDateTime(order.createdAt)}</td>
          <td><div class="order-item-details">${itemsText || 'Sin artículos'}</div></td>
          <td>
            <div class="btn-row">
              <button class="btn btn-primary btn-sm" onclick="approveOrder('${order.id}')">Aprobar</button>
              <button class="btn btn-danger-soft btn-sm" onclick="rejectOrder('${order.id}')">Rechazar</button>
            </div>
          </td>
        </tr>`;
    }).join('');
  } catch (err) {
    renderErrorRow(tbody, 5, err.message);
  }
}
onSubTab('subpanel-admin-approvals', loadAdminApprovals);

// Aprobar un pedido grande: un clic y una confirmación (sin token)
window.approveOrder = async (orderId) => {
  const ok = await confirmDialog({
    title: 'Aprobar pedido',
    message: 'El pedido pasa a Pendiente y queda listo para que el despachante lo prepare. El stock ya está reservado.',
    confirmText: 'Aprobar pedido'
  });
  if (!ok) return;
  try {
    await apiFetch(`/orders/${orderId}/approve`, { method: 'POST', body: JSON.stringify({}) });
    showToast('Pedido aprobado y enviado al Despachante.', 'success');
    loadAdminApprovals();
    loadAdminStats();
    loadDashboardCharts();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.rejectOrder = async (orderId) => {
  const ok = await confirmDialog({
    title: 'Rechazar pedido',
    message: 'El pedido pasará a RECHAZADO y se liberará el stock que tenía reservado en la sucursal de origen.',
    confirmText: 'Rechazar pedido',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/orders/${orderId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'RECHAZADO' }) });
    showToast('Pedido rechazado y reserva liberada', 'success');
    loadAdminApprovals();
    loadAdminStats();
    loadDashboardCharts();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// --------------------------------------------------------------------------
// Alertas de stock bajo o crítico
// --------------------------------------------------------------------------
let loadedAlerts = [];

async function loadAlerts() {
  const tbody = document.getElementById('table-alerts-body');
  setTableLoading(tbody, 8, 3);
  try {
    loadedAlerts = await apiFetch('/alerts');
    if (!loadedAlerts.length) {
      renderEmptyRow(tbody, 8, 'No hay alertas de stock', 'Todos los niveles de stock están por encima del mínimo.');
      return;
    }
    tbody.innerHTML = loadedAlerts.map(a => {
      const isCritical = a.severity === 'CRITICO';
      const cls = isCritical ? 'stock-critical' : 'stock-low';
      return `
        <tr>
          <td><strong>${escapeHtml(a.branchName)}</strong></td>
          <td><strong>${escapeHtml(a.productName)}</strong></td>
          <td><span class="badge">${escapeHtml(a.categoryName || '—')}</span></td>
          <td><span class="stock-qty ${cls}">${a.currentQuantity}</span></td>
          <td><span class="text-warning strong">${a.reservedQuantity || 0}</span></td>
          <td><span class="stock-qty ${cls}">${a.availableQuantity}</span></td>
          <td><span class="muted">${a.minimumStock}</span></td>
          <td>${isCritical ? '<span class="status-badge status-rechazado">Crítico (sin stock)</span>' : '<span class="status-badge status-warning">Stock bajo</span>'}</td>
        </tr>`;
    }).join('');
  } catch (err) {
    renderErrorRow(tbody, 8, err.message);
  }
}
onSubTab('subpanel-admin-alerts', loadAlerts);
document.getElementById('btn-refresh-alerts')?.addEventListener('click', loadAlerts);

registerExporter('alerts', async () => ({
  title: 'Alertas de stock',
  columns: [
    { header: 'Sucursal', value: a => a.branchName },
    { header: 'Producto', value: a => a.productName },
    { header: 'Categoría', value: a => a.categoryName },
    { header: 'Stock actual', value: a => a.currentQuantity },
    { header: 'Reservado', value: a => a.reservedQuantity },
    { header: 'Disponible', value: a => a.availableQuantity },
    { header: 'Mínimo', value: a => a.minimumStock },
    { header: 'Estado', value: a => (a.severity === 'CRITICO' ? 'Crítico' : 'Bajo') }
  ],
  rows: loadedAlerts.length ? loadedAlerts : await apiFetch('/alerts')
}));

// --------------------------------------------------------------------------
// Auditoría (paginada en el servidor)
// --------------------------------------------------------------------------
const logFilters = { page: 1, q: '', action: '', from: '', to: '' };

function logQuery(extra = {}) {
  const params = new URLSearchParams({ page: logFilters.page, limit: 25, ...extra });
  ['q', 'action', 'from', 'to'].forEach(k => { if (logFilters[k]) params.set(k, logFilters[k]); });
  return `/users/logs?${params}`;
}

async function loadAdminLogs() {
  const tbody = document.getElementById('table-admin-logs-body');
  setTableLoading(tbody, 4, 5);
  try {
    const data = await apiFetch(logQuery());
    const actionSelect = document.getElementById('logs-filter-action');
    fillSelect(actionSelect, data.actions.map(a => ({ id: a, name: a })), { placeholder: 'Todas las acciones', value: logFilters.action });

    if (!data.items.length) {
      renderEmptyRow(tbody, 4, 'No hay registros', 'Probá cambiando los filtros.');
    } else {
      tbody.innerHTML = data.items.map(log => `
        <tr>
          <td><span class="cell-date">${formatDateTime(log.timestamp || log.createdAt)}</span></td>
          <td><strong>${escapeHtml(getUserDisplayName(log.User))}</strong> <span class="badge badge-xs">${escapeHtml(log.User?.role || 'Sistema')}</span></td>
          <td><span class="status-badge status-preparacion">${escapeHtml(log.action)}</span></td>
          <td><span class="cell-detail">${formatLogDetails(log.details)}</span></td>
        </tr>`).join('');
    }
    renderPagination('logs-pagination', data, 'registros', (page) => {
      logFilters.page = page;
      loadAdminLogs();
    });
  } catch (err) {
    renderErrorRow(tbody, 4, err.message);
  }
}
onSubTab('subpanel-admin-logs', loadAdminLogs);

document.getElementById('logs-search-input')?.addEventListener('input', debounce((e) => {
  logFilters.q = e.target.value.trim();
  logFilters.page = 1;
  loadAdminLogs();
}, 350));
['action', 'from', 'to'].forEach(key => {
  document.getElementById(`logs-filter-${key}`)?.addEventListener('change', (e) => {
    logFilters[key] = e.target.value;
    logFilters.page = 1;
    loadAdminLogs();
  });
});

registerExporter('logs', async () => ({
  title: 'Historial de auditoría',
  columns: [
    { header: 'Fecha', value: l => formatDateTime(l.timestamp || l.createdAt) },
    { header: 'Usuario', value: l => getUserDisplayName(l.User) },
    { header: 'Rol', value: l => l.User?.role || 'Sistema' },
    { header: 'Acción', value: l => l.action },
    { header: 'Detalle', value: l => l.details }
  ],
  rows: (await apiFetch(logQuery({ page: 1, limit: 0 }))).items
}));

// --------------------------------------------------------------------------
// Configuración del negocio: nombre y modo de trabajo (un solo local o varias sucursales)
// --------------------------------------------------------------------------
function updateSettingsFormVisibility() {
  const single = document.querySelector('input[name="settings-mode"]:checked')?.value === 'single';
  const group = document.getElementById('settings-main-branch-group');
  group.classList.toggle('hidden', !single);
  const hint = document.getElementById('settings-main-branch-hint');
  const select = document.getElementById('settings-main-branch');
  if (!state.branches.length) {
    select.classList.add('hidden');
    hint.textContent = 'Todavía no hay locales cargados: al guardar se creará uno con el nombre del negocio.';
  } else {
    select.classList.remove('hidden');
    hint.textContent = 'Todas las ventas, ingresos y salidas se registran en este local.';
  }
}

async function loadSettingsForm() {
  await loadSettings();
  const s = state.settings;
  document.getElementById('settings-business-name').value = s.businessName || '';
  document.querySelector(`input[name="settings-mode"][value="${s.singleBranchMode ? 'single' : 'multi'}"]`).checked = true;
  fillSelect(document.getElementById('settings-main-branch'), state.branches, { getLabel: branchLabel, value: s.mainBranchId || state.branches[0]?.id });
  updateSettingsFormVisibility();
}
onSubTab('subpanel-admin-settings', loadSettingsForm);

document.querySelectorAll('input[name="settings-mode"]').forEach(r => r.addEventListener('change', updateSettingsFormVisibility));

document.getElementById('form-settings')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const single = document.querySelector('input[name="settings-mode"]:checked')?.value === 'single';
  const data = {
    businessName: document.getElementById('settings-business-name').value.trim(),
    singleBranchMode: single
  };
  if (single && state.branches.length) data.mainBranchId = document.getElementById('settings-main-branch').value;

  const changingMode = single !== !!state.settings?.singleBranchMode;
  if (changingMode) {
    const ok = await confirmDialog({
      title: 'Cambiar el modo de trabajo',
      message: single
        ? 'Se ocultarán las sucursales, los pedidos entre sucursales y el panel de despacho. Todas las operaciones se registrarán en el local principal. Puede volver a cambiarlo cuando lo necesite.'
        : 'Se mostrarán nuevamente las sucursales, los pedidos entre sucursales y el panel de despacho.',
      confirmText: 'Cambiar modo'
    });
    if (!ok) return;
  }

  try {
    state.settings = await apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) });
    applySettingsToUI();
    showToast('Configuración guardada.', 'success');
    if (changingMode) {
      await loadBaseData();
      renderNavigation();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
});
