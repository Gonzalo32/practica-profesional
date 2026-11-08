const API_BASE = '/api';

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

const state = {
  token: getStoredToken(),
  user: getStoredUser(),
  products: [],
  categories: [],
  brands: [],
  branches: [],
  suppliers: [],
  settings: null,
  currentTab: ''
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function hasRole(...roles) {
  return !!state.user && roles.includes(state.user.role);
}

function userBranchId() {
  if (isSingleBranch()) return state.settings.mainBranchId;
  return state.user?.branchId || state.user?.EspacioFisico?.id || null;
}

function getBranchName(branchIdOrObj) {
  if (!branchIdOrObj) return 'Sin sucursal';
  if (typeof branchIdOrObj === 'object' && branchIdOrObj.name) return branchIdOrObj.name;
  const idStr = String(branchIdOrObj);
  const found = (state.branches || []).find(b => String(b.id) === idStr || String(b._id) === idStr);
  return found ? found.name : idStr;
}

function getProductName(productIdOrObj) {
  if (!productIdOrObj) return 'Sin producto';
  if (typeof productIdOrObj === 'object' && productIdOrObj.name) return productIdOrObj.name;
  const idStr = String(productIdOrObj);
  const found = (state.products || []).find(p => String(p.id) === idStr || String(p._id) === idStr);
  return found ? found.name : idStr;
}

function branchLabel(b) {
  if (!b) return '';
  const type = b.type || '';
  return b.name.toLowerCase().startsWith(type.toLowerCase()) ? b.name : `${b.name} · ${capitalize(type)}`;
}

function getUserDisplayName(userOrObj) {
  if (!userOrObj) return 'Sistema';
  if (typeof userOrObj === 'string') return userOrObj;
  if (userOrObj.lastName && userOrObj.firstName) return `${userOrObj.lastName} ${userOrObj.firstName}`;
  if (userOrObj.lastName) return userOrObj.lastName;
  if (userOrObj.firstName) return userOrObj.firstName;
  return userOrObj.username || userOrObj.email || 'Usuario';
}

function formatLogDetails(details) {
  if (!details) return '';
  let text = escapeHtml(details);
  (state.products || []).forEach(p => {
    if (p.id && text.includes(p.id)) text = text.replaceAll(p.id, `"${escapeHtml(p.name)}"`);
  });
  (state.branches || []).forEach(b => {
    if (b.id && text.includes(b.id)) text = text.replaceAll(b.id, `"${escapeHtml(b.name)}"`);
  });
  return text;
}

function formatOrderCode(order) {
  if (!order) return '';
  if (order.code) return order.code;
  if (order.number) return `PED-${String(order.number).padStart(4, '0')}`;
  return `#${String(order.id || order._id || '').substring(0, 8).toUpperCase()}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR').format(Number(value) || 0);
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

const STATUS_LABELS = {
  PENDIENTE_VALIDACION: 'En revisión',
  PENDIENTE: 'Pendiente',
  EN_PREPARACION: 'En preparación',
  DESPACHADO: 'Despachado',
  ENTREGADO: 'Entregado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado'
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function getStatusClass(status) {
  if (status === 'PENDIENTE_VALIDACION' || status === 'PENDIENTE') return 'pendiente';
  if (status === 'EN_PREPARACION') return 'preparacion';
  if (status === 'DESPACHADO') return 'despachado';
  if (status === 'ENTREGADO') return 'entregado';
  if (status === 'CANCELADO') return 'cancelado';
  return 'rechazado';
}

function statusBadge(status) {
  return `<span class="status-badge status-${getStatusClass(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

function debounce(fn, wait = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers }
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    if (path === '/auth/login') {
      throw new Error(data.message || 'Usuario o contraseña incorrectos');
    }
    showToast('Sesión vencida. Por favor, inicia sesión de nuevo.', 'error');
    logout();
    throw new Error('No autorizado');
  }

  if (!response.ok) {
    const error = new Error(data.message || 'Ocurrió un error en la solicitud');
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function loadBaseData() {
  try {
    const [products, categories, branches, brands] = await Promise.all([
      apiFetch('/inventory/products'),
      apiFetch('/inventory/categories'),
      apiFetch('/branches'),
      apiFetch('/inventory/brands').catch(() => [])
    ]);
    state.products = products;
    state.categories = categories;
    state.brands = brands;
    state.branches = branches;
  } catch (err) {
    console.error('Error cargando datos base:', err.message);
  }
}

async function ensureBaseData() {
  if (!state.products.length || !state.branches.length || !state.categories.length) {
    await loadBaseData();
  }
}

async function loadSuppliers() {
  if (!hasRole('Administrador', 'Usuario Responsable', 'Proveedor')) return [];
  state.suppliers = await apiFetch('/suppliers');
  return state.suppliers;
}

function showToast(message, type = 'info', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `<span class="toast-text"></span><button type="button" class="toast-close" aria-label="Cerrar">&times;</button>`;
  toast.querySelector('.toast-text').textContent = message;
  const remove = () => {
    toast.classList.add('toast-leaving');
    setTimeout(() => toast.remove(), 250);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  container.appendChild(toast);
  while (container.children.length > 4) container.firstElementChild.remove();
  setTimeout(remove, duration);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  const focusable = modal.querySelector('input:not([type=hidden]):not([readonly]), select, textarea');
  if (focusable) setTimeout(() => focusable.focus(), 50);
}

function closeModal(id) {
  const modal = typeof id === 'string' ? document.getElementById(id) : id;
  if (!modal) return;
  modal.classList.add('hidden');
  modal.dispatchEvent(new CustomEvent('modal:closed'));
}

document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close-modal]');
  if (closer) {
    closeModal(closer.closest('.modal'));
    return;
  }
  if (e.target.classList && e.target.classList.contains('modal') && e.target.id !== 'modal-confirm') {
    closeModal(e.target);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = [...document.querySelectorAll('.modal:not(.hidden)')].pop();
  if (open && open.id !== 'modal-confirm') closeModal(open);
});

function confirmDialog({ title = 'Confirmar', message = '', html = '', confirmText = 'Confirmar', danger = false } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('modal-confirm');
    const accept = document.getElementById('confirm-accept');
    document.getElementById('confirm-title').textContent = title;
    const body = document.getElementById('confirm-message');
    if (html) body.innerHTML = html;
    else body.textContent = message;
    accept.textContent = confirmText;
    accept.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

    const cleanup = (result) => {
      modal.classList.add('hidden');
      accept.removeEventListener('click', onAccept);
      modal.querySelectorAll('[data-confirm-cancel]').forEach(b => b.removeEventListener('click', onCancel));
      modal.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onAccept = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };
    const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };

    accept.addEventListener('click', onAccept);
    modal.querySelectorAll('[data-confirm-cancel]').forEach(b => b.addEventListener('click', onCancel));
    modal.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
    modal.classList.remove('hidden');
    accept.focus();
  });
}

