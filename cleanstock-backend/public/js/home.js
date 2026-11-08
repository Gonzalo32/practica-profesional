function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

async function loadHomePanel() {
  const name = state.user?.firstName || getUserDisplayName(state.user);
  document.getElementById('home-greeting').textContent = `${greeting()}, ${name}`;
  const ownBranch = userBranchId();
  const ownBranchName = state.user?.EspacioFisico?.name || (ownBranch ? getBranchName(ownBranch) : '');
  const place = isSingleBranch()
    ? (state.settings.businessName || state.settings.mainBranch?.name)
    : (ownBranch ? ownBranchName : 'Todas las sucursales');
  document.getElementById('home-subtitle').textContent = `${place || ''} — ¿Qué desea hacer?`;

  const lowList = document.getElementById('home-list-low');
  const expList = document.getElementById('home-list-exp');
  lowList.innerHTML = '<li class="home-list-empty">Cargando...</li>';
  expList.innerHTML = '<li class="home-list-empty">Cargando...</li>';

  try {
    const [allAlerts, allExpirations] = await Promise.all([apiFetch('/alerts'), apiFetch('/alerts/expirations?days=30')]);
    const inOwnBranch = item => !ownBranch || String(item.branchId) === String(ownBranch);
    const alerts = allAlerts.filter(inOwnBranch);
    const expirations = allExpirations.filter(inOwnBranch);
    const showBranch = !isSingleBranch() && !ownBranch;

    document.getElementById('home-count-low').textContent = alerts.length;
    document.getElementById('home-count-exp').textContent = expirations.length;
    document.getElementById('home-btn-low').classList.toggle('has-items', alerts.length > 0);
    document.getElementById('home-btn-exp').classList.toggle('has-items', expirations.length > 0);

    lowList.innerHTML = alerts.length
      ? alerts.slice(0, 6).map(a => `
        <li>
          <span><strong>${escapeHtml(a.productName)}</strong>${showBranch ? ` <span class="muted">· ${escapeHtml(a.branchName)}</span>` : ''}</span>
          <span class="${a.currentQuantity === 0 ? 'text-danger' : 'text-warning'} strong">${a.currentQuantity} de ${a.minimumStock} mín.</span>
        </li>`).join('')
      : '<li class="home-list-empty">Todos los productos están por encima del mínimo.</li>';

    expList.innerHTML = expirations.length
      ? expirations.slice(0, 6).map(e => `
        <li>
          <span><strong>${escapeHtml(e.productName)}</strong> <span class="muted">· ${e.remaining} u.${showBranch ? ` · ${escapeHtml(e.branchName)}` : ''}</span></span>
          <span class="${e.daysLeft < 0 ? 'text-danger' : e.daysLeft <= 7 ? 'text-warning' : ''} strong">${e.daysLeft < 0 ? 'Vencido' : e.daysLeft === 0 ? 'Vence hoy' : `En ${e.daysLeft} días`}</span>
        </li>`).join('')
      : '<li class="home-list-empty">No hay productos próximos a vencer.</li>';
  } catch (err) {
    lowList.innerHTML = `<li class="home-list-empty text-danger">${escapeHtml(err.message)}</li>`;
    expList.innerHTML = '';
  }
}

document.getElementById('home-btn-sale')?.addEventListener('click', () => openQuickSale());
document.getElementById('home-btn-entry')?.addEventListener('click', () => openCreateStockEntryModal());
document.getElementById('home-btn-low')?.addEventListener('click', () => {
  document.getElementById('stock-view-filter').value = 'low';
  goToPanel('panel-stock-view');
});
document.getElementById('home-btn-exp')?.addEventListener('click', () => goToPanel('panel-expirations'));
document.getElementById('btn-open-quick-sale')?.addEventListener('click', () => openQuickSale());

let quickSaleStock = [];
let quickSaleCart = [];

async function openQuickSale() {
  await ensureBaseData();
  const branches = operableBranches();
  if (!branches.length) return showToast('Su usuario no tiene una sucursal asignada. Consulte al administrador.', 'error');

  const branchSelect = document.getElementById('quick-sale-branch');
  fillSelect(branchSelect, branches, { getLabel: branchLabel, value: userBranchId() || branches[0].id });
  document.getElementById('quick-sale-branch-group').classList.toggle('hidden', branches.length <= 1);

  quickSaleCart = [];
  document.getElementById('quick-sale-search').value = '';
  renderQuickSaleCart();
  openModal('modal-quick-sale');
  await loadQuickSaleStock();
}

