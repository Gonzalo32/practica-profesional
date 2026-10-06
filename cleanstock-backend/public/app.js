// ==========================================================================
// 🚀 CLEANSTOCK — FRONTEND APPLICATION LOGIC (SPA)
// ==========================================================================

const API_BASE = '/api';

// Global state helper
function getStoredUser() {
  try {
    const raw = localStorage.getItem('cleanstock_user');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    return JSON.parse(raw);
  } catch (e) {
    localStorage.removeItem('cleanstock_user');
    return null;
  }
}

function getStoredToken() {
  const token = localStorage.getItem('cleanstock_token');
  if (!token || token === 'undefined' || token === 'null') return null;
  return token;
}

let state = {
  token: getStoredToken(),
  user: getStoredUser(),
  cart: [],
  products: [],
  categories: [],
  branches: [],
  currentTab: '',
  selectedFromBranch: null,
  selectedToBranch: null
};

// Helper: capitaliza primera letra
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==========================================================================
// 🛡️ API UTILITY FUNCTION
// ==========================================================================
async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (path === '/auth/login') {
      throw new Error(data.message || 'Usuario o contraseña incorrectos');
    }
    // Session expired or invalid
    showToast('Sesión vencida. Por favor, inicia sesión de nuevo.', 'error');
    logout();
    throw new Error('No autorizado');
  }

  if (!response.ok) {
    const errorMsg = data.error ? `${data.message}: ${data.error}` : (data.message || 'Ocurrió un error en la solicitud');
    throw new Error(errorMsg);
  }
  return data;
}

// ==========================================================================
// 🍞 TOAST NOTIFICATIONS
// ==========================================================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

// ==========================================================================
// 🔐 AUTHENTICATION: LOGIN / LOGOUT / INIT
// ==========================================================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('cleanstock_token', data.token);
      localStorage.setItem('cleanstock_user', JSON.stringify(data.user));

      showToast(`¡Bienvenido, ${state.user.username}!`, 'success');

      // Ocultar login, mostrar dashboard
      const loginView = document.getElementById('login-view');
      const mainView = document.getElementById('main-view');
      if (loginView) loginView.classList.add('hidden');
      if (mainView) mainView.classList.remove('hidden');

      initApp();
    } catch (err) {
      localStorage.removeItem('cleanstock_token');
      localStorage.removeItem('cleanstock_user');
      showToast(err.message, 'error');
    }
  });
}

const btnInitDb = document.getElementById('btn-init-db');
if (btnInitDb) {
  btnInitDb.addEventListener('click', async () => {
    try {
      await apiFetch('/auth/init', { method: 'POST' });
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      if (usernameInput) usernameInput.value = 'admin@cleanstock.com';
      if (passwordInput) passwordInput.value = 'admin123';
      showToast('Base de datos inicializada. Credenciales: admin@cleanstock.com / admin123', 'success');
    } catch (err) {
      showToast(err.message, 'info');
    }
  });
}

const btnLogout = document.getElementById('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', logout);
}

function logout() {
  state.token = null;
  state.user = null;
  state.cart = [];
  localStorage.removeItem('cleanstock_token');
  localStorage.removeItem('cleanstock_user');

  // Show Login View, Hide Dashboard
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('main-view').classList.add('hidden');

  // Clear forms
  if (loginForm) loginForm.reset();
}

// ==========================================================================
// ⚙️ APP INITIALIZATION & VIEW ROUTING
// ==========================================================================
function initApp() {
  if (!state.token || !state.user) {
    logout();
    return;
  }

  // Hide login, show main view
  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');

  // Populate header profile
  document.getElementById('profile-username').textContent = state.user.username;

  const roleBadge = document.getElementById('profile-role');
  roleBadge.textContent = state.user.role;
  roleBadge.className = 'user-role badge';
  if (state.user.role === 'Administrador') roleBadge.classList.add('badge-admin');
  else if (state.user.role === 'Solicitante') roleBadge.classList.add('badge-solicita');

  // Render navigation tabs based on user role
  renderNavigation();

  // Load basic data
  loadBaseData();
}

