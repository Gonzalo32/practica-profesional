// ==========================================================================
// MARCAS
// Se eligen de una lista con buscador (no un desplegable infinito) y no se
// pueden duplicar escritas de otra forma: "AYUDIN", "ayudín" y "Ayudin " son la misma.
// ==========================================================================

// Igual que en el servidor: sin mayúsculas, tildes ni espacios de más
const normalizeBrandText = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cuántas letras hay que cambiar para pasar de una palabra a otra (detecta errores de tipeo)
function brandDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Crea una marca. Si ya existe escrita de otra forma, devuelve la existente.
// Si se parece a otra, pregunta antes de crearla.
async function createBrandSafely(name) {
  const send = (force) => apiFetch('/inventory/brands', { method: 'POST', body: JSON.stringify({ name, force }) });
  try {
    return await send(false);
  } catch (err) {
    const data = err.data || {};
    if (data.existing) {
      showToast(`La marca "${data.existing.name}" ya existía: se usa esa.`, 'info');
      return data.existing;
    }
    if (data.similar?.length) {
      const ok = await confirmDialog({
        title: 'Hay una marca parecida',
        html: `<p>Ya existe ${data.similar.map(s => `<strong>${escapeHtml(s.name)}</strong>`).join(' y ')}. ¿Es un error de tipeo?</p>
               <p class="hint-text">Si es la misma marca, cancelá y elegila de la lista. Si es otra marca distinta, creala igual.</p>`,
        confirmText: `Crear "${name}" igual`
      });
      if (!ok) return null;
      return send(true);
    }
    throw err;
  }
}

// --------------------------------------------------------------------------
// Buscador de marcas reutilizable: escribir para buscar, máximo 8 resultados,
// sugerencias por error de tipeo y opción de crear la marca si no existe.
// Se usa en el producto, en el ingreso de stock y en las provisiones.
// --------------------------------------------------------------------------
const BRAND_PICKER_LIMIT = 8;

