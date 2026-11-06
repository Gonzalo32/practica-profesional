// ==========================================================================
// CATÁLOGO DE PRODUCTOS Y CATEGORÍAS
// ==========================================================================

const catalogFilters = { search: '', category: '', page: 1 };
const CATALOG_PER_PAGE = 10;

async function loadCatalogPanel() {
  const tbody = document.getElementById('table-catalog-body');
  if (!state.products.length) setTableLoading(tbody, 6);
  try {
    await loadBaseData();
    fillSelect(document.getElementById('catalog-filter-category'), state.categories, { placeholder: 'Todas las Categorías', value: catalogFilters.category });
    document.getElementById('btn-open-create-product-modal').classList.toggle('hidden', !hasRole('Administrador', 'Usuario Responsable'));
    renderCatalogTable();
  } catch (err) {
    renderErrorRow(tbody, 6, err.message);
  }
}

document.getElementById('catalog-search-input')?.addEventListener('input', debounce((e) => {
  catalogFilters.search = e.target.value.toLowerCase().trim();
  catalogFilters.page = 1;
  renderCatalogTable();
}, 200));
document.getElementById('catalog-filter-category')?.addEventListener('change', (e) => {
  catalogFilters.category = e.target.value;
  catalogFilters.page = 1;
  renderCatalogTable();
});