// Render dynamic tabs based on role
function renderNavigation() {
  const nav = document.getElementById('main-navigation');
  nav.innerHTML = '';

  const role = state.user.role;
  let tabs = [];

  if (role === 'Administrador') {
    tabs = [
      { id: 'admin', label: '🛡️ Control Administrador' },
      { id: 'catalog', label: '📦 Catálogo' },
      { id: 'categories', label: '🏷️ Categorías' },
      { id: 'branches', label: '🏢 Sucursales' },
      { id: 'stock-view', label: '📊 Stock por Sucursal' },
      { id: 'solicitante', label: '🛒 Catálogo y Pedidos' },
      { id: 'responsable', label: '📥 Ingresos o Provisiones' },
      { id: 'despachante', label: '🚚 Panel Despacho' }
    ];
  } else if (role === 'Solicitante') {
    tabs = [
      { id: 'solicitante', label: '🛒 Catálogo y Pedidos' }
    ];
  } else if (role === 'Usuario Responsable') {
    tabs = [
      { id: 'responsable', label: '📥 Ingresos o Provisiones' },
      { id: 'catalog', label: '📦 Catálogo' },
      { id: 'categories', label: '🏷️ Categorías' }
    ];
  } else if (role === 'Despachante') {
    tabs = [
      { id: 'despachante', label: '🚚 Panel Despacho' }
    ];
  }

  tabs.forEach((tab, index) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab-link ${index === 0 ? 'active' : ''}`;
    tabEl.textContent = tab.label;
    tabEl.dataset.panel = `panel-${tab.id}`;
    tabEl.addEventListener('click', () => switchTab(tabEl));
    nav.appendChild(tabEl);
  });

  // Activate first panel
  if (tabs.length > 0) {
    activatePanel(`panel-${tabs[0].id}`);
  }
}

function switchTab(activeTabEl) {
  document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
  activeTabEl.classList.add('active');
  activatePanel(activeTabEl.dataset.panel);
}

function activatePanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  const targetPanel = document.getElementById(panelId);
  if (targetPanel) {
    targetPanel.classList.remove('hidden');
  }

  state.currentTab = panelId;
  // Trigger panel load actions
  refreshPanelData(panelId);
}

async function loadBaseData() {
  try {
    // Silently fetch products, categories, and branches
    state.products = await apiFetch('/inventory/products');
    state.categories = await apiFetch('/inventory/categories');
    state.branches = await apiFetch('/branches');
  } catch (err) {
    console.error('Error cargando datos base:', err.message);
  }
}

function refreshPanelData(panelId) {
  if (panelId === 'panel-admin') {
    loadAdminStats();
    loadAdminSpaces();
    loadAdminUsers();
    loadAdminApprovals();
    loadAdminLogs();
  } else if (panelId === 'panel-catalog') {
    loadCatalogPanel();
  } else if (panelId === 'panel-categories') {
    loadCategoriesPanel();
  } else if (panelId === 'panel-branches') {
    loadBranchesPanel();
  } else if (panelId === 'panel-stock-view') {
    loadBranchStockPanel();
  } else if (panelId === 'panel-solicitante') {
    loadCatalog();
    loadSolicitanteOrders();
    renderCart();
    populateBranchSelectors();
  } else if (panelId === 'panel-responsable') {
    loadResponsableData();
    populateStockEntryBranches();
  } else if (panelId === 'panel-despachante') {
    loadDespachanteOrders();
  }
}

// Handle sub-tab buttons within panels
document.querySelectorAll('.btn-tab').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const parentPanel = e.target.closest('.panel');
    parentPanel.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');

    parentPanel.querySelectorAll('.subpanel').forEach(sp => sp.classList.add('hidden'));
    const subpanelId = `subpanel-${e.target.dataset.sub}`;
    document.getElementById(subpanelId).classList.remove('hidden');

    // Perform sub-tab specific refreshes
    if (subpanelId === 'subpanel-admin-logs') loadAdminLogs();
    else if (subpanelId === 'subpanel-admin-approvals') loadAdminApprovals();
    else if (subpanelId === 'subpanel-admin-spaces') loadAdminSpaces();
    else if (subpanelId === 'subpanel-resp-stock-entry') loadRecentStockTable();
    else if (subpanelId === 'subpanel-resp-deliveries') loadResponsableDeliveries();
  });
});

// ==========================================================================
// 🛡️ PANEL: ADMINISTRADOR CODE
// ==========================================================================
// 🛡️ PANEL: ADMINISTRADOR CODE
// ==========================================================================
async function loadAdminStats() {
  try {
    const users = await apiFetch('/users');
    const products = await apiFetch('/inventory/products');
    const orders = await apiFetch('/orders');

    const activeUsers = users.filter(u => u.isActive);
    const inTransit = orders.filter(o => o.status === 'En Transito' || o.status === 'Despachado' || o.status === 'Aprobado');

    // Calcular o consultar alertas de stock
    let alertCount = 0;
    let criticalCount = 0;
    try {
      const alertsData = await apiFetch('/inventory/alerts');
      if (Array.isArray(alertsData)) {
        alertCount = alertsData.length;
        criticalCount = alertsData.filter(a => a.severity === 'Alta' || a.level === 'critico').length;
      }
    } catch (e) {
      alertCount = 0;
    }

    // Actualizar contadores numéricos
    document.getElementById('admin-stat-users').textContent = activeUsers.length;
    document.getElementById('admin-stat-products').textContent = products.length;
    document.getElementById('admin-stat-orders').textContent = orders.length;
    document.getElementById('admin-stat-alerts').textContent = alertCount;
    document.getElementById('admin-stat-transit').textContent = inTransit.length;

    // Formatear Ingresos Hoy o Mostrar 0
    const todayOrders = orders.filter(o => {
      const d = new Date(o.createdAt || o.created_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    const todayTotal = todayOrders.reduce((acc, o) => acc + (parseFloat(o.totalAmount) || 0), 0);
    document.getElementById('admin-stat-today').textContent = todayTotal > 0 ? `$${todayTotal.toLocaleString('es-AR')}` : '0';

    const criticalEl = document.getElementById('admin-stat-critical');
    if (criticalEl) {
      criticalEl.textContent = `${criticalCount} críticas`;
    }

    // Jerarquía visual en tarjeta de alerta
    const alertCard = document.querySelector('.stat-card-alert');
    if (alertCard) {
      if (alertCount > 0) {
        alertCard.classList.add('has-alerts');
      } else {
        alertCard.classList.remove('has-alerts');
      }
    }

  } catch (err) {
    console.error(err);
  }
}

let loadedUsersList = [];
let userSearchQuery = '';
let userRoleFilter = '';
let userBranchFilter = '';
let userCurrentPage = 1;
const USERS_PER_PAGE = 5;

async function loadAdminUsers() {
  try {
    const allUsers = await apiFetch('/users');
    const users = allUsers.filter(u => u.isActive);
    loadedUsersList = users;

    // Cargar opciones en el select filtro de sucursales
    populateUserBranchFilterOptions();

    // Setup event listeners para los filtros si no han sido vinculados aún
    setupUserFilterListeners();

    renderFilteredUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function populateUserBranchFilterOptions() {
  const branchSelect = document.getElementById('user-filter-branch');
  if (!branchSelect) return;
  const currentVal = branchSelect.value;
  branchSelect.innerHTML = '<option value="">Todas las Sucursales</option>';
  if (state.branches && state.branches.length > 0) {
    state.branches.forEach(b => {
      branchSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }
  branchSelect.value = currentVal;
}

let userListenersAttached = false;
function setupUserFilterListeners() {
  if (userListenersAttached) return;
  userListenersAttached = true;

  const searchInput = document.getElementById('user-search-input');
  const roleSelect = document.getElementById('user-filter-role');
  const branchSelect = document.getElementById('user-filter-branch');
  const prevBtn = document.getElementById('btn-prev-users-page');
  const nextBtn = document.getElementById('btn-next-users-page');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      userSearchQuery = e.target.value.toLowerCase().trim();
      userCurrentPage = 1;
      renderFilteredUsers();
    });
  }
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      userRoleFilter = e.target.value;
      userCurrentPage = 1;
      renderFilteredUsers();
    });
  }
  if (branchSelect) {
    branchSelect.addEventListener('change', (e) => {
      userBranchFilter = e.target.value;
      userCurrentPage = 1;
      renderFilteredUsers();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (userCurrentPage > 1) {
        userCurrentPage--;
        renderFilteredUsers();
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      userCurrentPage++;
      renderFilteredUsers();
    });
  }
}

function renderFilteredUsers() {
  const tbody = document.getElementById('table-users-body');
  tbody.innerHTML = '';

  // Filtrado
  let filtered = loadedUsersList.filter(user => {
    const fullName = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
    const emailStr = (user.email || user.username || '').toLowerCase();
    const docStr = (user.document || user.cuil || '').toLowerCase();

    const matchesSearch = !userSearchQuery ||
      fullName.includes(userSearchQuery) ||
      emailStr.includes(userSearchQuery) ||
      docStr.includes(userSearchQuery);

    const matchesRole = !userRoleFilter || user.role === userRoleFilter;
    const matchesBranch = !userBranchFilter || String(user.physicalSpaceId) === String(userBranchFilter);

    return matchesSearch && matchesRole && matchesBranch;
  });

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / USERS_PER_PAGE) || 1;

  if (userCurrentPage > totalPages) userCurrentPage = totalPages;

  // Paginación slice
  const startIndex = (userCurrentPage - 1) * USERS_PER_PAGE;
  const paginatedUsers = filtered.slice(startIndex, startIndex + USERS_PER_PAGE);

  if (totalFiltered === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state-wrapper">
            <div class="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="23" y1="11" x2="17" y2="11"></line></svg>
            </div>
            <div class="empty-state-title">No se encontraron usuarios</div>
            <div class="empty-state-desc">No hay usuarios activos que coincidan con los criterios de búsqueda o filtros seleccionados.</div>
          </div>
        </td>
      </tr>
    `;
  } else {
    paginatedUsers.forEach(user => {
      const spaceName = user.EspacioFisico?.name || '<span style="color:var(--text-muted)">Sin asignar</span>';
      const doc = user.document || user.cuil || 'Sin registrar';
      const phone = user.phone || 'Sin registrar';
      const firstName = user.firstName || 'Sin nombre';
      const lastName = user.lastName || 'Sin apellido';
      const email = user.email || user.username || 'Sin email';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${firstName}</strong></td>
        <td><strong>${lastName}</strong></td>
        <td>${email}</td>
        <td>${phone}</td>
        <td>${spaceName}</td>
        <td>${doc}</td>
        <td><span class="badge ${user.role === 'Administrador' ? 'badge-admin' : 'badge-solicita'}">${user.role}</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn-icon" title="Ver Detalle" onclick="openViewUserModal('${user.id}')">
              <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="btn-icon" title="Editar Usuario" onclick="openEditUserModal('${user.id}')">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Eliminar Usuario" onclick="deactivateUser('${user.id}')">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Actualizar información de paginador
  const infoEl = document.getElementById('users-pagination-info');
  const pageEl = document.getElementById('users-current-page');
  const prevBtn = document.getElementById('btn-prev-users-page');
  const nextBtn = document.getElementById('btn-next-users-page');

  if (infoEl) {
    const from = totalFiltered === 0 ? 0 : startIndex + 1;
    const to = Math.min(startIndex + USERS_PER_PAGE, totalFiltered);
    infoEl.textContent = `Mostrando ${from} - ${to} de ${totalFiltered} usuarios`;
  }
  if (pageEl) {
    pageEl.textContent = `Página ${userCurrentPage} de ${totalPages}`;
  }
  if (prevBtn) prevBtn.disabled = (userCurrentPage <= 1);
  if (nextBtn) nextBtn.disabled = (userCurrentPage >= totalPages);

  // Popular select de sucursales en form de creación
  populateUserSpaceSelect();
}

window.openViewUserModal = (userId) => {
  const user = loadedUsersList.find(u => String(u.id) === String(userId) || String(u._id) === String(userId));
  if (!user) return;
  const content = document.getElementById('view-user-details-content');
  if (content) {
    content.innerHTML = `
      <div><strong>Nombre:</strong> ${user.firstName || '-'}</div>
      <div><strong>Apellido:</strong> ${user.lastName || '-'}</div>
      <div><strong>Correo:</strong> ${user.email || user.username || '-'}</div>
      <div><strong>Teléfono:</strong> ${user.phone || '-'}</div>
      <div><strong>DNI / CUIL / Doc:</strong> ${user.document || user.cuil || '-'}</div>
      <div><strong>Fecha Nacimiento:</strong> ${user.birthDate || '-'}</div>
      <div><strong>Dirección:</strong> ${user.address || '-'}</div>
      <div><strong>Código Postal:</strong> ${user.zipCode || '-'}</div>
      <div><strong>Rol:</strong> ${user.role}</div>
      <div><strong>Sucursal:</strong> ${user.EspacioFisico?.name || 'Sin asignar'}</div>
    `;
  }
  const modal = document.getElementById('modal-view-user');
  if (modal) modal.classList.remove('hidden');
};

const modalViewUser = document.getElementById('modal-view-user');
const btnCloseViewUserModal = document.getElementById('btn-close-view-user-modal');
const btnCloseViewUserModalFooter = document.getElementById('btn-close-view-user-modal-footer');
function closeViewUserModal() {
  if (modalViewUser) modalViewUser.classList.add('hidden');
}
if (btnCloseViewUserModal) btnCloseViewUserModal.addEventListener('click', closeViewUserModal);
if (btnCloseViewUserModalFooter) btnCloseViewUserModalFooter.addEventListener('click', closeViewUserModal);
if (modalViewUser) {
  modalViewUser.addEventListener('click', (e) => {
    if (e.target === modalViewUser) closeViewUserModal();
  });
}

const modalEditUser = document.getElementById('modal-edit-user');
const formEditUser = document.getElementById('form-edit-user');
const btnCloseEditUserModal = document.getElementById('btn-close-edit-user-modal');
const btnCancelEditUserModal = document.getElementById('btn-cancel-edit-user-modal');

function closeEditUserModal() {
  if (modalEditUser) {
    modalEditUser.classList.add('hidden');
    if (formEditUser) formEditUser.reset();
  }
}
if (btnCloseEditUserModal) btnCloseEditUserModal.addEventListener('click', closeEditUserModal);
if (btnCancelEditUserModal) btnCancelEditUserModal.addEventListener('click', closeEditUserModal);
if (modalEditUser) {
  modalEditUser.addEventListener('click', (e) => {
    if (e.target === modalEditUser) closeEditUserModal();
  });
}

window.openEditUserModal = async (userId) => {
  const user = loadedUsersList.find(u => String(u.id) === String(userId) || String(u._id) === String(userId));
  if (!user) return;

  // Llenar select de sucursales en edit form
  const editSpaceSelect = document.getElementById('edit-user-space');
  if (editSpaceSelect) {
    if (!state.branches || state.branches.length === 0) {
      state.branches = await apiFetch('/branches');
    }
    editSpaceSelect.innerHTML = '<option value="">Seleccionar Sucursal...</option>';
    state.branches.forEach(b => {
      editSpaceSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
    });
  }

  document.getElementById('edit-user-id').value = user.id || user._id;
  document.getElementById('edit-user-email').value = user.email || user.username || '';
  document.getElementById('edit-user-firstname').value = user.firstName || '';
  document.getElementById('edit-user-lastname').value = user.lastName || '';
  document.getElementById('edit-user-document').value = user.document || user.cuil || '';
  document.getElementById('edit-user-birthdate').value = user.birthDate || '';
  document.getElementById('edit-user-phone').value = user.phone || '';
  document.getElementById('edit-user-address').value = user.address || '';
  document.getElementById('edit-user-zipcode').value = user.zipCode || '';
  document.getElementById('edit-user-role').value = user.role;
  if (editSpaceSelect) editSpaceSelect.value = user.physicalSpaceId || '';

  if (modalEditUser) modalEditUser.classList.remove('hidden');
};

if (formEditUser) {
  formEditUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const email = document.getElementById('edit-user-email').value.trim();
    const firstName = document.getElementById('edit-user-firstname').value.trim();
    const lastName = document.getElementById('edit-user-lastname').value.trim();
    const documentStr = document.getElementById('edit-user-document').value.trim();
    const birthDate = document.getElementById('edit-user-birthdate').value;
    const phone = document.getElementById('edit-user-phone').value.trim();
    const address = document.getElementById('edit-user-address').value.trim();
    const zipCode = document.getElementById('edit-user-zipcode').value.trim();
    const role = document.getElementById('edit-user-role').value;
    const physicalSpaceId = document.getElementById('edit-user-space').value;

    if (!email || !firstName || !lastName || !role) {
      showToast('Por favor completa al menos Email, Nombre, Apellido y Rol.', 'error');
      return;
    }

    try {
      await apiFetch(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          username: email,
          email,
          firstName,
          lastName,
          document: documentStr,
          cuil: documentStr,
          birthDate,
          phone,
          address,
          zipCode,
          role,
          physicalSpaceId: physicalSpaceId || null
        })
      });
      showToast('Usuario actualizado exitosamente', 'success');
      closeEditUserModal();
      loadAdminUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

window.deactivateUser = async (userId) => {
  if (!confirm('¿Seguro que deseas eliminar este usuario?')) return;
  try {
    await apiFetch(`/users/${userId}`, { method: 'DELETE' });
    showToast('Usuario eliminado exitosamente', 'success');
    loadAdminUsers();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.changeUserRole = async (userId, newRole) => {
  if (!newRole) return;
  try {
    await apiFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole })
    });
    showToast('Rol de usuario actualizado', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.changeUserSpace = async (userId, spaceId) => {
  if (!spaceId) return;
  try {
    await apiFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ physicalSpaceId: spaceId === 'none' ? null : spaceId })
    });
    showToast('Sucursal asignada actualizada', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

const formCreateUser = document.getElementById('form-create-user');
const modalCreateUser = document.getElementById('modal-create-user');
const btnOpenCreateUserModal = document.getElementById('btn-open-create-user-modal');
const btnCloseCreateUserModal = document.getElementById('btn-close-create-user-modal');
const btnCancelCreateUserModal = document.getElementById('btn-cancel-create-user-modal');

async function populateUserSpaceSelect() {
  const spaceSelect = document.getElementById('new-user-space');
  if (!spaceSelect) return;
  try {
    if (!state.branches || state.branches.length === 0) {
      state.branches = await apiFetch('/branches');
    }
    spaceSelect.innerHTML = '<option value="">Seleccionar Sucursal...</option>';
    if (state.branches && state.branches.length > 0) {
      state.branches.forEach(b => {
        spaceSelect.innerHTML += `<option value="${b.id}">${b.name}</option>`;
      });
    }
  } catch (err) {
    console.error('Error cargando sucursales para el select:', err);
  }
}

if (btnOpenCreateUserModal && modalCreateUser) {
  btnOpenCreateUserModal.addEventListener('click', async () => {
    await populateUserSpaceSelect();
    modalCreateUser.classList.remove('hidden');
  });
}

function closeCreateUserModal() {
  if (modalCreateUser) {
    modalCreateUser.classList.add('hidden');
    if (formCreateUser) formCreateUser.reset();
  }
}

if (btnCloseCreateUserModal) btnCloseCreateUserModal.addEventListener('click', closeCreateUserModal);
if (btnCancelCreateUserModal) btnCancelCreateUserModal.addEventListener('click', closeCreateUserModal);

if (modalCreateUser) {
  modalCreateUser.addEventListener('click', (e) => {
    if (e.target === modalCreateUser) {
      closeCreateUserModal();
    }
  });
}

if (formCreateUser) {
  formCreateUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('new-user-email').value.trim();
    const username = email;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;
    const physicalSpaceId = document.getElementById('new-user-space').value;
    const firstName = document.getElementById('new-user-firstname').value.trim();
    const lastName = document.getElementById('new-user-lastname').value.trim();
    const documentStr = document.getElementById('new-user-document').value.trim();
    const birthDate = document.getElementById('new-user-birthdate').value;
    const phone = document.getElementById('new-user-phone').value.trim();
    const address = document.getElementById('new-user-address').value.trim();
    const zipCode = document.getElementById('new-user-zipcode').value.trim();

    if (!email || !password || !role || !physicalSpaceId || !firstName || !lastName || !documentStr || !birthDate || !phone || !address || !zipCode) {
      showToast('Todos los campos son obligatorios.', 'error');
      return;
    }

    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({
          username, password, role, physicalSpaceId,
          firstName, lastName, document: documentStr, cuil: documentStr, birthDate,
          email, phone, address, zipCode
        })
      });
      showToast('Usuario registrado exitosamente', 'success');
      closeCreateUserModal();
      loadAdminUsers();
      loadAdminStats();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Admin approvals panel (T4.3)
let activeApprovalOrderId = null;

async function loadAdminApprovals() {
  try {
    const orders = await apiFetch('/orders?status=PENDIENTE_VALIDACION');
    const tbody = document.getElementById('table-admin-approvals-body');
    tbody.innerHTML = '';

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-text">No hay pedidos pendientes de validación.</td></tr>';
      return;
    }

    orders.forEach(order => {
      const date = new Date(order.createdAt).toLocaleString();
      const itemsText = order.OrderItems.map(i => `${i.Product.name} (x${i.quantity})`).join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="order-item-id">${order.id.substring(0, 8)}</span></td>
        <td><strong>${order.Solicitante?.username || 'N/A'}</strong></td>
        <td>${date}</td>
        <td><div class="order-item-details">${itemsText}</div></td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="openValidationModal('${order.id}')">Validar/Aprobar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

window.openValidationModal = (orderId) => {
  activeApprovalOrderId = orderId;
  document.getElementById('validation-token-modal').classList.remove('hidden');
  document.getElementById('token-display-box').classList.add('hidden');
  document.getElementById('token-string').value = '';
  document.getElementById('apply-token-input').value = '';
};

// Close modal buttons
document.getElementById('close-token-modal-btn').addEventListener('click', () => {
  document.getElementById('validation-token-modal').classList.add('hidden');
});

// Generate verification token (T1.4)
document.getElementById('btn-generate-token').addEventListener('click', async () => {
  if (!activeApprovalOrderId) return;
  try {
    const response = await apiFetch('/auth/generate-validation', {
      method: 'POST',
      body: JSON.stringify({ orderId: activeApprovalOrderId, action: 'APPROVE_ORDER' })
    });

    document.getElementById('token-string').value = response.validationToken;
    document.getElementById('token-display-box').classList.remove('hidden');
    showToast('Token de validación generado correctamente.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Copy token
document.getElementById('btn-copy-token').addEventListener('click', () => {
  const tokenInput = document.getElementById('token-string');
  tokenInput.select();
  navigator.clipboard.writeText(tokenInput.value);
  showToast('¡Token copiado al portapapeles!', 'info');
});

// Apply token (T4.3)
document.getElementById('form-apply-token').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = document.getElementById('apply-token-input').value.trim();
  if (!activeApprovalOrderId || !token) return;

  try {
    await apiFetch(`/orders/${activeApprovalOrderId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ validationToken: token })
    });

    showToast('Pedido aprobado con token y enviado al Despachante.', 'success');
    document.getElementById('validation-token-modal').classList.add('hidden');
    loadAdminApprovals();
    loadAdminStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// Load audit logs (RNF02)
async function loadAdminLogs() {
  try {
    const logs = await apiFetch('/users/logs');
    const tbody = document.getElementById('table-admin-logs-body');
    tbody.innerHTML = '';

    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleString();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="font-size:0.8rem; color:var(--text-muted)">${date}</span></td>
        <td><strong>${log.User?.username || 'Sistema'}</strong> <span class="badge" style="font-size:0.65rem">${log.User?.role || 'System'}</span></td>
        <td><span class="status-badge status-preparacion">${log.action}</span></td>
        <td><span style="font-size:0.85rem">${log.details}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

// ==========================================================================
// 🏢 PHYSICAL SPACES MANAGEMENT (CRUD & EVENTS)
// ==========================================================================
let state_spaces = [];

async function loadAdminSpaces() {
  try {
    const spaces = await apiFetch('/spaces');
    state_spaces = spaces;

    // Fill the spaces selector in the Create User Form
    const userSpaceSelect = document.getElementById('new-user-space');
    if (userSpaceSelect) {
      userSpaceSelect.innerHTML = '<option value="">Sin Espacio Físico</option>';
      spaces.forEach(space => {
        const opt = document.createElement('option');
        opt.value = space.id;
        opt.textContent = `${capitalize(space.type)} ${space.name}`;
        userSpaceSelect.appendChild(opt);
      });
    }

    const tbody = document.getElementById('table-spaces-body');
    if (tbody) {
      tbody.innerHTML = '';
      if (spaces.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-text">No hay espacios físicos registrados.</td></tr>';
        return;
      }

      spaces.forEach(space => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${space.name}</strong></td>
          <td><span class="badge badge-admin">${capitalize(space.type)}</span></td>
          <td><span style="font-size:0.85rem">${space.description || 'Sin descripción'}</span></td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="deleteSpace('${space.id}')">Eliminar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

window.deleteSpace = async (spaceId) => {
  if (!confirm('¿Seguro que deseas eliminar este espacio físico? Los usuarios asignados a él quedarán desasociados.')) return;
  try {
    await apiFetch(`/spaces/${spaceId}`, { method: 'DELETE' });
    showToast('Espacio físico eliminado exitosamente', 'success');
    loadAdminSpaces();
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.changeUserSpace = async (userId, spaceId) => {
  try {
    await apiFetch(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ physicalSpaceId: spaceId === 'none' ? null : spaceId })
    });
    showToast('Espacio físico de usuario actualizado', 'success');
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Form to create physical space
const formCreateSpace = document.getElementById('form-create-space');
if (formCreateSpace) {
  formCreateSpace.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('space-name').value.trim();
    const description = document.getElementById('space-description').value.trim();
    const type = document.getElementById('space-type').value;

    try {
      await apiFetch('/spaces', {
        method: 'POST',
        body: JSON.stringify({ name, description, type })
      });
      showToast('Espacio físico creado exitosamente', 'success');
      formCreateSpace.reset();
      loadAdminSpaces();
      loadAdminUsers();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ==========================================================================
// 🔵 PANEL: SOLICITANTE CODE
// ==========================================================================
// Load catalog (T4.1)
const catalogSearch = document.getElementById('catalog-search');
const catalogFilter = document.getElementById('catalog-category-filter');

if (catalogSearch) catalogSearch.addEventListener('input', loadCatalog);
if (catalogFilter) catalogFilter.addEventListener('change', loadCatalog);

async function loadCatalog() {
  try {
    const products = await apiFetch('/inventory/products');
    state.products = products;

    // Fill categories dropdown filter
    const categories = await apiFetch('/inventory/categories');
    state.categories = categories;

    // Cargar información de stock global por sucursal para calcular disponible real
    let allBranchStocks = [];
    try {
      allBranchStocks = await apiFetch('/branches/movements'); // o consolidar stock total
    } catch (e) {
      allBranchStocks = [];
    }

    const currentFilterVal = catalogFilter.value;
    catalogFilter.innerHTML = '<option value="">Todos los rubros</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      if (cat.id === currentFilterVal) opt.selected = true;
      catalogFilter.appendChild(opt);
    });

    // Filter catalog
    const searchTerm = catalogSearch.value.toUpperCase().trim();
    const filterCatId = catalogFilter.value;

    const filtered = products.filter(p => {
      const matchesSearch = p.name.includes(searchTerm) || (p.description && p.description.toUpperCase().includes(searchTerm));
      const matchesCategory = !filterCatId || p.categoryId === filterCatId;
      return matchesSearch && matchesCategory;
    });

    const grid = document.getElementById('catalog-grid');
    grid.innerHTML = '';

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: span 2;" class="empty-state-wrapper">
          <div class="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <div class="empty-state-title">No se encontraron insumos</div>
          <div class="empty-state-desc">No hay artículos cargados que coincidan con la búsqueda o el rubro seleccionado.</div>
        </div>
      `;
      return;
    }

    filtered.forEach(prod => {
      const card = document.createElement('div');
      card.className = 'card glass product-card';

      // Calcular stock total disponible estimado en sistema
      const minStock = prod.minimumStock || 0;
      const descText = prod.description && prod.description.trim() ? prod.description : 'Sin descripción técnica disponible.';

      card.innerHTML = `
        <div class="product-info">
          <span class="product-category">${prod.Category?.name || 'Varios'}</span>
          <h4>${prod.name}</h4>
          <p class="product-desc">${descText}</p>
        </div>
        <div>
          <div class="product-min-stock" style="margin-bottom: 4px;">Stock mínimo de alerta: <strong>${minStock} u</strong></div>
          <div class="product-actions" style="margin-top: 10px;">
            <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
              <input type="number" id="qty-${prod.id}" value="1" min="1" placeholder="Cant.">
            </div>
            <button class="btn btn-primary" onclick="addToCart('${prod.id}')">➕ Agregar al Carrito</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

window.addToCart = (productId) => {
  const qtyInput = document.getElementById(`qty-${productId}`);
  const quantity = parseInt(qtyInput.value) || 1;
  const product = state.products.find(p => p.id === productId);

  if (!product) return;
  if (quantity <= 0) {
    showToast('Ingresá una cantidad válida mayor a 0', 'error');
    return;
  }

  const existingIndex = state.cart.findIndex(item => item.productId === productId);
  if (existingIndex > -1) {
    state.cart[existingIndex].quantity += quantity;
  } else {
    state.cart.push({
      productId,
      name: product.name,
      quantity,
      minStock: product.minimumStock || 0
    });
  }

  showToast(`Añadido al carrito: ${product.name} (x${quantity})`, 'info');
  renderCart();
};

function renderCart() {
  const cartList = document.getElementById('cart-items');
  const summaryBox = document.getElementById('cart-summary');

  cartList.innerHTML = '';

  if (state.cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-state-wrapper" style="padding: 20px 10px;">
        <div class="empty-state-icon" style="width:42px; height:42px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
        </div>
        <div class="empty-state-title" style="font-size:0.95rem;">Tu carrito está vacío</div>
        <div class="empty-state-desc" style="font-size:0.8rem;">Seleccioná productos del catálogo para armar tu pedido.</div>
      </div>
    `;
    summaryBox.classList.add('hidden');
    return;
  }

  state.cart.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'cart-item';
    itemEl.innerHTML = `
      <div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-qty">Cantidad: <strong>${item.quantity}</strong></div>
      </div>
      <button class="btn btn-danger btn-sm" title="Quitar insumo" onclick="removeFromCart('${item.productId}')">&times;</button>
    `;
    cartList.appendChild(itemEl);
  });

  summaryBox.classList.remove('hidden');
}

window.removeFromCart = (productId) => {
  state.cart = state.cart.filter(item => item.productId !== productId);
  renderCart();
};

// Submit Order (T4.2) — con validación automática y destino obligatorio
const btnSubmitOrder = document.getElementById('btn-submit-order');
if (btnSubmitOrder) {
  btnSubmitOrder.addEventListener('click', async () => {
    if (state.cart.length === 0) return;

    const fromBranchEl = document.getElementById('order-from-branch');
    const toBranchEl = document.getElementById('order-to-branch');
    const notesEl = document.getElementById('order-notes');

    const fromBranchId = fromBranchEl ? fromBranchEl.value || null : null;
    const toBranchId = toBranchEl ? toBranchEl.value || null : null;
    const notes = notesEl ? notesEl.value.trim() || null : null;

    if (!toBranchId) {
      showToast('Seleccioná la Sucursal Destino (quién recibe el pedido).', 'error');
      return;
    }

    // Evaluación automática: si el pedido tiene artículos urgentes o supera mínimos
    const requiresValidation = state.cart.some(item => item.quantity > 50 || item.minStock > 20);

    try {
      const items = state.cart.map(item => ({
        productId: item.productId,
        quantity: item.quantity
      }));

      await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({ items, requiresValidation, fromBranchId, toBranchId, notes })
      });

      showToast('¡Pedido registrado y enviado exitosamente!', 'success');
      state.cart = [];
      if (fromBranchEl) fromBranchEl.value = '';
      if (toBranchEl) toBranchEl.value = '';
      if (notesEl) notesEl.value = '';
      renderCart();
      loadSolicitanteOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Load Solicitante orders con Estado Vacío Diseñado
let loadedSolicitanteOrders = [];
let solicitanteOrderSearchQuery = '';
let solicitanteOrderStatusFilter = '';

async function loadSolicitanteOrders() {
  try {
    const orders = await apiFetch('/orders');
    loadedSolicitanteOrders = orders;

    setupSolicitanteOrderFilterListeners();
    renderSolicitanteOrdersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let solicitanteOrderListenersAttached = false;
function setupSolicitanteOrderFilterListeners() {
  if (solicitanteOrderListenersAttached) return;
  solicitanteOrderListenersAttached = true;

  const searchInput = document.getElementById('solicitante-search-orders');
  const statusSelect = document.getElementById('solicitante-filter-status');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      solicitanteOrderSearchQuery = e.target.value.toLowerCase().trim();
      renderSolicitanteOrdersTable();
    });
  }
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => {
      solicitanteOrderStatusFilter = e.target.value;
      renderSolicitanteOrdersTable();
    });
  }
}

function renderSolicitanteOrdersTable() {
  const tbody = document.getElementById('table-solicitante-orders-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = loadedSolicitanteOrders.filter(o => {
    const idStr = (o.id || o._id || '').toLowerCase();
    const fromName = (o.FromBranch?.name || '').toLowerCase();
    const toName = (o.ToBranch?.name || '').toLowerCase();
    const itemsStr = (o.OrderItems || []).map(i => (i.Product?.name || '').toLowerCase()).join(' ');

    const matchesSearch = !solicitanteOrderSearchQuery ||
      idStr.includes(solicitanteOrderSearchQuery) ||
      fromName.includes(solicitanteOrderSearchQuery) ||
      toName.includes(solicitanteOrderSearchQuery) ||
      itemsStr.includes(solicitanteOrderSearchQuery);

    const matchesStatus = !solicitanteOrderStatusFilter || o.status === solicitanteOrderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state-wrapper" style="padding: 25px 15px;">
            <div class="empty-state-icon" style="width:42px; height:42px;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            </div>
            <div class="empty-state-title">No hay pedidos creados</div>
            <div class="empty-state-desc">Tus solicitudes recientes aparecerán aquí con su estado y trazabilidad en tiempo real.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(order => {
    const shortId = (order.id || order._id || '').substring(0, 8).toUpperCase();
    const fromBranchName = order.FromBranch?.name || '<span style="color:var(--text-muted)">General</span>';
    const toBranchName = order.ToBranch?.name || '<span style="color:var(--text-muted)">General</span>';
    const itemsSummary = (order.OrderItems || []).map(i => `<strong>${i.Product?.name || 'Insumo'}</strong> (x${i.quantity})`).join(', ') || 'Sin ítems';
    const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const statusClass = getStatusClass(order.status);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${shortId}</strong></td>
      <td>${fromBranchName}</td>
      <td>${toBranchName}</td>
      <td><span style="font-size:0.85rem">${itemsSummary}</span></td>
      <td><span class="status-badge status-${statusClass}">${order.status}</span></td>
      <td><span style="font-size:0.8rem; color:var(--text-muted)">${dateStr}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')">Ver Trazabilidad</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal Popup: Crear Nuevo Pedido
let draftOrderItems = [];

const modalCreateOrder = document.getElementById('modal-create-order');
const btnOpenCreateOrderModal = document.getElementById('btn-open-create-order-modal');
const btnCloseCreateOrderModal = document.getElementById('btn-close-create-order-modal');
const btnCancelCreateOrderModal = document.getElementById('btn-cancel-create-order-modal');
const btnOrderModalAddItem = document.getElementById('btn-order-modal-add-item');
const formCreateOrderModal = document.getElementById('form-create-order-modal');

async function openCreateOrderModal() {
  if (!state.branches || state.branches.length === 0) {
    state.branches = await apiFetch('/branches');
  }
  if (!state.products || state.products.length === 0) {
    state.products = await apiFetch('/inventory/products');
  }

  const fromBranchSelect = document.getElementById('order-modal-from-branch');
  const toBranchSelect = document.getElementById('order-modal-to-branch');
  const productSelect = document.getElementById('order-modal-product-select');

  if (fromBranchSelect) {
    fromBranchSelect.innerHTML = '<option value="" disabled selected>Seleccionar sucursal origen...</option>';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${capitalize(b.type)})`;
      fromBranchSelect.appendChild(opt);
    });
  }

  if (toBranchSelect) {
    toBranchSelect.innerHTML = '<option value="" disabled selected>Seleccionar sucursal destino...</option>';
    const userSpaceId = state.user?.physicalSpaceId || state.user?.EspacioFisico?.id || state.user?.EspacioFisico?._id;
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${capitalize(b.type)})`;
      if (userSpaceId && String(b.id) === String(userSpaceId)) opt.selected = true;
      toBranchSelect.appendChild(opt);
    });
  }

  if (productSelect) {
    productSelect.innerHTML = '<option value="">Selecciona un insumo...</option>';
    state.products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      productSelect.appendChild(opt);
    });
  }

  draftOrderItems = [];
  renderOrderModalItemsTable();

  if (modalCreateOrder) modalCreateOrder.classList.remove('hidden');
}

function closeCreateOrderModal() {
  if (modalCreateOrder) {
    modalCreateOrder.classList.add('hidden');
    if (formCreateOrderModal) formCreateOrderModal.reset();
    draftOrderItems = [];
  }
}

if (btnOpenCreateOrderModal) btnOpenCreateOrderModal.addEventListener('click', openCreateOrderModal);
if (btnCloseCreateOrderModal) btnCloseCreateOrderModal.addEventListener('click', closeCreateOrderModal);
if (btnCancelCreateOrderModal) btnCancelCreateOrderModal.addEventListener('click', closeCreateOrderModal);
if (modalCreateOrder) {
  modalCreateOrder.addEventListener('click', (e) => {
    if (e.target === modalCreateOrder) closeCreateOrderModal();
  });
}

// Agregar artículo a la lista temporal del pedido
if (btnOrderModalAddItem) {
  btnOrderModalAddItem.addEventListener('click', () => {
    const productSelect = document.getElementById('order-modal-product-select');
    const qtyInput = document.getElementById('order-modal-product-qty');

    const productId = productSelect ? productSelect.value : '';
    const quantity = parseInt(qtyInput ? qtyInput.value : '1') || 1;

    if (!productId) {
      showToast('Seleccioná un insumo para agregar.', 'error');
      return;
    }
    if (quantity <= 0) {
      showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }

    const product = state.products.find(p => p.id === productId);
    if (!product) return;

    const existingIndex = draftOrderItems.findIndex(item => item.productId === productId);
    if (existingIndex > -1) {
      draftOrderItems[existingIndex].quantity += quantity;
    } else {
      draftOrderItems.push({
        productId,
        productName: product.name,
        quantity
      });
    }

    if (qtyInput) qtyInput.value = '1';
    if (productSelect) productSelect.value = '';

    renderOrderModalItemsTable();
  });
}

function renderOrderModalItemsTable() {
  const tbody = document.getElementById('table-order-modal-items-body');
  const countBadge = document.getElementById('order-modal-items-count');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (countBadge) {
    countBadge.textContent = `${draftOrderItems.length} insumo${draftOrderItems.length !== 1 ? 's' : ''}`;
  }

  if (draftOrderItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-text" style="padding:12px;">Aún no agregaste insumos a este pedido.</td></tr>';
    return;
  }

  draftOrderItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.productName}</strong></td>
      <td style="text-align:center;"><span class="badge">${item.quantity}</span></td>
      <td style="text-align:center;">
        <button type="button" class="btn-icon btn-icon-danger" title="Eliminar insumo" onclick="removeOrderModalItem(${index})">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.removeOrderModalItem = (index) => {
  draftOrderItems.splice(index, 1);
  renderOrderModalItemsTable();
};

if (formCreateOrderModal) {
  formCreateOrderModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromBranchId = document.getElementById('order-modal-from-branch').value;
    const toBranchId = document.getElementById('order-modal-to-branch').value;
    const notes = document.getElementById('order-modal-notes').value.trim();

    if (!fromBranchId || !toBranchId) {
      showToast('Seleccioná la sucursal de origen y la sucursal de destino.', 'error');
      return;
    }
    if (draftOrderItems.length === 0) {
      showToast('Agregá al menos un insumo al pedido antes de confirmar.', 'error');
      return;
    }

    try {
      const items = draftOrderItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity
      }));

      const requiresValidation = draftOrderItems.some(item => item.quantity > 50);

      await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({ items, requiresValidation, fromBranchId, toBranchId, notes })
      });

      showToast('¡Pedido creado y enviado exitosamente!', 'success');
      closeCreateOrderModal();
      loadSolicitanteOrders();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

function getStatusClass(status) {
  if (status === 'PENDIENTE_VALIDACION' || status === 'PENDIENTE') return 'pendiente';
  if (status === 'EN_PREPARACION') return 'preparacion';
  if (status === 'DESPACHADO') return 'despachado';
  if (status === 'ENTREGADO') return 'entregado';
  return 'rechazado';
}

// ==========================================================================
// 📥 PANEL: INGRESOS Y PROVISIONES DE STOCK CODE
// ==========================================================================
async function loadResponsableData() {
  try {
    if (!state.products || state.products.length === 0) {
      state.products = await apiFetch('/inventory/products');
    }
    if (!state.branches || state.branches.length === 0) {
      state.branches = await apiFetch('/branches');
    }

    loadRecentStockTable();
  } catch (err) {
    console.error(err);
  }
}

// Cargar la tabla principal de Ingresos y Provisiones
async function loadRecentStockTable() {
  try {
    const logs = await apiFetch('/users/logs');
    const tbody = document.getElementById('table-resp-recent-stock');
    if (!tbody) return;
    tbody.innerHTML = '';

    const entryLogs = (logs || []).filter(l => l.action === 'REGISTER_STOCK' || l.action === 'INFORMAL_ENTRY');

    if (entryLogs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-text">No hay ingresos ni provisiones registrados recientemente.</td></tr>';
      return;
    }

    entryLogs.forEach(log => {
      const dateStr = log.timestamp || log.createdAt ? new Date(log.timestamp || log.createdAt).toLocaleString() : '—';
      const isInformal = log.action === 'INFORMAL_ENTRY';
      const typeBadge = isInformal ? '<span class="badge badge-warning">📌 Extraordinario</span>' : '<span class="badge badge-solicita">📥 Provisión Estándar</span>';
      
      let branchName = '—';
      let prodName = '—';
      let qty = '—';
      let lotStr = '—';
      let expStr = '—';

      const details = log.details || '';

      if (log.Branch?.name) {
        branchName = log.Branch.name;
      } else if (details.includes('sucursal')) {
        const branchPart = details.split('sucursal')[1];
        branchName = branchPart ? branchPart.trim() : '—';
      }

      if (details.includes('unidades')) {
        const qtyMatch = details.match(/(\d+)\s+unidades/);
        if (qtyMatch) qty = qtyMatch[1];
      }

      if (details.includes('Lote:')) {
        const lotMatch = details.match(/Lote:\s*([^)]+)/);
        if (lotMatch) lotStr = lotMatch[1];
      }

      if (details.includes('"')) {
        const prodMatch = details.match(/"([^"]+)"/);
        if (prodMatch) prodName = prodMatch[1];
      } else if (details.includes('producto ID')) {
        prodName = details.split('producto ID')[1].split('(')[0].trim();
        const pObj = state.products.find(p => String(p.id) === String(prodName));
        if (pObj) prodName = pObj.name;
      } else {
        prodName = details.split('unidades')[0] || details;
      }

      const userStr = log.User?.username || log.User?.email || 'Sistema';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.8rem; color:var(--text-muted)">${dateStr}</td>
        <td><strong>${branchName}</strong></td>
        <td><strong>${prodName}</strong></td>
        <td><span class="stock-qty" style="font-weight:700">${qty}</span></td>
        <td>${lotStr}</td>
        <td>${expStr}</td>
        <td>${typeBadge} <span style="font-size:0.8rem; opacity:0.8">(${userStr})</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error cargando tabla de ingresos:', err);
  }
}

// --------------------------------------------------------------------------
// 📥 MODAL: AGREGAR INGRESO / PROVISIÓN DE STOCK (ESTÁNDAR)
// --------------------------------------------------------------------------
let draftStockEntryItems = [];

const modalCreateStockEntry = document.getElementById('modal-create-stock-entry');
const btnOpenStockEntryModal = document.getElementById('btn-open-stock-entry-modal');
const btnCloseCreateStockEntryModal = document.getElementById('btn-close-create-stock-entry-modal');
const btnCancelCreateStockEntryModal = document.getElementById('btn-cancel-create-stock-entry-modal');
const btnStockModalAddItem = document.getElementById('btn-stock-modal-add-item');
const formCreateStockEntryModal = document.getElementById('form-create-stock-entry-modal');

async function openCreateStockEntryModal() {
  if (!state.branches || state.branches.length === 0) {
    state.branches = await apiFetch('/branches');
  }
  if (!state.products || state.products.length === 0) {
    state.products = await apiFetch('/inventory/products');
  }

  const branchSel = document.getElementById('stock-modal-branch');
  if (branchSel) {
    branchSel.innerHTML = '<option value="" disabled selected>Seleccionar sucursal destino...</option>';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${capitalize(b.type)})`;
      branchSel.appendChild(opt);
    });
    if (state.user?.assignedSpaceId) {
      branchSel.value = state.user.assignedSpaceId;
    }
  }

  const productSel = document.getElementById('stock-modal-product-select');
  if (productSel) {
    productSel.innerHTML = '<option value="">Selecciona insumo...</option>';
    state.products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      productSel.appendChild(opt);
    });
  }

  draftStockEntryItems = [];
  document.getElementById('stock-modal-product-qty').value = 1;
  document.getElementById('stock-modal-lot-number').value = '';
  document.getElementById('stock-modal-expiration-date').value = '';
  renderStockModalItemsTable();

  if (modalCreateStockEntry) modalCreateStockEntry.classList.remove('hidden');
}

function closeCreateStockEntryModal() {
  if (modalCreateStockEntry) {
    modalCreateStockEntry.classList.add('hidden');
    if (formCreateStockEntryModal) formCreateStockEntryModal.reset();
    draftStockEntryItems = [];
  }
}

if (btnOpenStockEntryModal) btnOpenStockEntryModal.addEventListener('click', openCreateStockEntryModal);
if (btnCloseCreateStockEntryModal) btnCloseCreateStockEntryModal.addEventListener('click', closeCreateStockEntryModal);
if (btnCancelCreateStockEntryModal) btnCancelCreateStockEntryModal.addEventListener('click', closeCreateStockEntryModal);
if (modalCreateStockEntry) {
  modalCreateStockEntry.addEventListener('click', (e) => {
    if (e.target === modalCreateStockEntry) closeCreateStockEntryModal();
  });
}

if (btnStockModalAddItem) {
  btnStockModalAddItem.addEventListener('click', () => {
    const productId = document.getElementById('stock-modal-product-select').value;
    const quantity = parseInt(document.getElementById('stock-modal-product-qty').value) || 0;
    const lotNumber = document.getElementById('stock-modal-lot-number').value.trim();
    const expirationDate = document.getElementById('stock-modal-expiration-date').value;

    if (!productId) {
      showToast('Seleccioná un insumo o producto.', 'error');
      return;
    }
    if (quantity <= 0) {
      showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }
    if (!lotNumber) {
      showToast('Ingresá el número de lote.', 'error');
      return;
    }
    if (!expirationDate) {
      showToast('Seleccioná la fecha de vencimiento.', 'error');
      return;
    }

    const productObj = state.products.find(p => p.id === productId);
    const productName = productObj ? productObj.name : 'Insumo';

    const lotClean = lotNumber.toLowerCase();
    const existingIndex = draftStockEntryItems.findIndex(item =>
      item.productId === productId &&
      item.lotNumber.toLowerCase() === lotClean &&
      item.expirationDate === expirationDate
    );

    if (existingIndex !== -1) {
      draftStockEntryItems[existingIndex].quantity += quantity;
      showToast(`Se sumaron ${quantity} unidades al insumo con el mismo lote y vencimiento.`, 'info');
    } else {
      draftStockEntryItems.push({
        productId,
        productName,
        quantity,
        lotNumber,
        expirationDate
      });
    }

    document.getElementById('stock-modal-product-select').value = '';
    document.getElementById('stock-modal-product-qty').value = 1;
    document.getElementById('stock-modal-lot-number').value = '';
    document.getElementById('stock-modal-expiration-date').value = '';

    renderStockModalItemsTable();
  });
}

function renderStockModalItemsTable() {
  const tbody = document.getElementById('table-stock-modal-items-body');
  const countEl = document.getElementById('stock-modal-items-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${draftStockEntryItems.length} artículos`;

  if (draftStockEntryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-text" style="padding: 12px;">Aún no agregaste insumos a la lista de ingreso.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  draftStockEntryItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.productName}</strong></td>
      <td style="text-align: center;"><span class="stock-qty" style="font-weight: 700;">${item.quantity}</span></td>
      <td><span class="badge">${item.lotNumber}</span></td>
      <td>${item.expirationDate}</td>
      <td style="text-align: center;">
        <button type="button" class="btn-icon btn-icon-danger" title="Eliminar de la lista" onclick="removeStockModalItem(${index})">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.removeStockModalItem = (index) => {
  draftStockEntryItems.splice(index, 1);
  renderStockModalItemsTable();
};

if (formCreateStockEntryModal) {
  formCreateStockEntryModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const branchId = document.getElementById('stock-modal-branch').value;

    if (!branchId) {
      showToast('Seleccioná la sucursal destino a la que ingresará el stock.', 'error');
      return;
    }

    if (draftStockEntryItems.length === 0) {
      showToast('Agregá al menos un insumo a la lista de ingreso.', 'error');
      return;
    }

    try {
      for (const item of draftStockEntryItems) {
        await apiFetch('/inventory/stock', {
          method: 'POST',
          body: JSON.stringify({
            productId: item.productId,
            lotNumber: item.lotNumber,
            expirationDate: item.expirationDate,
            quantity: item.quantity,
            branchId
          })
        });
      }

      showToast('¡Ingreso de stock registrado exitosamente!', 'success');
      closeCreateStockEntryModal();
      loadResponsableData();
      if (state.currentTab === 'panel-stock-view') loadBranchStockPanel();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// --------------------------------------------------------------------------
// 📌 MODAL: REGISTRAR INGRESO EXTRAORDINARIO
// --------------------------------------------------------------------------
let draftInformalEntryItems = [];

const modalCreateInformalEntry = document.getElementById('modal-create-informal-entry');
const btnOpenInformalEntryModal = document.getElementById('btn-open-informal-entry-modal');
const btnCloseCreateInformalEntryModal = document.getElementById('btn-close-create-informal-entry-modal');
const btnCancelCreateInformalEntryModal = document.getElementById('btn-cancel-create-informal-entry-modal');
const btnInformalModalAddItem = document.getElementById('btn-informal-modal-add-item');
const formCreateInformalEntryModal = document.getElementById('form-create-informal-entry-modal');

async function openCreateInformalEntryModal() {
  if (!state.branches || state.branches.length === 0) {
    state.branches = await apiFetch('/branches');
  }
  if (!state.products || state.products.length === 0) {
    state.products = await apiFetch('/inventory/products');
  }

  const branchSel = document.getElementById('informal-modal-branch');
  if (branchSel) {
    branchSel.innerHTML = '<option value="" disabled selected>Seleccionar sucursal destino...</option>';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = `${b.name} (${capitalize(b.type)})`;
      branchSel.appendChild(opt);
    });
    if (state.user?.assignedSpaceId) {
      branchSel.value = state.user.assignedSpaceId;
    }
  }

  const productSel = document.getElementById('informal-modal-product-select');
  if (productSel) {
    productSel.innerHTML = '<option value="">Selecciona un producto...</option>';
    state.products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      productSel.appendChild(opt);
    });
  }

  draftInformalEntryItems = [];
  document.getElementById('informal-modal-description').value = '';
  document.getElementById('informal-modal-product-qty').value = 1;
  renderInformalModalItemsTable();

  if (modalCreateInformalEntry) modalCreateInformalEntry.classList.remove('hidden');
}

function closeCreateInformalEntryModal() {
  if (modalCreateInformalEntry) {
    modalCreateInformalEntry.classList.add('hidden');
    if (formCreateInformalEntryModal) formCreateInformalEntryModal.reset();
    draftInformalEntryItems = [];
  }
}

if (btnOpenInformalEntryModal) btnOpenInformalEntryModal.addEventListener('click', openCreateInformalEntryModal);
if (btnCloseCreateInformalEntryModal) btnCloseCreateInformalEntryModal.addEventListener('click', closeCreateInformalEntryModal);
if (btnCancelCreateInformalEntryModal) btnCancelCreateInformalEntryModal.addEventListener('click', closeCreateInformalEntryModal);
if (modalCreateInformalEntry) {
  modalCreateInformalEntry.addEventListener('click', (e) => {
    if (e.target === modalCreateInformalEntry) closeCreateInformalEntryModal();
  });
}

if (btnInformalModalAddItem) {
  btnInformalModalAddItem.addEventListener('click', () => {
    const productId = document.getElementById('informal-modal-product-select').value;
    const quantity = parseInt(document.getElementById('informal-modal-product-qty').value) || 0;

    if (!productId) {
      showToast('Seleccioná un producto.', 'error');
      return;
    }
    if (quantity <= 0) {
      showToast('La cantidad debe ser mayor a 0.', 'error');
      return;
    }

    const productObj = state.products.find(p => p.id === productId);
    const productName = productObj ? productObj.name : 'Producto';

    const existingIndex = draftInformalEntryItems.findIndex(item => item.productId === productId);
    if (existingIndex !== -1) {
      draftInformalEntryItems[existingIndex].quantity += quantity;
      showToast(`Se sumaron ${quantity} unidades a ${productName}.`, 'info');
    } else {
      draftInformalEntryItems.push({
        productId,
        productName,
        quantity
      });
    }

    document.getElementById('informal-modal-product-select').value = '';
    document.getElementById('informal-modal-product-qty').value = 1;

    renderInformalModalItemsTable();
  });
}

function renderInformalModalItemsTable() {
  const tbody = document.getElementById('table-informal-modal-items-body');
  const countEl = document.getElementById('informal-modal-items-count');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${draftInformalEntryItems.length} artículos`;

  if (draftInformalEntryItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-text" style="padding: 12px;">Aún no agregaste artículos a este ingreso extraordinario.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  draftInformalEntryItems.forEach((item, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.productName}</strong></td>
      <td style="text-align: center;"><span class="stock-qty" style="font-weight: 700;">${item.quantity}</span></td>
      <td style="text-align: center;">
        <button type="button" class="btn-icon btn-icon-danger" title="Eliminar de la lista" onclick="removeInformalModalItem(${index})">
          <svg viewBox="0 0 24 24" width="16" height="16"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.removeInformalModalItem = (index) => {
  draftInformalEntryItems.splice(index, 1);
  renderInformalModalItemsTable();
};

if (formCreateInformalEntryModal) {
  formCreateInformalEntryModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    const branchId = document.getElementById('informal-modal-branch').value;
    const entryType = document.getElementById('informal-modal-entry-type').value;
    const description = document.getElementById('informal-modal-description').value.trim();

    if (!branchId || !entryType || !description) {
      showToast('Completá la sucursal destino, tipo de ingreso y descripción obligatoria.', 'error');
      return;
    }

    if (draftInformalEntryItems.length === 0) {
      showToast('Agregá al menos un artículo a la lista del ingreso extraordinario.', 'error');
      return;
    }

    try {
      for (const item of draftInformalEntryItems) {
        await apiFetch('/inventory/informal-entry', {
          method: 'POST',
          body: JSON.stringify({
            productId: item.productId,
            quantity: item.quantity,
            branchId,
            entryType,
            description
          })
        });
      }

      showToast('¡Ingreso extraordinario registrado correctamente!', 'success');
      closeCreateInformalEntryModal();
      loadResponsableData();
      if (state.currentTab === 'panel-stock-view') loadBranchStockPanel();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ==========================================================================
// 📦 PANEL: CATÁLOGO DE PRODUCTOS
// ==========================================================================
let loadedCatalogProducts = [];
let catalogSearchQuery = '';
let catalogCategoryFilter = '';

async function loadCatalogPanel() {
  try {
    const products = await apiFetch('/inventory/products');
    const categories = await apiFetch('/inventory/categories');
    state.products = products;
    state.categories = categories;
    loadedCatalogProducts = products;

    // Popular select de filtro de categoría en panel catálogo
    const filterSelect = document.getElementById('catalog-filter-category');
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">Todas las Categorías</option>';
      categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (c.id === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
      });
    }

    setupCatalogFilterListeners();
    renderCatalogTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let catalogListenersAttached = false;
function setupCatalogFilterListeners() {
  if (catalogListenersAttached) return;
  catalogListenersAttached = true;

  const searchInput = document.getElementById('catalog-search-input');
  const filterSelect = document.getElementById('catalog-filter-category');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      catalogSearchQuery = e.target.value.toLowerCase().trim();
      renderCatalogTable();
    });
  }
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      catalogCategoryFilter = e.target.value;
      renderCatalogTable();
    });
  }
}

function renderCatalogTable() {
  const tbody = document.getElementById('table-catalog-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = loadedCatalogProducts.filter(p => {
    const nameStr = (p.name || '').toLowerCase();
    const descStr = (p.description || '').toLowerCase();
    const matchesSearch = !catalogSearchQuery || nameStr.includes(catalogSearchQuery) || descStr.includes(catalogSearchQuery);
    const catId = p.categoryId || p.Category?.id || p.Category?._id;
    const matchesCategory = !catalogCategoryFilter || String(catId) === String(catalogCategoryFilter);
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-text">No se encontraron productos en el catálogo.</td></tr>';
    return;
  }

  filtered.forEach(p => {
    const catName = p.Category?.name || 'Sin categoría';
    const desc = p.description || 'Sin descripción';
    const minStock = p.minimumStock || 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.name}</strong></td>
      <td><span class="badge">${catName}</span></td>
      <td><span style="font-size:0.85rem; color:var(--text-muted);">${desc}</span></td>
      <td><span style="font-weight:600;">${minStock} unidades</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal Popup: Crear Producto
const modalCreateProduct = document.getElementById('modal-create-product');
const btnOpenCreateProductModal = document.getElementById('btn-open-create-product-modal');
const btnCloseCreateProductModal = document.getElementById('btn-close-create-product-modal');
const btnCancelCreateProductModal = document.getElementById('btn-cancel-create-product-modal');

async function openCreateProductModal() {
  if (!state.categories || state.categories.length === 0) {
    state.categories = await apiFetch('/inventory/categories');
  }
  const prodCategorySelect = document.getElementById('prod-category');
  if (prodCategorySelect) {
    prodCategorySelect.innerHTML = '<option value="" disabled selected>Selecciona rubro...</option>';
    state.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      prodCategorySelect.appendChild(opt);
    });
  }
  if (modalCreateProduct) modalCreateProduct.classList.remove('hidden');
}

function closeCreateProductModal() {
  if (modalCreateProduct) {
    modalCreateProduct.classList.add('hidden');
    const form = document.getElementById('form-create-product');
    if (form) form.reset();
  }
}

if (btnOpenCreateProductModal) btnOpenCreateProductModal.addEventListener('click', openCreateProductModal);
if (btnCloseCreateProductModal) btnCloseCreateProductModal.addEventListener('click', closeCreateProductModal);
if (btnCancelCreateProductModal) btnCancelCreateProductModal.addEventListener('click', closeCreateProductModal);
if (modalCreateProduct) {
  modalCreateProduct.addEventListener('click', (e) => {
    if (e.target === modalCreateProduct) closeCreateProductModal();
  });
}

const formCreateProduct = document.getElementById('form-create-product');
if (formCreateProduct) {
  formCreateProduct.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const categoryId = document.getElementById('prod-category').value;
    const description = document.getElementById('prod-description').value.trim();
    const minimumStock = parseInt(document.getElementById('prod-minstock').value) || 0;

    try {
      await apiFetch('/inventory/products', {
        method: 'POST',
        body: JSON.stringify({ name, categoryId, description, minimumStock })
      });

      showToast('Producto agregado al catálogo correctamente.', 'success');
      closeCreateProductModal();
      loadBaseData();
      if (state.currentTab === 'panel-catalog') loadCatalogPanel();
      else if (state.currentTab === 'panel-responsable') loadResponsableData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ==========================================================================
// 🏷️ PANEL: CATEGORÍAS / RUBROS
// ==========================================================================
async function loadCategoriesPanel() {
  try {
    const categories = await apiFetch('/inventory/categories');
    const products = await apiFetch('/inventory/products');
    state.categories = categories;
    state.products = products;

    const tbody = document.getElementById('table-categories-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (categories.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-text">No hay categorías registradas aún.</td></tr>';
      return;
    }

    categories.forEach(cat => {
      const linkedCount = products.filter(p => String(p.categoryId || p.Category?.id || p.Category?._id) === String(cat.id)).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${cat.name}</strong></td>
        <td><span style="font-size:0.85rem; color:var(--text-muted);">${cat.description || 'Sin descripción'}</span></td>
        <td><span class="badge" style="background:var(--color-surface); border:1px solid var(--border-glass);">${linkedCount} insumos</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Modal Popup: Crear Categoría
const modalCreateCategory = document.getElementById('modal-create-category');
const btnOpenCreateCategoryModal = document.getElementById('btn-open-create-category-modal');
const btnCloseCreateCategoryModal = document.getElementById('btn-close-create-category-modal');
const btnCancelCreateCategoryModal = document.getElementById('btn-cancel-create-category-modal');

function openCreateCategoryModal() {
  if (modalCreateCategory) modalCreateCategory.classList.remove('hidden');
}

function closeCreateCategoryModal() {
  if (modalCreateCategory) {
    modalCreateCategory.classList.add('hidden');
    const form = document.getElementById('form-create-category');
    if (form) form.reset();
  }
}

if (btnOpenCreateCategoryModal) btnOpenCreateCategoryModal.addEventListener('click', openCreateCategoryModal);
if (btnCloseCreateCategoryModal) btnCloseCreateCategoryModal.addEventListener('click', closeCreateCategoryModal);
if (btnCancelCreateCategoryModal) btnCancelCreateCategoryModal.addEventListener('click', closeCreateCategoryModal);
if (modalCreateCategory) {
  modalCreateCategory.addEventListener('click', (e) => {
    if (e.target === modalCreateCategory) closeCreateCategoryModal();
  });
}

const formCreateCategory = document.getElementById('form-create-category');
if (formCreateCategory) {
  formCreateCategory.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const description = document.getElementById('cat-description').value.trim();

    try {
      await apiFetch('/inventory/categories', {
        method: 'POST',
        body: JSON.stringify({ name, description })
      });

      showToast('Categoría creada correctamente.', 'success');
      closeCreateCategoryModal();
      loadBaseData();
      if (state.currentTab === 'panel-categories') loadCategoriesPanel();
      else if (state.currentTab === 'panel-responsable') loadResponsableData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Load deliveries for responsable (to mark as ENTREGADO) (T5.3)
async function loadResponsableDeliveries() {
  try {
    const orders = await apiFetch('/orders?status=DESPACHADO');
    const tbody = document.getElementById('table-resp-deliveries-body');
    tbody.innerHTML = '';

    if (orders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-text" style="padding: 24px; text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
            <p style="margin: 0; color: var(--text-muted);">No hay pedidos despachados esperando confirmación de recepción en este momento.</p>
          </td>
        </tr>
      `;
      return;
    }

    orders.forEach(order => {
      const date = new Date(order.updatedAt).toLocaleString();
      const itemsText = order.OrderItems.map(i => `${i.Product.name} (x${i.quantity})`).join(', ');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="order-item-id">#${order.id.substring(0, 8)}</span></td>
        <td><strong>${order.Solicitante?.username || 'N/A'}</strong></td>
        <td><div class="order-item-details">${itemsText}</div></td>
        <td>${date}</td>
        <td>
          <button class="btn btn-success btn-sm" onclick="markOrderEntregado('${order.id}')">Confirmar Recepción</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

window.markOrderEntregado = async (orderId) => {
  if (!confirm(`📦 ¿Confirmas que recibiste físicamente los insumos del pedido #${orderId.substring(0, 8)} y deseas impactarlos en el stock de tu sucursal?`)) {
    return;
  }
  try {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'ENTREGADO' })
    });
    showToast('Recepción confirmada: pedido actualizado a ENTREGADO', 'success');
    loadResponsableDeliveries();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================================================
// 🚚 PANEL: DESPACHANTE CODE (T5.1 / T5.2)
// ==========================================================================
// Attach event listener for status filter
const filterStatusSelect = document.getElementById('despachante-filter-status');
if (filterStatusSelect) {
  filterStatusSelect.addEventListener('change', () => loadDespachanteOrders());
}

async function loadDespachanteOrders() {
  try {
    const orders = await apiFetch('/orders');
    const tbody = document.getElementById('table-despachante-orders-body');
    tbody.innerHTML = '';

    const selectedStatus = document.getElementById('despachante-filter-status')?.value || '';

    // Filter non-validation pending items and filter by dropdown if selected
    let activeOrders = orders.filter(o => o.status !== 'PENDIENTE_VALIDACION');
    if (selectedStatus) {
      activeOrders = activeOrders.filter(o => o.status === selectedStatus);
    }

    if (activeOrders.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-text" style="padding: 24px; text-align: center;">
            <div style="font-size: 2rem; margin-bottom: 8px;">🚚</div>
            <p style="margin: 0; color: var(--text-muted);">No hay pedidos en este estado en el panel de despacho.</p>
          </td>
        </tr>
      `;
      return;
    }

    activeOrders.forEach(order => {
      const date = new Date(order.createdAt).toLocaleString();
      const itemsText = order.OrderItems ? order.OrderItems.map(i => `${i.Product?.name || 'Insumo'} (x${i.quantity})`).join(', ') : 'Sin artículos';

      // 1. Readable Order ID
      const shortId = `#PED-${order.id.substring(0, 4).toUpperCase()}`;

      // 2. Solicitante name & email
      const applicantName = (order.Solicitante?.firstName && order.Solicitante?.lastName) 
        ? `${order.Solicitante.firstName} ${order.Solicitante.lastName}` 
        : (order.Solicitante?.username || 'N/A');
      const applicantHtml = `<strong>${applicantName}</strong><br><small style="color:var(--text-muted); font-size:0.75rem;">${order.Solicitante?.email || ''}</small>`;

      // 3. Destination Branch
      const branchHtml = order.ToBranch 
        ? `🏢 <strong>${order.ToBranch.name}</strong>` 
        : `<span style="color:var(--text-muted)">Sede Central</span>`;

      // 4. Action Buttons for status progression
      let actionButtons = '';
      if (order.status === 'PENDIENTE') {
        actionButtons = `<button class="btn btn-primary btn-sm" onclick="updateOrderStatus('${order.id}', 'EN_PREPARACION')">▶️ Iniciar Preparación</button>`;
      } else if (order.status === 'EN_PREPARACION') {
        actionButtons = `<button class="btn btn-success btn-sm" onclick="updateOrderStatus('${order.id}', 'DESPACHADO')">🚚 Marcar Despachado</button>`;
      } else if (order.status === 'DESPACHADO') {
        actionButtons = `<span class="status-badge status-despachado">🚚 En Tránsito</span>`;
      } else if (order.status === 'ENTREGADO') {
        actionButtons = `<span class="status-badge status-entregado">✅ Recibido</span>`;
      } else {
        actionButtons = `<span style="color:var(--text-muted); font-size:0.8rem">${order.status}</span>`;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span class="order-item-id" title="ID Técnico Completo: ${order.id}">${shortId}</span></td>
        <td>${applicantHtml}</td>
        <td>${branchHtml}</td>
        <td style="font-size:0.85rem">${date}</td>
        <td><span class="status-badge status-${getStatusClass(order.status)}">${order.status}</span></td>
        <td><div class="order-item-details">${itemsText}</div></td>
        <td style="display:flex; gap:8px; align-items:center">
          ${actionButtons}
          <button class="btn btn-secondary btn-sm" onclick="openTimelineModal('${order.id}')" title="Ver trazabilidad completa del pedido">🔍 Detalle</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
  }
}

window.updateOrderStatus = async (orderId, newStatus) => {
  try {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`¡Estado de pedido actualizado a ${newStatus}!`, 'success');

    // Refresh correct panels
    if (state.currentTab === 'panel-despachante') loadDespachanteOrders();
    else if (state.currentTab === 'panel-responsable') loadResponsableDeliveries();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================================================
// 📈 TIMELINE MODAL CODE (T5.4)
// ==========================================================================
window.openTimelineModal = async (orderId) => {
  document.getElementById('modal-order-id-label').textContent = orderId.substring(0, 8);
  document.getElementById('timeline-modal').classList.remove('hidden');

  const container = document.getElementById('timeline-container');
  container.innerHTML = '<p class="empty-text">Cargando trazabilidad...</p>';

  try {
    const history = await apiFetch(`/orders/${orderId}/history`);
    container.innerHTML = '';

    if (history.length === 0) {
      container.innerHTML = '<p class="empty-text">No hay eventos registrados para este pedido.</p>';
      return;
    }

    history.forEach(item => {
      const timeStr = new Date(item.timestamp).toLocaleString();
      const userStr = item.User ? `${item.User.username} (${item.User.role})` : 'Sistema';

      const itemEl = document.createElement('div');
      itemEl.className = 'timeline-item';
      itemEl.innerHTML = `
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <span class="timeline-time">${timeStr}</span>
          <span class="timeline-action">${item.action}</span>
          <span class="timeline-details">${item.details} (por ${userStr})</span>
        </div>
      `;
      container.appendChild(itemEl);
    });
  } catch (err) {
    container.innerHTML = `<p class="empty-text" style="color:var(--color-danger)">${err.message}</p>`;
  }
};

document.getElementById('close-modal-btn').addEventListener('click', () => {
  document.getElementById('timeline-modal').classList.add('hidden');
});

// Close modals on clicking outside of content
window.addEventListener('click', (e) => {
  const timelineModal = document.getElementById('timeline-modal');
  const tokenModal = document.getElementById('validation-token-modal');
  if (e.target === timelineModal) timelineModal.classList.add('hidden');
  if (e.target === tokenModal) tokenModal.classList.add('hidden');
});

// ==========================================================================
// 🏢 BRANCHES PANEL
// ==========================================================================
let loadedBranchesList = [];
let branchSearchQuery = '';
let branchTypeFilter = '';

async function loadBranchesPanel() {
  try {
    const branches = await apiFetch('/branches');
    state.branches = branches;
    loadedBranchesList = branches;

    setupBranchFilterListeners();
    renderFilteredBranches();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

let branchListenersAttached = false;
function setupBranchFilterListeners() {
  if (branchListenersAttached) return;
  branchListenersAttached = true;

  const searchInput = document.getElementById('branch-search-input');
  const typeSelect = document.getElementById('branch-filter-type');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      branchSearchQuery = e.target.value.toLowerCase().trim();
      renderFilteredBranches();
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      branchTypeFilter = e.target.value.toLowerCase().trim();
      renderFilteredBranches();
    });
  }
}

function renderFilteredBranches() {
  const tbody = document.getElementById('table-branches-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = loadedBranchesList.filter(branch => {
    const nameStr = (branch.name || '').toLowerCase();
    const addressStr = (branch.address || '').toLowerCase();
    const phoneStr = (branch.phone || '').toLowerCase();
    const typeStr = (branch.type || '').toLowerCase();

    const matchesSearch = !branchSearchQuery ||
      nameStr.includes(branchSearchQuery) ||
      addressStr.includes(branchSearchQuery) ||
      phoneStr.includes(branchSearchQuery);

    const matchesType = !branchTypeFilter || typeStr === branchTypeFilter;

    return matchesSearch && matchesType;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state-wrapper">
            <div class="empty-state-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z"></path></svg>
            </div>
            <div class="empty-state-title">No se encontraron sucursales</div>
            <div class="empty-state-desc">No hay sucursales o espacios físicos que coincidan con la búsqueda o filtro seleccionado.</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(branch => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${branch.name}</strong></td>
      <td><span class="badge badge-solicita">${capitalize(branch.type)}</span></td>
      <td>${branch.address || '<span style="color:var(--text-muted)">Sin dirección</span>'}</td>
      <td>${branch.phone || '<span style="color:var(--text-muted)">Sin registrar</span>'}</td>
      <td>${branch.description || '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn-icon" title="Ver Detalle" onclick="openViewBranchModal('${branch.id}')">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
          </button>
          ${state.user.role === 'Administrador' ? `
            <button class="btn-icon" title="Editar Sucursal" onclick="openEditBranchModal('${branch.id}')">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
            <button class="btn-icon btn-icon-danger" title="Eliminar Sucursal" onclick="deleteBranch('${branch.id}')">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Modal handlers: Crear Sucursal
const formCreateBranch = document.getElementById('form-create-branch');
const modalCreateBranch = document.getElementById('modal-create-branch');
const btnOpenCreateBranchModal = document.getElementById('btn-open-create-branch-modal');
const btnCloseCreateBranchModal = document.getElementById('btn-close-create-branch-modal');
const btnCancelCreateBranchModal = document.getElementById('btn-cancel-create-branch-modal');

// Contadores de caracteres para descripción
const createBranchDesc = document.getElementById('branch-description');
const createBranchCounter = document.getElementById('create-branch-desc-counter');
if (createBranchDesc && createBranchCounter) {
  createBranchDesc.addEventListener('input', (e) => {
    createBranchCounter.textContent = `${e.target.value.length} / 200`;
  });
}

const editBranchDesc = document.getElementById('edit-branch-description');
const editBranchCounter = document.getElementById('edit-branch-desc-counter');
if (editBranchDesc && editBranchCounter) {
  editBranchDesc.addEventListener('input', (e) => {
    editBranchCounter.textContent = `${e.target.value.length} / 200`;
  });
}

if (btnOpenCreateBranchModal && modalCreateBranch) {
  btnOpenCreateBranchModal.addEventListener('click', () => {
    if (formCreateBranch) formCreateBranch.reset();
    if (createBranchCounter) createBranchCounter.textContent = '0 / 200';
    modalCreateBranch.classList.remove('hidden');
  });
}

function closeCreateBranchModal() {
  if (modalCreateBranch) {
    modalCreateBranch.classList.add('hidden');
    if (formCreateBranch) formCreateBranch.reset();
  }
}
if (btnCloseCreateBranchModal) btnCloseCreateBranchModal.addEventListener('click', closeCreateBranchModal);
if (btnCancelCreateBranchModal) btnCancelCreateBranchModal.addEventListener('click', closeCreateBranchModal);
if (modalCreateBranch) {
  modalCreateBranch.addEventListener('click', (e) => {
    if (e.target === modalCreateBranch) closeCreateBranchModal();
  });
}

if (formCreateBranch) {
  formCreateBranch.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('branch-name').value.trim();
    const type = document.getElementById('branch-type').value;
    const address = document.getElementById('branch-address').value.trim();
    const phone = document.getElementById('branch-phone').value.trim();
    const description = document.getElementById('branch-description').value.trim();

    if (!name || !type || !address) {
      showToast('Los campos Nombre, Tipo y Dirección son obligatorios.', 'error');
      return;
    }

    try {
      await apiFetch('/branches', {
        method: 'POST',
        body: JSON.stringify({ name, address, phone, description, type })
      });
      showToast('Sucursal registrada exitosamente', 'success');
      closeCreateBranchModal();
      loadBranchesPanel();
      loadBaseData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// Modal handlers: Ver Sucursal
window.openViewBranchModal = (branchId) => {
  const branch = loadedBranchesList.find(b => b.id === branchId);
  if (!branch) return;
  const content = document.getElementById('view-branch-details-content');
  if (content) {
    content.innerHTML = `
      <div style="grid-column: span 2;"><strong>Nombre:</strong> ${branch.name}</div>
      <div><strong>Tipo:</strong> ${capitalize(branch.type)}</div>
      <div><strong>Teléfono / Contacto:</strong> ${branch.phone || 'Sin registrar'}</div>
      <div style="grid-column: span 2;"><strong>Dirección:</strong> ${branch.address || 'Sin dirección'}</div>
      <div style="grid-column: span 2;"><strong>Descripción:</strong> ${branch.description || 'Sin descripción'}</div>
    `;
  }
  const modal = document.getElementById('modal-view-branch');
  if (modal) modal.classList.remove('hidden');
};

const modalViewBranch = document.getElementById('modal-view-branch');
const btnCloseViewBranchModal = document.getElementById('btn-close-view-branch-modal');
const btnCloseViewBranchModalFooter = document.getElementById('btn-close-view-branch-modal-footer');
function closeViewBranchModal() {
  if (modalViewBranch) modalViewBranch.classList.add('hidden');
}
if (btnCloseViewBranchModal) btnCloseViewBranchModal.addEventListener('click', closeViewBranchModal);
if (btnCloseViewBranchModalFooter) btnCloseViewBranchModalFooter.addEventListener('click', closeViewBranchModal);
if (modalViewBranch) {
  modalViewBranch.addEventListener('click', (e) => {
    if (e.target === modalViewBranch) closeViewBranchModal();
  });
}

// Modal handlers: Editar Sucursal
const modalEditBranch = document.getElementById('modal-edit-branch');
const formEditBranch = document.getElementById('form-edit-branch');
const btnCloseEditBranchModal = document.getElementById('btn-close-edit-branch-modal');
const btnCancelEditBranchModal = document.getElementById('btn-cancel-edit-branch-modal');

function closeEditBranchModal() {
  if (modalEditBranch) {
    modalEditBranch.classList.add('hidden');
    if (formEditBranch) formEditBranch.reset();
  }
}
if (btnCloseEditBranchModal) btnCloseEditBranchModal.addEventListener('click', closeEditBranchModal);
if (btnCancelEditBranchModal) btnCancelEditBranchModal.addEventListener('click', closeEditBranchModal);
if (modalEditBranch) {
  modalEditBranch.addEventListener('click', (e) => {
    if (e.target === modalEditBranch) closeEditBranchModal();
  });
}

window.openEditBranchModal = (branchId) => {
  const branch = loadedBranchesList.find(b => b.id === branchId);
  if (!branch) return;

  document.getElementById('edit-branch-id').value = branch.id;
  document.getElementById('edit-branch-name').value = branch.name || '';
  document.getElementById('edit-branch-type').value = branch.type || 'sucursal';
  document.getElementById('edit-branch-address').value = branch.address || '';
  document.getElementById('edit-branch-phone').value = branch.phone || '';
  document.getElementById('edit-branch-description').value = branch.description || '';

  if (editBranchCounter) {
    editBranchCounter.textContent = `${(branch.description || '').length} / 200`;
  }

  if (modalEditBranch) modalEditBranch.classList.remove('hidden');
};

if (formEditBranch) {
  formEditBranch.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-branch-id').value;
    const name = document.getElementById('edit-branch-name').value.trim();
    const type = document.getElementById('edit-branch-type').value;
    const address = document.getElementById('edit-branch-address').value.trim();
    const phone = document.getElementById('edit-branch-phone').value.trim();
    const description = document.getElementById('edit-branch-description').value.trim();

    if (!name || !type || !address) {
      showToast('Los campos Nombre, Tipo y Dirección son obligatorios.', 'error');
      return;
    }

    try {
      await apiFetch(`/branches/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, type, address, phone, description })
      });
      showToast('Sucursal actualizada exitosamente', 'success');
      closeEditBranchModal();
      loadBranchesPanel();
      loadBaseData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

window.deleteBranch = async (branchId) => {
  if (!confirm('¿Seguro que deseas eliminar esta sucursal? Se desasociarán todos sus usuarios y stock.')) return;
  try {
    await apiFetch(`/branches/${branchId}`, { method: 'DELETE' });
    showToast('Sucursal eliminada', 'success');
    loadBranchesPanel();
    loadBaseData();
  } catch (err) {
    showToast(err.message, 'error');
  }
};


// ==========================================================================
// 📊 STOCK POR SUCURSAL
// ==========================================================================
// ==========================================================================
// 📊 STOCK POR SUCURSAL
// ==========================================================================
async function loadBranchStockPanel() {
  try {
    const branches = await apiFetch('/branches');
    state.branches = branches;

    // Asegurar que los productos estén cargados para el select de ajuste
    if (!state.products || state.products.length === 0) {
      state.products = await apiFetch('/inventory/products');
    }

    const sel = document.getElementById('stock-view-branch-select');
    const adjBranch = document.getElementById('adjust-branch');
    const adjProduct = document.getElementById('adjust-product');

    if (sel) {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">— Seleccionar sucursal —</option>';
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        const typeCapitalized = capitalize(b.type);
        const displayName = b.name.toLowerCase().startsWith(b.type.toLowerCase()) ? b.name : `${b.name} · ${typeCapitalized}`;
        opt.textContent = displayName;
        if (b.id === currentVal) opt.selected = true;
        sel.appendChild(opt);
      });
    }

    // Popular selector de sucursales en Ajuste Manual
    if (adjBranch) {
      const currentAdjVal = adjBranch.value;
      adjBranch.innerHTML = '<option value="">— Seleccionar Sucursal —</option>';
      branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        const typeCapitalized = capitalize(b.type);
        const displayName = b.name.toLowerCase().startsWith(b.type.toLowerCase()) ? b.name : `${b.name} · ${typeCapitalized}`;
        opt.textContent = displayName;
        if (b.id === currentAdjVal) opt.selected = true;
        adjBranch.appendChild(opt);
      });
    }

    // Popular selector de productos en Ajuste Manual
    if (adjProduct) {
      const currentProdVal = adjProduct.value;
      adjProduct.innerHTML = '<option value="">— Seleccionar Producto —</option>';
      state.products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.id === currentProdVal) opt.selected = true;
        adjProduct.appendChild(opt);
      });
    }

    // Vincular listeners del formulario y botón desplegable
    setupStockAdjustFormControls();

    // Determinar sucursal a mostrar por defecto:
    // 1) Si ya hay valor en el select, usar ese.
    // 2) Si no, usar la sucursal asignada al usuario logueado.
    // 3) Si el usuario no tiene sucursal, usar la primera de la lista.
    let targetBranchId = sel ? sel.value : '';
    if (!targetBranchId) {
      const userSpaceId = state.user?.physicalSpaceId || state.user?.EspacioFisico?.id || state.user?.EspacioFisico?._id;
      if (userSpaceId && branches.some(b => String(b.id) === String(userSpaceId))) {
        targetBranchId = String(userSpaceId);
      } else if (branches.length > 0) {
        targetBranchId = String(branches[0].id);
      }
    }

    if (targetBranchId) {
      if (sel) sel.value = targetBranchId;
      if (adjBranch) adjBranch.value = targetBranchId;
      await loadStockForBranch(targetBranchId);
    } else {
      const tbody = document.getElementById('table-branch-stock-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-text">No hay sucursales disponibles.</td></tr>';
    }

    // Cargar automáticamente el Historial de Movimientos al ingresar al panel
    loadMovementsTraceability();

  } catch (err) {
    showToast(err.message, 'error');
  }
}

