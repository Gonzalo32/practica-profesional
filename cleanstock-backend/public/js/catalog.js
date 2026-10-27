// ==========================================================================
// CATÁLOGO DE PRODUCTOS Y CATEGORÍAS
// ==========================================================================

const catalogFilters = { search: '', category: '' };

async function loadCatalogPanel() {
  const tbody = document.getElementById('table-catalog-body');
  if (!state.products.length) setTableLoading(tbody, 7);
  try {
    await loadBaseData();
    fillSelect(document.getElementById('catalog-filter-category'), state.categories, { placeholder: 'Todas las Categorías', value: catalogFilters.category });
    document.getElementById('btn-open-create-product-modal').classList.toggle('hidden', !hasRole('Administrador', 'Usuario Responsable'));
    renderCatalogTable();
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}

document.getElementById('catalog-search-input')?.addEventListener('input', debounce((e) => {
  catalogFilters.search = e.target.value.toLowerCase().trim();
  renderCatalogTable();
}, 200));
document.getElementById('catalog-filter-category')?.addEventListener('change', (e) => {
  catalogFilters.category = e.target.value;
  renderCatalogTable();
});

function renderCatalogTable() {
  const tbody = document.getElementById('table-catalog-body');
  const canEdit = hasRole('Administrador', 'Usuario Responsable');
  const q = catalogFilters.search;

  const filtered = state.products.filter(p => {
    const haystack = [p.name, p.description, p.sku, p.barcode].join(' ').toLowerCase();
    const matchesSearch = !q || haystack.includes(q);
    const matchesCategory = !catalogFilters.category || String(p.categoryId) === String(catalogFilters.category);
    return matchesSearch && matchesCategory;
  });

  if (!filtered.length) {
    renderEmptyRow(tbody, 7, 'No se encontraron productos', 'Probá con otra búsqueda o categoría.');
    return;
  }

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>
        ${p.sku ? `<span class="badge">${escapeHtml(p.sku)}</span>` : '<span class="muted">—</span>'}
        ${p.barcode ? `<div class="cell-detail mono">${escapeHtml(p.barcode)}</div>` : ''}
      </td>
      <td><span class="badge">${escapeHtml(p.Category?.name || 'Sin categoría')}</span></td>
      <td><span class="cell-detail">${escapeHtml(p.description || 'Sin descripción')}</span></td>
      <td><span class="strong">${p.minimumStock || 0} unidades</span></td>
      <td>${p.costPrice ? formatMoney(p.costPrice) : '<span class="muted">Sin cargar</span>'}</td>
      <td>${canEdit ? `<button class="btn-icon" title="Editar producto" onclick="openProductModal('${p.id}')">${ICON_EDIT}</button>` : ''}</td>
    </tr>`).join('');
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
  document.getElementById('prod-barcode').value = product?.barcode || '';
  document.getElementById('prod-cost').value = product?.costPrice || '';

  document.getElementById('modal-product-title').textContent = product ? `Editar ${product.name}` : 'Agregar Nuevo Insumo al Catálogo';
  document.getElementById('btn-product-submit').textContent = product ? 'Guardar Cambios' : 'Agregar Producto';
  openModal('modal-product');
};
document.getElementById('btn-open-create-product-modal')?.addEventListener('click', () => openProductModal());

// El lector de códigos envía Enter: en este campo no tiene que enviar el formulario
document.getElementById('prod-barcode')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});

document.getElementById('form-product')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('prod-id').value;
  const costValue = document.getElementById('prod-cost').value;
  const data = {
    name: document.getElementById('prod-name').value.trim(),
    categoryId: document.getElementById('prod-category').value,
    description: document.getElementById('prod-description').value.trim(),
    minimumStock: parseInt(document.getElementById('prod-minstock').value, 10) || 0,
    sku: document.getElementById('prod-sku').value.trim() || null,
    barcode: document.getElementById('prod-barcode').value.trim() || null,
    costPrice: costValue === '' ? 0 : Number(costValue)
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
async function loadCategoriesPanel() {
  const tbody = document.getElementById('table-categories-body');
  setTableLoading(tbody, 3, 3);
  try {
    await loadBaseData();
    if (!state.categories.length) {
      renderEmptyRow(tbody, 3, 'No hay categorías registradas aún');
      return;
    }
    tbody.innerHTML = state.categories.map(cat => {
      const linked = state.products.filter(p => String(p.categoryId) === String(cat.id)).length;
      return `
        <tr>
          <td><strong>${escapeHtml(cat.name)}</strong></td>
          <td><span class="cell-detail">${escapeHtml(cat.description || 'Sin descripción')}</span></td>
          <td><span class="badge">${linked} insumos</span></td>
        </tr>`;
    }).join('');
  } catch (err) {
    renderErrorRow(tbody, 3, err.message);
  }
}

document.getElementById('btn-open-create-category-modal')?.addEventListener('click', () => {
  document.getElementById('form-create-category').reset();
  openModal('modal-create-category');
});

document.getElementById('form-create-category')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('cat-name').value.trim();
  const description = document.getElementById('cat-description').value.trim();
  try {
    await apiFetch('/inventory/categories', { method: 'POST', body: JSON.stringify({ name, description }) });
    showToast('Categoría creada correctamente.', 'success');
    closeModal('modal-create-category');
    await loadBaseData();
    if (state.currentTab === 'panel-categories') loadCategoriesPanel();
  } catch (err) {
    showToast(err.message, 'error');
  }
});