async function loadQuickSaleStock() {
  const results = document.getElementById('quick-sale-results');
  results.innerHTML = '<p class="empty-text">Cargando productos...</p>';
  try {
    const { stockItems } = await apiFetch(`/branches/${document.getElementById('quick-sale-branch').value}/stock`);
    quickSaleStock = stockItems.filter(i => i.Producto);
    renderQuickSaleResults();
  } catch (err) {
    results.innerHTML = `<p class="empty-text text-danger">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('quick-sale-branch')?.addEventListener('change', () => {
  quickSaleCart = [];
  renderQuickSaleCart();
  loadQuickSaleStock();
});

document.getElementById('quick-sale-search')?.addEventListener('input', debounce(renderQuickSaleResults, 150));

function inCart(productId) {
  return quickSaleCart.find(i => i.productId === productId)?.quantity || 0;
}

function renderQuickSaleResults() {
  const q = document.getElementById('quick-sale-search').value.toLowerCase().trim();
  const results = document.getElementById('quick-sale-results');
  const list = quickSaleStock
    .filter(i => !q || [i.Producto.name, i.Producto.sku].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.Producto.name.localeCompare(b.Producto.name))
    .slice(0, 12);

  if (!list.length) {
    results.innerHTML = `<p class="empty-text">${q ? 'No se encontraron productos con ese nombre.' : 'No hay productos con stock en este local.'}</p>`;
    return;
  }
  results.innerHTML = list.map(i => {
    const left = i.availableQuantity - inCart(i.productId);
    return `
      <button type="button" class="quick-product" data-product-id="${i.productId}" ${left <= 0 ? 'disabled' : ''}>
        <span class="quick-product-name">${escapeHtml(i.Producto.name)}</span>
        <span class="quick-product-stock">${left > 0 ? `Disponibles: ${left}` : 'Sin stock disponible'}</span>
      </button>`;
  }).join('');
}

document.getElementById('quick-sale-results')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.quick-product');
  if (!btn || btn.disabled) return;
  changeQuickSaleQty(btn.dataset.productId, 1);
});

function changeQuickSaleQty(productId, delta) {
  const stockItem = quickSaleStock.find(i => i.productId === productId);
  if (!stockItem) return;
  let line = quickSaleCart.find(i => i.productId === productId);
  if (!line) {
    line = { productId, productName: stockItem.Producto.name, quantity: 0 };
    quickSaleCart.push(line);
  }
  const next = line.quantity + delta;
  if (next > stockItem.availableQuantity) {
    showToast(`Solo hay ${stockItem.availableQuantity} unidades disponibles de ${stockItem.Producto.name}.`, 'error');
    return;
  }
  line.quantity = next;
  if (line.quantity <= 0) quickSaleCart = quickSaleCart.filter(i => i.productId !== productId);
  renderQuickSaleCart();
  renderQuickSaleResults();
}

window.changeQuickSaleQty = changeQuickSaleQty;

function renderQuickSaleCart() {
  const container = document.getElementById('quick-sale-items');
  const totalUnits = quickSaleCart.reduce((acc, i) => acc + i.quantity, 0);
  document.getElementById('quick-sale-total').textContent = `${totalUnits} unidad${totalUnits === 1 ? '' : 'es'}`;
  document.getElementById('btn-quick-sale-confirm').disabled = !quickSaleCart.length;

  if (!quickSaleCart.length) {
    container.innerHTML = '<p class="empty-text">Toque un producto de la lista para agregarlo a la venta.</p>';
    return;
  }
  container.innerHTML = quickSaleCart.map(i => `
    <div class="quick-line">
      <span class="quick-line-name">${escapeHtml(i.productName)}</span>
      <div class="quick-stepper">
        <button type="button" class="btn btn-secondary" title="Quitar una unidad" onclick="changeQuickSaleQty('${i.productId}', -1)">−</button>
        <span class="quick-qty">${i.quantity}</span>
        <button type="button" class="btn btn-secondary" title="Agregar una unidad" onclick="changeQuickSaleQty('${i.productId}', 1)">+</button>
      </div>
      <button type="button" class="btn-icon btn-icon-danger" title="Quitar de la venta" onclick="changeQuickSaleQty('${i.productId}', -${i.quantity})">${ICON_DELETE}</button>
    </div>`).join('');
}

document.getElementById('btn-quick-sale-confirm')?.addEventListener('click', async () => {
  if (!quickSaleCart.length) return;
  const branchId = document.getElementById('quick-sale-branch').value;
  const button = document.getElementById('btn-quick-sale-confirm');
  button.disabled = true;

  const total = quickSaleCart.length;
  const failed = await submitDraftItems(quickSaleCart, item => apiFetch('/inventory/exit', {
    method: 'POST',
    body: JSON.stringify({ productId: item.productId, quantity: item.quantity, branchId, exitType: 'VENTA', description: 'Venta registrada desde Venta rápida' })
  }));

  if (failed.length) {
    showToast(`Se registraron ${total - failed.length} de ${total} productos. Revise: ${failed.join(' | ')}`, 'error', 9000);
    await loadQuickSaleStock();
    renderQuickSaleCart();
  } else {
    showToast('Venta registrada correctamente.', 'success');
    closeModal('modal-quick-sale');
  }
  button.disabled = false;
  if (state.currentTab === 'panel-home') loadHomePanel();
  afterStockChange();
});