let stockAdjustControlsAttached = false;
function setupStockAdjustFormControls() {
  if (stockAdjustControlsAttached) return;
  stockAdjustControlsAttached = true;

  const btnToggle = document.getElementById('btn-toggle-stock-adjust');
  const containerForm = document.getElementById('container-stock-adjust-form');
  const btnClose = document.getElementById('btn-close-stock-adjust-form');
  const btnCancel = document.getElementById('btn-cancel-stock-adjust');

  if (btnToggle && containerForm) {
    btnToggle.addEventListener('click', () => {
      containerForm.classList.toggle('hidden');
      if (!containerForm.classList.contains('hidden')) {
        const currentSelVal = document.getElementById('stock-view-branch-select')?.value;
        const adjBranch = document.getElementById('adjust-branch');
        if (adjBranch && currentSelVal) adjBranch.value = currentSelVal;
        containerForm.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  const closeForm = () => {
    if (containerForm) containerForm.classList.add('hidden');
  };
  if (btnClose) btnClose.addEventListener('click', closeForm);
  if (btnCancel) btnCancel.addEventListener('click', closeForm);
  if (containerForm) {
    containerForm.addEventListener('click', (e) => {
      if (e.target === containerForm) closeForm();
    });
  }

  const btnMinus = document.getElementById('btn-adjust-qty-minus');
  const btnPlus = document.getElementById('btn-adjust-qty-plus');
  const qtyInput = document.getElementById('adjust-quantity');
  const reasonSelect = document.getElementById('adjust-reason-select');
  const otherGroup = document.getElementById('adjust-reason-other-group');
  const otherInput = document.getElementById('adjust-reason-other');

  if (btnMinus && qtyInput) {
    btnMinus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 0;
      qtyInput.value = val - 1;
    });
  }
  if (btnPlus && qtyInput) {
    btnPlus.addEventListener('click', () => {
      let val = parseInt(qtyInput.value) || 0;
      qtyInput.value = val + 1;
    });
  }

  if (reasonSelect && otherGroup && otherInput) {
    reasonSelect.addEventListener('change', (e) => {
      if (e.target.value === 'Otro') {
        otherGroup.classList.remove('hidden');
        otherInput.required = true;
      } else {
        otherGroup.classList.add('hidden');
        otherInput.required = false;
        otherInput.value = '';
      }
    });
  }
}

async function loadStockForBranch(branchId) {
  try {
    const { branch, stockItems } = await apiFetch(`/branches/${branchId}/stock`);
    const tbody = document.getElementById('table-branch-stock-body');
    const titleEl = document.getElementById('stock-view-branch-title');

    const displayName = branch.name.toLowerCase().startsWith(branch.type.toLowerCase()) ? branch.name : `${branch.name} (${capitalize(branch.type)})`;
    if (titleEl) titleEl.textContent = `Stock — ${displayName}`;
    if (!tbody) return;
    tbody.innerHTML = '';

    if (stockItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-text">Esta sucursal no tiene stock registrado aún.</td></tr>';
      return;
    }

    stockItems.forEach(item => {
      const product = item.Producto;
      const category = product?.Category?.name || '—';
      const minStock = product?.minimumStock || 0;
      const totalQty = item.quantity || 0;
      const reservedQty = item.reservedQuantity || 0;
      const availableQty = Math.max(0, totalQty - reservedQty);
      const stockClass = availableQty <= 0 ? 'stock-critical' : availableQty <= minStock ? 'stock-low' : 'stock-ok';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${product?.name || 'N/A'}</strong></td>
        <td><span class="badge">${category}</span></td>
        <td><span class="stock-qty ${stockClass}">${totalQty}</span></td>
        <td><span style="font-size:0.9rem; color:var(--color-warning); font-weight:600">${reservedQty}</span></td>
        <td><span class="stock-qty ${stockClass}">${availableQty}</span></td>
        <td><span style="font-size:0.85rem; color:var(--text-muted)">${minStock}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    showToast(err.message, 'error');
  }
}

window.viewBranchStock = (branchId, branchName) => {
  const stockViewTab = document.querySelector('[data-panel="panel-stock-view"]');
  if (stockViewTab) {
    switchTab(stockViewTab);
    setTimeout(async () => {
      const sel = document.getElementById('stock-view-branch-select');
      const adjBranch = document.getElementById('adjust-branch');
      if (sel) {
        sel.value = branchId;
        await loadStockForBranch(branchId);
      }
      if (adjBranch) {
        adjBranch.value = branchId;
      }
    }, 200);
  }
};

// Sincronizar el selector principal con el selector del ajuste manual
const stockViewSel = document.getElementById('stock-view-branch-select');
if (stockViewSel) {
  stockViewSel.addEventListener('change', async (e) => {
    const selectedBranchId = e.target.value;
    const adjBranch = document.getElementById('adjust-branch');
    if (adjBranch) adjBranch.value = selectedBranchId;

    if (selectedBranchId) {
      await loadStockForBranch(selectedBranchId);
    } else {
      const tbody = document.getElementById('table-branch-stock-body');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="empty-text">Seleccioná una sucursal para ver su stock.</td></tr>';
      const title = document.getElementById('stock-view-branch-title');
      if (title) title.textContent = 'Stock por Sucursal';
    }
  });
}

// Evento al cambiar manualmente la sucursal dentro del formulario de ajuste
const adjustBranchSel = document.getElementById('adjust-branch');
if (adjustBranchSel) {
  adjustBranchSel.addEventListener('change', (e) => {
    const selectedBranchId = e.target.value;
    if (stockViewSel && stockViewSel.value !== selectedBranchId) {
      stockViewSel.value = selectedBranchId;
      if (selectedBranchId) loadStockForBranch(selectedBranchId);
    }
  });
}

// Modal de confirmación para el ajuste manual de stock
let pendingAdjustData = null;
const formStockAdjust = document.getElementById('form-stock-adjust');
const modalConfirmStockAdjust = document.getElementById('modal-confirm-stock-adjust');
const btnCloseConfirmAdjustModal = document.getElementById('btn-close-confirm-adjust-modal');
const btnCancelConfirmAdjust = document.getElementById('btn-cancel-confirm-adjust');
const btnExecuteConfirmAdjust = document.getElementById('btn-execute-confirm-adjust');

if (formStockAdjust) {
  formStockAdjust.addEventListener('submit', (e) => {
    e.preventDefault();
    const branchId = document.getElementById('adjust-branch').value;
    const productId = document.getElementById('adjust-product').value;
    const quantity = parseInt(document.getElementById('adjust-quantity').value);
    const reasonSelectVal = document.getElementById('adjust-reason-select').value;
    const reasonOtherVal = document.getElementById('adjust-reason-other').value.trim();

    const finalReason = reasonSelectVal === 'Otro' ? reasonOtherVal : reasonSelectVal;

    if (!branchId || !productId || isNaN(quantity) || !finalReason) {
      showToast('Completá todos los campos obligatorios del ajuste.', 'error');
      return;
    }

    const branch = state.branches.find(b => b.id === branchId);
    const product = state.products.find(p => p.id === productId);

    pendingAdjustData = { branchId, productId, quantity, reason: finalReason };

    const summaryEl = document.getElementById('confirm-stock-adjust-summary');
    if (summaryEl) {
      const actionText = quantity > 0 ? `<span style="color:var(--color-success); font-weight:700;">+${quantity} unidades (Ingreso / Incremento)</span>` : `<span style="color:var(--color-danger); font-weight:700;">${quantity} unidades (Egreso / Descuento)</span>`;
      summaryEl.innerHTML = `
        <div><strong>Sucursal:</strong> ${branch ? branch.name : 'N/A'}</div>
        <div><strong>Producto:</strong> ${product ? product.name : 'N/A'}</div>
        <div><strong>Ajuste:</strong> ${actionText}</div>
        <div><strong>Motivo:</strong> ${finalReason}</div>
      `;
    }

    if (modalConfirmStockAdjust) modalConfirmStockAdjust.classList.remove('hidden');
  });
}

function closeConfirmAdjustModal() {
  if (modalConfirmStockAdjust) modalConfirmStockAdjust.classList.add('hidden');
  pendingAdjustData = null;
}

if (btnCloseConfirmAdjustModal) btnCloseConfirmAdjustModal.addEventListener('click', closeConfirmAdjustModal);
if (btnCancelConfirmAdjust) btnCancelConfirmAdjust.addEventListener('click', closeConfirmAdjustModal);
if (modalConfirmStockAdjust) {
  modalConfirmStockAdjust.addEventListener('click', (e) => {
    if (e.target === modalConfirmStockAdjust) closeConfirmAdjustModal();
  });
}

if (btnExecuteConfirmAdjust) {
  btnExecuteConfirmAdjust.addEventListener('click', async () => {
    if (!pendingAdjustData) return;
    const { branchId, productId, quantity, reason } = pendingAdjustData;

    try {
      await apiFetch(`/branches/${branchId}/stock/adjust`, {
        method: 'POST',
        body: JSON.stringify({ productId, quantity, reason })
      });
      showToast('Ajuste de stock aplicado correctamente', 'success');
      closeConfirmAdjustModal();
      formStockAdjust.reset();

      const otherGroup = document.getElementById('adjust-reason-other-group');
      if (otherGroup) otherGroup.classList.add('hidden');

      if (stockViewSel && stockViewSel.value) {
        await loadStockForBranch(stockViewSel.value);
      }
      loadMovementsTraceability();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ==========================================================================
// 🔄 POPULATE BRANCH SELECTORS IN FORMS
// ==========================================================================
function populateBranchSelectors() {
  const fromSel = document.getElementById('order-from-branch');
  const toSel = document.getElementById('order-to-branch');

  if (fromSel) {
    fromSel.innerHTML = '<option value="">Sin sucursal origen (pedido general)</option>';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      const displayName = b.name.toLowerCase().startsWith(b.type.toLowerCase()) ? b.name : `${b.name} · ${capitalize(b.type)}`;
      opt.textContent = displayName;
      fromSel.appendChild(opt);
    });
  }

  if (toSel) {
    toSel.innerHTML = '<option value="">Sin sucursal destino</option>';
    state.branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      const displayName = b.name.toLowerCase().startsWith(b.type.toLowerCase()) ? b.name : `${b.name} · ${capitalize(b.type)}`;
      opt.textContent = displayName;
      toSel.appendChild(opt);
    });
  }
}

function populateStockEntryBranches() {
  const sel = document.getElementById('stock-entry-branch');
  if (!sel) return;
  sel.innerHTML = '<option value="">Sin sucursal específica</option>';
  state.branches.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    const displayName = b.name.toLowerCase().startsWith(b.type.toLowerCase()) ? b.name : `${b.name} · ${capitalize(b.type)}`;
    opt.textContent = displayName;
    sel.appendChild(opt);
  });
}

// ==========================================================================
// 📋 TRAZABILIDAD DE MOVIMIENTOS
// ==========================================================================
async function loadMovementsTraceability() {
  try {
    const logs = await apiFetch('/branches/movements');
    const tbody = document.getElementById('table-movements-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-text">No hay movimientos de stock registrados.</td></tr>';
      return;
    }

    logs.forEach(log => {
      const date = new Date(log.createdAt || log.timestamp).toLocaleString();
      const isEntry = log.action === 'STOCK_ENTRY' || log.action === 'REGISTER_STOCK';
      const isExit = log.action === 'STOCK_EXIT';
      const isMove = log.action === 'STOCK_MOVEMENT';

      const typeLabel = isEntry ? '📥 Entrada' : isExit ? '📤 Salida' : isMove ? '🔄 Movimiento' : log.action;
      const typeClass = isEntry ? 'status-entregado' : isExit ? 'status-rechazado' : 'status-preparacion';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-size:0.8rem; color:var(--text-muted)">${date}</td>
        <td><span class="status-badge ${typeClass}">${typeLabel}</span></td>
        <td style="font-size:0.85rem">${log.details}</td>
        <td><strong>${log.User?.username || 'Sistema'}</strong></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error('Error cargando movimientos:', err);
  }
}

// ==========================================================================
// 🚩 START APP
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  initApp();
});