function setTableLoading(tbody, cols, rows = 4) {
  if (!tbody) return;
  tbody.innerHTML = Array.from({ length: rows }, () => `
    <tr class="skeleton-row">${Array.from({ length: cols }, () => '<td><span class="skeleton"></span></td>').join('')}</tr>
  `).join('');
}

const ICON_VIEW = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const ICON_EDIT = '<svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';

const EMPTY_ICON ='<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>';

function renderEmptyRow(tbody, cols, title, desc = '') {
  if (!tbody) return;
  tbody.innerHTML = `
    <tr>
      <td colspan="${cols}">
        <div class="empty-state-wrapper">
          <div class="empty-state-icon">${EMPTY_ICON}</div>
          <div class="empty-state-title">${escapeHtml(title)}</div>
          ${desc ? `<div class="empty-state-desc">${escapeHtml(desc)}</div>` : ''}
        </div>
      </td>
    </tr>`;
}

function renderErrorRow(tbody, cols, message) {
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="${cols}" class="empty-text text-danger">No se pudo cargar: ${escapeHtml(message)}</td></tr>`;
}

function renderPagination(containerId, { page, pages, total }, label, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!total) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = `
    <span class="pagination-info">${formatNumber(total)} ${escapeHtml(label)}</span>
    <div class="pagination-controls">
      <button type="button" class="btn btn-secondary btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="page-number">Página ${page} de ${pages}</span>
      <button type="button" class="btn btn-secondary btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente</button>
    </div>`;
  container.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => onChange(parseInt(btn.dataset.page, 10)));
  });
}

function paginate(list, page, perPage) {
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return {
    items: list.slice((current - 1) * perPage, current * perPage),
    page: current,
    pages,
    total: list.length
  };
}

function fillSelect(select, items, { placeholder = null, placeholderDisabled = false, value = '', getValue = i => i.id, getLabel = i => i.name } = {}) {
  if (!select) return;
  const current = value || select.value;
  select.innerHTML = '';
  if (placeholder !== null) {
    const opt = new Option(placeholder, '');
    if (placeholderDisabled) opt.disabled = true;
    select.appendChild(opt);
  }
  items.forEach(item => select.appendChild(new Option(getLabel(item), getValue(item))));
  if (current && [...select.options].some(o => o.value === String(current))) select.value = String(current);
  else if (placeholder !== null) select.selectedIndex = 0;
}

const SELECT_SEARCH_MAX = 50;
const normalizeSearchText = (text) => String(text || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function makeSelectSearchable(select, { placeholder = 'Buscar artículo...', inline = false } = {}) {
  if (!select || select._searchable) return;

  const wrap = document.createElement('div');
  wrap.className = 'select-search-container';
  if (select.classList.contains('picker-grow')) wrap.classList.add('picker-grow');
  if (inline) Object.assign(wrap.style, { width: 'auto', minWidth: '220px', flex: '1 1 220px' });
  wrap.innerHTML = `
    <input type="text" class="select-search-input" autocomplete="off">
    <button type="button" class="select-search-toggle" tabindex="-1" aria-label="Ver opciones">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <div class="select-search-dropdown hidden"></div>`;
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.style.display = 'none';

  const input = wrap.querySelector('.select-search-input');
  const toggle = wrap.querySelector('.select-search-toggle');
  const dropdown = wrap.querySelector('.select-search-dropdown');
  if (select.id) input.id = `${select.id}-search`;
  let shown = [];
  let highlighted = -1;

  const sync = () => {
    const first = select.options[0];
    const opt = select.options[select.selectedIndex];
    input.value = opt && opt.value ? opt.text : '';
    input.placeholder = first && !first.value ? first.text : placeholder;
    input.disabled = select.disabled;
  };
  const close = () => {
    dropdown.classList.add('hidden');
    highlighted = -1;
  };
  const paintHighlight = () => {
    dropdown.querySelectorAll('.select-search-item').forEach((el, i) => el.classList.toggle('highlighted', i === highlighted));
    dropdown.querySelector('.select-search-item.highlighted')?.scrollIntoView({ block: 'nearest' });
  };
  const render = (query) => {
    const q = normalizeSearchText(query);
    const all = [...select.options].filter(o => o.value && !o.disabled);
    const matches = q ? all.filter(o => normalizeSearchText(o.text).includes(q)) : all;
    shown = matches.slice(0, SELECT_SEARCH_MAX);
    dropdown.innerHTML = shown.length
      ? shown.map((o, i) => `<div class="select-search-item" data-index="${i}"><span class="select-search-item-name">${escapeHtml(o.text)}</span></div>`).join('')
        + (matches.length > shown.length ? `<div class="select-search-more">Hay ${matches.length - shown.length} más: escribí para filtrar</div>` : '')
      : '<div class="select-search-more">Sin resultados</div>';
    highlighted = q && shown.length ? 0 : shown.findIndex(o => o.value === select.value);
    paintHighlight();
    dropdown.classList.remove('hidden');
  };
  const setValue = (value) => {
    const changed = select.value !== value;
    select.value = value;
    sync();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const choose = (opt) => {
    setValue(opt.value);
    close();
  };

  for (const prop of ['value', 'selectedIndex']) {
    const native = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    Object.defineProperty(select, prop, {
      configurable: true,
      get() { return native.get.call(this); },
      set(v) { native.set.call(this, v); sync(); }
    });
  }
  new MutationObserver(sync).observe(select, { childList: true, attributes: true, attributeFilter: ['disabled'] });

  input.addEventListener('focus', () => { input.select(); render(''); });
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('blur', () => {
    close();
    if (!input.value.trim() && select.value) setValue('');
    else sync();
  });
  input.addEventListener('keydown', (e) => {
    const open = !dropdown.classList.contains('hidden');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return render('');
      if (!shown.length) return;
      highlighted = e.key === 'ArrowDown'
        ? Math.min(shown.length - 1, highlighted + 1)
        : Math.max(0, highlighted - 1);
      paintHighlight();
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const opt = shown[highlighted] || (shown.length === 1 ? shown[0] : null);
      if (opt) choose(opt);
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
      sync();
    }
  });
  dropdown.addEventListener('mousedown', (e) => e.preventDefault());
  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.select-search-item');
    if (item) choose(shown[Number(item.dataset.index)]);
  });
  toggle.addEventListener('mousedown', (e) => e.preventDefault());
  toggle.addEventListener('click', () => {
    if (input.disabled) return;
    if (dropdown.classList.contains('hidden')) input.focus();
    else close();
  });

  select._searchable = { sync, close };
  sync();
}

function operableBranches() {
  if (isSingleBranch()) return state.branches.filter(b => String(b.id) === String(state.settings.mainBranchId));
  if (hasRole('Administrador')) return state.branches;
  const own = userBranchId();
  return state.branches.filter(b => String(b.id) === String(own));
}

function entryBranches() {
  return operableBranches();
}

function isSingleBranch() {
  return !!state.settings?.singleBranchMode && !!state.settings?.mainBranchId;
}

async function loadSettings() {
  try {
    state.settings = await apiFetch('/settings');
  } catch (err) {
    state.settings = { businessName: '', singleBranchMode: false, mainBranchId: null };
  }
  applySettingsToUI();
  return state.settings;
}

function applySettingsToUI() {
  document.body.classList.toggle('single-branch', isSingleBranch());
}

function applyThemeLabels() {
  const theme = document.documentElement.getAttribute('data-theme');
  document.querySelectorAll('[data-theme-toggle] .theme-label').forEach(el => {
    el.textContent = theme === 'light' ? 'Modo oscuro' : 'Modo claro';
  });
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-theme-toggle]')) return;
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('cleanstock_theme', next); } catch (err) {}
  applyThemeLabels();
  document.dispatchEvent(new CustomEvent('theme:changed'));
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || el.id === 'username') return;
  const isTextInput = (el.tagName === 'INPUT' && (!el.type || el.type === 'text' || el.type === 'search')) || el.tagName === 'TEXTAREA';
  if (!isTextInput || el.readOnly || el.disabled) return;

  const val = el.value;
  if (!val) return;
  const capitalized = val.replace(/(^\s*[a-záéíóúñü])|([.\n]\s+[a-záéíóúñü])/g, m => m.toUpperCase());
  if (capitalized !== val) {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = capitalized;
    if (typeof start === 'number' && typeof end === 'number') {
      try { el.setSelectionRange(start, end); } catch {}
    }
  }
}, true);
