// ==========================================================================
// SESIÓN, NAVEGACIÓN POR ROL Y CAMBIO DE PANELES
// ==========================================================================

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const submit = loginForm.querySelector('button[type=submit]');
    submit.disabled = true;

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('cleanstock_token', data.token);
      localStorage.setItem('cleanstock_user', JSON.stringify(data.user));

      showToast(`¡Bienvenido, ${getUserDisplayName(state.user)}!`, 'success');
      loginForm.reset();
      initApp();
    } catch (err) {
      localStorage.removeItem('cleanstock_token');
      localStorage.removeItem('cleanstock_user');
      showToast(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
}

document.getElementById('btn-logout')?.addEventListener('click', logout);

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('cleanstock_token');
  localStorage.removeItem('cleanstock_user');
  stopNotificationPolling();
  document.body.classList.remove('single-branch');

  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('main-view').classList.add('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  if (loginForm) loginForm.reset();
}

function updateSidebarUserProfile() {
  if (!state.user) return;

  const usernameEl = document.getElementById('profile-username');
  const roleEl = document.getElementById('profile-role');
  const avatarEl = document.getElementById('profile-avatar');
  const displayName = getUserDisplayName(state.user);

  usernameEl.textContent = displayName;
  usernameEl.title = `${displayName} (${state.user.email || state.user.username || ''})`;

  roleEl.textContent = state.user.role || 'Usuario';
  roleEl.className = 'user-role badge';
  const roleClass = {
    Administrador: 'badge-admin',
    Solicitante: 'badge-solicita',
    Despachante: 'badge-primary',
    'Usuario Responsable': 'badge-warning',
    Proveedor: 'badge-branch'
  }[state.user.role];
  if (roleClass) roleEl.classList.add(roleClass);

  const { firstName, lastName, username } = state.user;
  let initials;
  if (lastName && firstName) initials = `${lastName.charAt(0)}${firstName.charAt(0)}`;
  else if (firstName) initials = firstName.substring(0, 2);
  else if (lastName) initials = lastName.substring(0, 2);
  else initials = (username || 'U').charAt(0);
  avatarEl.textContent = initials.toUpperCase();
}

async function initApp() {
  if (!state.token || !state.user) {
    logout();
    return;
  }

  document.getElementById('login-view').classList.add('hidden');
  document.getElementById('main-view').classList.remove('hidden');
  updateSidebarUserProfile();

  // Refresca el perfil (sucursal, proveedor) por si cambió desde el último login
  try {
    const freshUser = await apiFetch('/auth/me');
    state.user = { ...state.user, ...freshUser };
    localStorage.setItem('cleanstock_user', JSON.stringify(state.user));
    updateSidebarUserProfile();
  } catch (err) {
    if (!state.token) return; // sesión vencida: apiFetch ya volvió al login
    // El usuario de la sesión guardada ya no existe (por ejemplo, se reinició la base)
    if (err.message === 'Usuario no encontrado') {
      logout();
      return;
    }
  }

  await Promise.all([loadSettings(), loadBaseData()]);
  renderNavigation();
  startNotificationPolling();
}

// --------------------------------------------------------------------------
// Navegación según el rol
// --------------------------------------------------------------------------
const NAV_ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  admin: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  catalog: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  categories: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  branches: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>',
  'stock-view': '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  expirations: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  counts: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  suppliers: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  solicitante: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  responsable: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  despachante: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'
};

const NAV_BY_ROLE = {
  Administrador: [
    ['home', 'Inicio'],
    ['admin', 'Control Administrador'],
    ['catalog', 'Catálogo'],
    ['categories', 'Categorías'],
    ['branches', 'Sucursales'],
    ['stock-view', 'Stock por Sucursal'],
    ['expirations', 'Vencimientos'],
    ['counts', 'Conteo de Inventario'],
    ['suppliers', 'Proveedores'],
    ['solicitante', 'Pedidos'],
    ['responsable', 'Ingresos y Egresos'],
    ['despachante', 'Panel Despacho']
  ],
  Solicitante: [
    ['solicitante', 'Catálogo y Pedidos']
  ],
  'Usuario Responsable': [
    ['home', 'Inicio'],
    ['responsable', 'Ingresos y Egresos'],
    ['stock-view', 'Stock de mi Sucursal'],
    ['expirations', 'Vencimientos'],
    ['counts', 'Conteo de Inventario'],
    ['suppliers', 'Proveedores'],
    ['catalog', 'Catálogo'],
    ['categories', 'Categorías']
  ],
  Despachante: [
    ['despachante', 'Panel Despacho']
  ],
  Proveedor: [
    ['suppliers', 'Mis Órdenes de Compra']
  ]
};