function renderCatalogTable() {
  const tbody = document.getElementById('table-catalog-body');
  const canEdit = hasRole('Administrador', 'Usuario Responsable');
  const q = catalogFilters.search;

  const filtered = state.products.filter(p => {
    const haystack = [p.name, p.description, p.sku].join(' ').toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const matchesCategory = !catalogFilters.category || String(p.categoryId) === String(catalogFilters.category);
    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    renderEmptyRow(tbody, 6, 'No se encontraron productos', 'Probá con otra búsqueda o categoría.');
    const pagContainer = document.getElementById('catalog-pagination');
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  const pageData = paginate(filtered, catalogFilters.page, CATALOG_PER_PAGE);
  catalogFilters.page = pageData.page;

  tbody.innerHTML = pageData.items.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong>${p.perishable ? '<div class="cell-detail">Con vencimiento</div>' : ''}</td>
      <td>
        ${p.sku ? `<span class="badge">${escapeHtml(p.sku)}</span>` : '<span class="muted">—</span>'}
      </td>
      <td><span class="badge">${escapeHtml(p.Category?.name || 'Sin categoría')}</span></td>
      <td><span class="cell-detail">${escapeHtml(p.description || 'Sin descripción')}</span></td>
      <td><span class="strong">${p.minimumStock || 0} unidades</span></td>
      <td>${canEdit ? `<button class="btn-icon" title="Editar producto" onclick="openProductModal('${p.id}')">${ICON_EDIT}</button>` : ''}</td>
    </tr>`).join('');

  renderPagination('catalog-pagination', pageData, 'productos', (page) => {
    catalogFilters.page = page;
    renderCatalogTable();
  });
}

// Modal único para crear y editar productos
window.openProductModal = async (productId = null) => {
  await ensureBaseData();
  const product = productId ? state.products.find(p => p.id === productId) : null;
  const form = document.getElementById('form-product');
  form.reset();

  fillSelect(document.getElementById('prod-category'), state.categories, { placeholder: 'Seleccioná rubro...', placeholderDisabled: true, value: product?.categoryId });
  document.getElementById('prod-id').value = product?.id || '';
  document.getElementById('prod-name').value = product?.name || '';
  document.getElementById('prod-description').value = product?.description || '';
  document.getElementById('prod-minstock').value = product ? (product.minimumStock || 0) : 10;
  document.getElementById('prod-sku').value = product?.sku || '';
  // Productos nuevos: sin vencimiento por defecto (lo más común en un almacén)
  document.getElementById('prod-perishable').checked = product ? product.perishable !== false : false;

  document.getElementById('modal-product-title').textContent = product ? `Editar ${product.name}` : 'Agregar Nuevo Insumo al Catálogo';
  document.getElementById('btn-product-submit').textContent = product ? 'Guardar Cambios' : 'Agregar Producto';
  openModal('modal-product');
};
document.getElementById('btn-open-create-product-modal')?.addEventListener('click', () => openProductModal());

document.getElementById('form-product')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const data = {
    name: document.getElementById('prod-name').value.trim(),
    categoryId: document.getElementById('prod-category').value,
    description: document.getElementById('prod-description').value.trim(),
    minimumStock: parseInt(document.getElementById('prod-minstock').value, 10) || 0,
    sku: document.getElementById('prod-sku').value.trim() || null,
    perishable: document.getElementById('prod-perishable').checked
  };

  try {
    await apiFetch(id ? `/inventory/products/${id}` : '/inventory/products', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    showToast(id ? 'Producto actualizado.' : 'Producto agregado al catálogo.', 'success');
    closeModal('modal-product');
    await loadBaseData();
    if (state.currentTab === 'panel-catalog') renderCatalogTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// --------------------------------------------------------------------------
// Categorías / rubros
// --------------------------------------------------------------------------
let categoriesPage = 1;
const CATEGORIES_PER_PAGE = 10;

async function loadCategoriesPanel() {
  const tbody = document.getElementById('table-categories-body');
  setTableLoading(tbody, 4, 3);
  try {
    await loadBaseData();
    renderCategoriesTable();
  } catch (err) {
    renderErrorRow(tbody, 4, err.message);
  }
}

function renderCategoriesTable() {
  const tbody = document.getElementById('table-categories-body');
  const canManage = hasRole('Administrador', 'Usuario Responsable');

  if (!state.categories.length) {
    renderEmptyRow(tbody, 4, 'No hay categorías registradas aún');
    const pagContainer = document.getElementById('categories-pagination');
    if (pagContainer) pagContainer.innerHTML = '';
    return;
  }

  const pageData = paginate(state.categories, categoriesPage, CATEGORIES_PER_PAGE);
  categoriesPage = pageData.page;

  tbody.innerHTML = pageData.items.map(cat => {
    const linked = state.products.filter(p => String(p.categoryId) === String(cat.id)).length;
    return `
      <tr>
        <td><strong>${escapeHtml(cat.name)}</strong></td>
        <td><span class="cell-detail">${escapeHtml(cat.description || 'Sin descripción')}</span></td>
        <td><span class="badge">${linked} insumo${linked === 1 ? '' : 's'}</span></td>
        <td>
          <div class="action-btn-group">
            <button class="btn-icon" title="Ver detalle" onclick="openViewCategoryModal('${cat.id}')">${ICON_VIEW}</button>
            ${canManage ? `
              <button class="btn-icon" title="Editar categoría" onclick="openCategoryModal('${cat.id}')">${ICON_EDIT}</button>
              <button class="btn-icon btn-icon-danger" title="Eliminar categoría" onclick="deleteCategory('${cat.id}')">${ICON_DELETE}</button>
            ` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  renderPagination('categories-pagination', pageData, 'categorías', (page) => {
    categoriesPage = page;
    renderCategoriesTable();
  });
}

window.openViewCategoryModal = (catId) => {
  const cat = state.categories.find(c => String(c.id) === String(catId));
  if (!cat) return;
  const linkedProducts = state.products.filter(p => String(p.categoryId) === String(cat.id));
  const productListHtml = linkedProducts.length
    ? linkedProducts.map(p => `<li><strong>${escapeHtml(p.name)}</strong>${p.sku ? ` (${escapeHtml(p.sku)})` : ''}</li>`).join('')
    : '<li class="muted">No hay insumos vinculados a esta categoría.</li>';

  document.getElementById('view-category-details-content').innerHTML = `
    <div class="span-2"><strong>Nombre:</strong> ${escapeHtml(cat.name)}</div>
    <div class="span-2"><strong>Descripción:</strong> ${escapeHtml(cat.description || 'Sin descripción')}</div>
    <div class="span-2">
      <strong>Insumos asociados (${linkedProducts.length}):</strong>
      <ul style="margin-top:6px; padding-left:20px; max-height:160px; overflow-y:auto;">
        ${productListHtml}
      </ul>
    </div>
  `;
  openModal('modal-view-category');
};

window.openCategoryModal = (catId = null) => {
  const cat = catId ? state.categories.find(c => String(c.id) === String(catId)) : null;
  document.getElementById('form-create-category').reset();
  document.getElementById('cat-id').value = cat ? cat.id : '';
  document.getElementById('cat-name').value = cat ? cat.name : '';
  document.getElementById('cat-description').value = cat ? (cat.description || '') : '';
  document.getElementById('modal-category-title').textContent = cat ? `Editar Categoría: ${cat.name}` : 'Crear Nueva Categoría (Rubro)';
  document.getElementById('btn-category-submit').textContent = cat ? 'Guardar Cambios' : 'Agregar Rubro';
  openModal('modal-create-category');
};

document.getElementById('btn-open-create-category-modal')?.addEventListener('click', () => openCategoryModal());

window.deleteCategory = async (catId) => {
  const cat = state.categories.find(c => String(c.id) === String(catId));
  if (!cat) return;
  const ok = await confirmDialog({
    title: 'Eliminar Categoría',
    message: `¿Estás seguro de que querés eliminar la categoría "${cat.name}"?`,
    confirmText: 'Eliminar',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/inventory/categories/${catId}`, { method: 'DELETE' });
    showToast('Categoría eliminada correctamente.', 'success');
    await loadBaseData();
    loadCategoriesPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

document.getElementById('form-create-category')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('cat-id').value;
  const name = document.getElementById('cat-name').value.trim();
  const description = document.getElementById('cat-description').value.trim();
  try {
    if (id) {
      await apiFetch(`/inventory/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) });
      showToast('Categoría actualizada correctamente.', 'success');
    } else {
      await apiFetch('/inventory/categories', { method: 'POST', body: JSON.stringify({ name, description }) });
      showToast('Categoría creada correctamente.', 'success');
    }
    closeModal('modal-create-category');
    await loadBaseData();
    if (state.currentTab === 'panel-categories') loadCategoriesPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
});