function createBrandPicker(host, { placeholder = 'Buscar marca...', onChange = null } = {}) {
  host.classList.add('select-search-container', 'brand-picker');
  host.innerHTML = `
    <input type="text" class="select-search-input" placeholder="${escapeHtml(placeholder)}" autocomplete="off" aria-label="Marca">
    <div class="select-search-dropdown hidden"></div>`;
  const input = host.querySelector('input');
  const dropdown = host.querySelector('.select-search-dropdown');
  let selectedId = '';

  const select = (brandId, { silent = false } = {}) => {
    const brand = state.brands.find(b => String(b.id) === String(brandId));
    selectedId = brand ? String(brand.id) : '';
    input.value = brand ? brand.name : '';
    dropdown.classList.add('hidden');
    if (!silent && onChange) onChange(selectedId, brand || null);
  };

  const render = () => {
    const typed = input.value.trim();
    const q = normalizeBrandText(typed);
    const matches = state.brands
      .filter(b => !q || normalizeBrandText(b.name).includes(q))
      .sort((a, b) => normalizeBrandText(a.name).indexOf(q) - normalizeBrandText(b.name).indexOf(q) || a.name.localeCompare(b.name));
    const exact = state.brands.find(b => normalizeBrandText(b.name) === q);
    // Parecidas que no contienen lo escrito (posibles errores de tipeo: "ayudim" → "Ayudín")
    const similar = q.length >= 3 && !exact
      ? state.brands.filter(b => !matches.includes(b) && brandDistance(q, normalizeBrandText(b.name)) <= (q.length <= 4 ? 1 : 2)).slice(0, 3)
      : [];

    const item = (b, sub = '') => `
      <div class="select-search-item ${selectedId === String(b.id) ? 'highlighted' : ''}" data-id="${b.id}">
        <span class="select-search-item-name">${escapeHtml(b.name)}</span>
        ${sub ? `<span class="select-search-item-sub">${sub}</span>` : ''}
      </div>`;
    const parts = [];
    if (selectedId) parts.push('<div class="select-search-item" data-id=""><span class="select-search-item-name muted">Sin marca</span></div>');
    parts.push(...matches.slice(0, BRAND_PICKER_LIMIT).map(b => item(b)));
    if (matches.length > BRAND_PICKER_LIMIT) {
      parts.push(`<div class="select-search-more">Hay ${matches.length - BRAND_PICKER_LIMIT} más: seguí escribiendo para achicar la búsqueda</div>`);
    }
    parts.push(...similar.map(b => item(b, '¿Quisiste decir esta?')));
    if (typed && !exact && hasRole('Administrador', 'Usuario Responsable')) {
      parts.push(`<div class="select-search-item select-search-create" data-create="1"><span class="select-search-item-name">+ Crear la marca "${escapeHtml(typed)}"</span></div>`);
    }
    if (!parts.length) parts.push('<div class="select-search-more">No hay marcas cargadas todavía. Escribí una para crearla.</div>');
    dropdown.innerHTML = parts.join('');
    dropdown.classList.remove('hidden');
  };

  input.addEventListener('focus', render);
  input.addEventListener('input', () => {
    if (selectedId) {
      selectedId = '';
      if (onChange) onChange('', null);
    }
    render();
  });
  // Al salir sin elegir, el texto vuelve a la marca elegida (no queda texto suelto sin marca)
  input.addEventListener('blur', () => setTimeout(() => {
    if (!host.contains(document.activeElement)) {
      const brand = state.brands.find(b => String(b.id) === selectedId);
      input.value = brand ? brand.name : '';
    }
  }, 200));

  dropdown.addEventListener('mousedown', (e) => e.preventDefault()); // que el clic no le saque el foco al campo
  dropdown.addEventListener('click', async (e) => {
    const el = e.target.closest('.select-search-item');
    if (!el) return;
    if (el.dataset.create) {
      const name = input.value.replace(/\s+/g, ' ').trim();
      try {
        const brand = await createBrandSafely(name);
        if (!brand) return render();
        if (!state.brands.some(b => b.id === brand.id)) state.brands.push({ ...brand, products: 0 });
        select(brand.id);
        showToast(`Marca "${brand.name}" lista para usar.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }
    select(el.dataset.id);
  });

  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) dropdown.classList.add('hidden');
  });

  return {
    get value() { return selectedId || null; },
    get name() { return state.brands.find(b => String(b.id) === selectedId)?.name || null; },
    set: (brandId) => select(brandId, { silent: true }),
    clear: () => select('', { silent: true })
  };
}

// Campo "Marca" del formulario de producto
let productBrandPicker = null;
function setBrandPickerValue(brandId) {
  const host = document.getElementById('prod-brand-picker');
  if (!host) return;
  if (!productBrandPicker) productBrandPicker = createBrandPicker(host);
  productBrandPicker.set(brandId);
}

// --------------------------------------------------------------------------
// Menú "Marcas": alta, renombrar y eliminar
// --------------------------------------------------------------------------
let brandsPage = 1;
let brandsSearch = '';
const BRANDS_PER_PAGE = 10;

async function loadBrandsPanel() {
  const tbody = document.getElementById('table-brands-body');
  setTableLoading(tbody, 3, 3);
  try {
    state.brands = await apiFetch('/inventory/brands');
    document.getElementById('btn-open-brand-modal').classList.toggle('hidden', !hasRole('Administrador', 'Usuario Responsable'));
    renderBrandsTable();
  } catch (err) {
    renderErrorRow(tbody, 3, err.message);
  }
}

function renderBrandsTable() {
  const tbody = document.getElementById('table-brands-body');
  const canManage = hasRole('Administrador', 'Usuario Responsable');
  const q = normalizeBrandText(brandsSearch);
  const list = state.brands.filter(b => !q || normalizeBrandText(b.name).includes(q));
  if (!list.length) {
    renderEmptyRow(tbody, 3, q ? 'Sin resultados' : 'Todavía no hay marcas', q ? '' : 'Agregá una o creala directamente desde el formulario de un producto.');
    document.getElementById('brands-pagination').innerHTML = '';
    return;
  }
  const pageData = paginate(list, brandsPage, BRANDS_PER_PAGE);
  brandsPage = pageData.page;
  tbody.innerHTML = pageData.items.map(b => `
    <tr>
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td><span class="badge">${b.products || 0} producto${b.products === 1 ? '' : 's'}</span></td>
      <td>
        <div class="action-btn-group">
          ${canManage ? `
            <button class="btn-icon" title="Renombrar" onclick="openBrandModal('${b.id}')">${ICON_EDIT}</button>
            <button class="btn-icon btn-icon-danger" title="Eliminar" onclick="deleteBrand('${b.id}')">${ICON_DELETE}</button>` : ''}
        </div>
      </td>
    </tr>`).join('');
  renderPagination('brands-pagination', pageData, 'marcas', (page) => {
    brandsPage = page;
    renderBrandsTable();
  });
}

document.getElementById('brand-search')?.addEventListener('input', debounce((e) => {
  brandsSearch = e.target.value;
  brandsPage = 1;
  renderBrandsTable();
}, 200));

window.openBrandModal = (brandId = null) => {
  const brand = brandId ? state.brands.find(b => b.id === brandId) : null;
  document.getElementById('form-brand').reset();
  document.getElementById('brand-id').value = brand?.id || '';
  document.getElementById('brand-name').value = brand?.name || '';
  document.getElementById('modal-brand-title').textContent = brand ? `Renombrar ${brand.name}` : 'Agregar Marca';
  document.getElementById('btn-brand-submit').textContent = brand ? 'Guardar' : 'Agregar Marca';
  openModal('modal-brand');
};
document.getElementById('btn-open-brand-modal')?.addEventListener('click', () => openBrandModal());

document.getElementById('form-brand')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('brand-id').value;
  const name = document.getElementById('brand-name').value.replace(/\s+/g, ' ').trim();
  if (!name) return showToast('Escribí el nombre de la marca.', 'error');
  try {
    if (id) {
      await apiFetch(`/inventory/brands/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      showToast('Marca renombrada. Se actualizó en todos sus productos.', 'success');
    } else {
      const brand = await createBrandSafely(name);
      if (!brand) return;
      showToast(`Marca "${brand.name}" agregada.`, 'success');
    }
    closeModal('modal-brand');
    await loadBaseData();
    if (state.currentTab === 'panel-brands') loadBrandsPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.deleteBrand = async (brandId) => {
  const brand = state.brands.find(b => b.id === brandId);
  if (!brand) return;
  const ok = await confirmDialog({
    title: 'Eliminar marca',
    message: `¿Eliminar la marca "${brand.name}"? Solo se puede si ningún producto la usa.`,
    confirmText: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/inventory/brands/${brandId}`, { method: 'DELETE' });
    showToast('Marca eliminada.', 'success');
    loadBrandsPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
};