// Secciones que no aplican a un comercio de un solo local
const MULTI_BRANCH_SECTIONS = ['branches', 'solicitante', 'despachante'];

function navigationForUser() {
  let tabs = NAV_BY_ROLE[state.user.role] || [];
  if (isSingleBranch() && ['Administrador', 'Usuario Responsable'].includes(state.user.role)) {
    tabs = tabs
      .filter(([id]) => !MULTI_BRANCH_SECTIONS.includes(id))
      .map(([id, label]) => (id === 'stock-view' ? [id, 'Stock del Local'] : [id, label]));
  }
  return tabs;
}

function renderNavigation() {
  const nav = document.getElementById('main-navigation');
  nav.innerHTML = '';
  const tabs = navigationForUser();

  tabs.forEach(([id, label], index) => {
    const tabEl = document.createElement('button');
    tabEl.type = 'button';
    tabEl.className = `tab-link ${index === 0 ? 'active' : ''}`;
    tabEl.dataset.panel = `panel-${id}`;
    tabEl.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${NAV_ICONS[id] || ''}</svg><span></span>`;
    tabEl.querySelector('span').textContent = label;
    tabEl.addEventListener('click', () => switchTab(tabEl));
    nav.appendChild(tabEl);
  });

  if (tabs.length > 0) {
    activatePanel(`panel-${tabs[0][0]}`);
  } else {
    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
    showToast('Tu rol no tiene secciones asignadas. Contactá al administrador.', 'info');
  }
}

function switchTab(activeTabEl) {
  document.querySelectorAll('.tab-link').forEach(el => el.classList.remove('active'));
  activeTabEl.classList.add('active');
  activatePanel(activeTabEl.dataset.panel);
}

// Abre un panel desde otro lugar (ej: un aviso de la campanita)
function goToPanel(panelId) {
  const tab = document.querySelector(`.tab-link[data-panel="${panelId}"]`);
  if (tab) switchTab(tab);
}

function activatePanel(panelId) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(panelId)?.classList.remove('hidden');
  state.currentTab = panelId;
  refreshPanelData(panelId);
}

function refreshPanelData(panelId) {
  const loaders = {
    'panel-home': loadHomePanel,
    'panel-admin': loadAdminPanel,
    'panel-catalog': loadCatalogPanel,
    'panel-categories': loadCategoriesPanel,
    'panel-branches': loadBranchesPanel,
    'panel-stock-view': loadBranchStockPanel,
    'panel-expirations': loadExpirationsPanel,
    'panel-counts': loadCountsPanel,
    'panel-suppliers': loadSuppliersPanel,
    'panel-solicitante': loadSolicitanteOrders,
    'panel-responsable': loadResponsablePanel,
    'panel-despachante': loadDespachantePanel
  };
  const loader = loaders[panelId];
  if (loader) {
    Promise.resolve(loader()).catch(err => showToast(err.message, 'error'));
  }
}

// Sub-pestañas dentro de un panel (Usuarios / Aprobaciones / ...)
const subTabLoaders = {};
function onSubTab(subpanelId, loader) {
  subTabLoaders[subpanelId] = loader;
}

document.querySelectorAll('.btn-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const parentPanel = btn.closest('.panel');
    parentPanel.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    parentPanel.querySelectorAll('.subpanel').forEach(sp => sp.classList.add('hidden'));
    const subpanelId = `subpanel-${btn.dataset.sub}`;
    document.getElementById(subpanelId).classList.remove('hidden');
    if (subTabLoaders[subpanelId]) subTabLoaders[subpanelId]();
  });
});
