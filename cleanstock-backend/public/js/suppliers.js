// ==========================================================================
// PROVEEDORES Y PROVISIONES
// ==========================================================================

let supplierSearch = '';
let suppliersPage = 1;
const SUPPLIERS_PER_PAGE = 10;

async function loadSuppliersPanel() {
  await ensureBaseData();
  const isSupplierUser = hasRole('Proveedor');
  const canManage = hasRole('Administrador');

  document.getElementById('suppliers-panel-title').textContent = isSupplierUser ? 'Mis Entregas' : 'Proveedores';
  document.getElementById('btn-open-supplier-modal')?.classList.toggle('hidden', !canManage);
  document.getElementById('suppliers-sub-nav')?.classList.add('hidden');

  await renderSuppliersTable();
}

// --------------------------------------------------------------------------
// Menú "Provisiones": la mercadería que llega de los proveedores.
// Se carga pendiente y entra al stock recién cuando el Responsable o el Administrador
// la aprueba con el casillero. El proveedor ve solo lo que entregó.
// --------------------------------------------------------------------------
let provisionsPage = 1;
let loadedProvisions = [];

const canManageProvisions = () => hasRole('Administrador', 'Usuario Responsable');

async function loadProvisionsPanel() {
  await ensureBaseData();
  const isSupplierUser = hasRole('Proveedor');
  const canManage = canManageProvisions();
  document.getElementById('provisions-panel-title').textContent = isSupplierUser ? 'Mis Entregas' : 'Provisiones';
  document.getElementById('provisions-table-title').textContent = isSupplierUser ? 'Mercadería entregada' : 'Provisiones de proveedores';
  document.getElementById('provisions-hint').classList.toggle('hidden', !canManage);
  document.getElementById('btn-provisions-entry')?.classList.toggle('hidden', !canManage);

  // Solo el administrador elige sucursal; el resto ve la suya (o sus entregas)
  const branchSel = document.getElementById('provisions-branch-select');
  const showBranchFilter = hasRole('Administrador') && !isSingleBranch();
  branchSel.classList.toggle('hidden', !showBranchFilter);
  if (showBranchFilter) fillSelect(branchSel, state.branches, { placeholder: 'Todas las sucursales', getLabel: branchLabel, value: branchSel.value });

  provisionsPage = 1;
  await loadProvisionEntries();
}

function provisionStatusBadge(p) {
  return p.status === 'APROBADA'
    ? '<span class="status-badge status-entregado">Aprobada</span>'
    : '<span class="status-badge status-pendiente">Pendiente</span>';
}

async function loadProvisionEntries() {
  const tbody = document.getElementById('table-provisions-body');
  const canManage = canManageProvisions();
  const showBranch = hasRole('Administrador', 'Proveedor') && !isSingleBranch();
  const cols = showBranch ? 8 : 7;
  setTableLoading(tbody, cols, 4);
  try {
    const params = new URLSearchParams({ page: provisionsPage, limit: 15 });
    const status = document.getElementById('provisions-status-filter').value;
    if (status) params.set('status', status);
    const branchId = document.getElementById('provisions-branch-select').value;
    if (branchId && hasRole('Administrador')) params.set('branchId', branchId);
    const data = await apiFetch(`/inventory/provisions?${params}`);
    loadedProvisions = data.items;

    const pendingInfo = document.getElementById('provisions-pending-count');
    pendingInfo.textContent = data.pending ? `${data.pending} pendiente${data.pending === 1 ? '' : 's'} de aprobación` : '';
    pendingInfo.classList.toggle('hidden', !data.pending);

    if (!data.items.length) {
      renderEmptyRow(tbody, cols, status ? 'No hay provisiones con este estado' : 'Todavía no hay provisiones', canManage ? 'Usá "Nueva Provisión" para cargar la mercadería que llega de un proveedor.' : '');
    } else {
      tbody.innerHTML = data.items.map(p => {
        const approved = p.status === 'APROBADA';
        const approveBox = canManage
          ? `<label class="provision-approve" title="${approved ? `Aprobada${p.approvedByName ? ` por ${escapeHtml(p.approvedByName)}` : ''}` : 'Aprobar: ingresa al stock de la sucursal'}">
               <input type="checkbox" ${approved ? 'checked disabled' : ''} onchange="approveProvision('${p.id}', this)">
             </label>`
          : '';
        return `
        <tr class="${approved ? '' : 'provision-pending-row'}">
          <td class="cell-date">${formatDateTime(p.createdAt)}</td>
          <td class="provisions-branch-col">${escapeHtml(p.branchName || '—')}</td>
          <td><ul class="provision-items-list">${p.items.map(i => `
            <li><strong>${escapeHtml(i.productName || '—')}</strong>${i.brandName ? ` ${escapeHtml(i.brandName)}` : ''} · ${i.quantity} u.${i.lotNumber ? `<small class="muted">lote ${escapeHtml(i.lotNumber)}</small>` : ''}</li>`).join('')}
          </ul></td>
          <td><strong>${p.totalUnits}</strong> u.<br><small class="muted">${p.items.length} producto${p.items.length === 1 ? '' : 's'}</small></td>
          <td>${p.supplierName ? escapeHtml(p.supplierName) : '<span class="muted">Sin proveedor</span>'}</td>
          <td>${provisionStatusBadge(p)}${p.editedAt ? '<br><small class="muted">Modificada</small>' : ''}</td>
          <td>
            <div class="action-btn-group">
              <button type="button" class="btn-icon" title="Ver detalle" onclick="openViewProvisionModal('${p.id}')">${ICON_VIEW}</button>
              ${canManage ? `<button type="button" class="btn-icon" title="Modificar" onclick="openEditEntryModal('${p.id}')">${ICON_EDIT}</button>` : ''}
              ${approveBox}
            </div>
          </td>
        </tr>`;
      }).join('');
    }
    document.querySelectorAll('.provisions-branch-col').forEach(el => el.classList.toggle('hidden', !showBranch));
    renderPagination('provisions-pagination', data, 'provisiones', (page) => {
      provisionsPage = page;
      loadProvisionEntries();
    });
  } catch (err) {
    renderErrorRow(tbody, cols, err.message);
  }
}

['provisions-branch-select', 'provisions-status-filter'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => {
    provisionsPage = 1;
    loadProvisionEntries();
  });
});

document.getElementById('btn-provisions-entry')?.addEventListener('click', () => openCreateStockEntryModal('provision'));

// Aprobar con el casillero: recién ahí todos los productos entran al stock y figuran como movimiento
window.approveProvision = async (provisionId, checkbox) => {
  const p = loadedProvisions.find(x => x.id === provisionId);
  if (!p) return;
  const ok = await confirmDialog({
    title: 'Aprobar provisión',
    html: `
      <div class="confirm-summary">
        <div><strong>Sucursal:</strong> ${escapeHtml(p.branchName)}</div>
        <div><strong>Proveedor:</strong> ${escapeHtml(p.supplierName || 'Sin proveedor')}</div>
        ${p.items.map(i => `<div><strong>${escapeHtml(i.productName)}:</strong> <span class="qty-in strong">+${i.quantity} u.</span>${i.lotNumber ? ` — lote ${escapeHtml(i.lotNumber)}, vence ${formatDateOnly(i.expirationDate)}` : ''}</div>`).join('')}
      </div>
      <p class="hint-text">Al aprobarla, todos estos productos ingresan al stock de la sucursal y quedan registrados como movimientos.</p>`,
    confirmText: 'Aprobar e ingresar'
  });
  if (!ok) {
    checkbox.checked = false;
    return;
  }
  checkbox.disabled = true;
  try {
    await apiFetch(`/inventory/provisions/${provisionId}/approve`, { method: 'POST' });
    showToast(`Provisión aprobada: ingresaron ${p.totalUnits} u. (${p.items.length} producto${p.items.length === 1 ? '' : 's'}) a ${p.branchName}`, 'success', 6000);
    loadProvisionEntries();
    refreshNotifications();
  } catch (err) {
    checkbox.checked = false;
    checkbox.disabled = false;
    showToast(err.message, 'error');
  }
};

// Ojo: datos de la provisión y la lista de sus productos
window.openViewProvisionModal = (provisionId) => {
  const p = loadedProvisions.find(x => x.id === provisionId);
  if (!p) return;
  const approved = p.status === 'APROBADA';
  const row = (label, value) => `<div><strong>${label}:</strong> ${value}</div>`;
  document.getElementById('view-provision-content').innerHTML = [
    row('Estado', provisionStatusBadge(p)),
    row('Sucursal', escapeHtml(p.branchName || '—')),
    row('Proveedor', escapeHtml(p.supplierName || 'Sin proveedor')),
    row('Total', `${p.totalUnits} u. en ${p.items.length} producto${p.items.length === 1 ? '' : 's'}`),
    row('Cargada', `${formatDateTime(p.createdAt)}${p.createdByName ? ` por ${escapeHtml(p.createdByName)}` : ''}`),
    row('Aprobada', p.approvedAt ? `${formatDateTime(p.approvedAt)}${p.approvedByName ? ` por ${escapeHtml(p.approvedByName)}` : ''}` : 'Todavía no (no ingresó al stock)'),
    p.editedAt ? row('Última modificación', `${formatDateTime(p.editedAt)}${p.editedByName ? ` por ${escapeHtml(p.editedByName)}` : ''}`) : '',
    `<div class="span-2"><strong>Notas:</strong> ${escapeHtml(p.notes || 'Sin notas')}</div>`
  ].join('');
  document.getElementById('view-provision-items').innerHTML = p.items.map(i => `
    <tr>
      <td><strong>${escapeHtml(i.productName || '—')}</strong></td>
      <td>${i.brandName ? escapeHtml(i.brandName) : '<span class="muted">—</span>'}</td>
      <td>${i.quantity} u.</td>
      <td>${i.lotNumber ? `<span class="badge">${escapeHtml(i.lotNumber)}</span>` : '<span class="muted">Sin lote</span>'}</td>
      <td>${i.expirationDate ? formatDateOnly(i.expirationDate) : '<span class="muted">No vence</span>'}</td>
      <td class="view-provision-used-col">${i.used ? `${i.used} u.` : '—'}</td>
    </tr>`).join('');
  document.querySelectorAll('.view-provision-used-col').forEach(el => el.classList.toggle('hidden', !approved));
  document.getElementById('view-provision-title').textContent = `Provisión — ${p.supplierName || 'sin proveedor'} (${formatDateOnly(p.createdAt)})`;
  openModal('modal-view-provision');
};

// Lápiz: corregir una provisión, producto por producto en la misma lista.
// Pendiente: solo los datos. Aprobada: también el stock y los lotes, y pide un motivo.
let editingEntry = null;
let editBrandPickers = new Map();

window.openEditEntryModal = async (provisionId) => {
  editingEntry = loadedProvisions.find(e => e.id === provisionId);
  if (!editingEntry) return;
  const approved = editingEntry.status === 'APROBADA';
  const suppliers = await loadSuppliers().catch(() => []);
  document.getElementById('form-edit-entry').reset();
  fillSelect(document.getElementById('edit-entry-supplier'), suppliers, { placeholder: 'Sin proveedor', value: editingEntry.supplierId || '' });
  document.getElementById('edit-entry-supplier').value = editingEntry.supplierId || '';
  document.getElementById('edit-entry-notes').value = editingEntry.notes || '';

  document.getElementById('edit-entry-items').innerHTML = editingEntry.items.map(i => {
    const needsExp = i.perishable !== false;
    const min = approved ? Math.max(1, i.used || 0) : 1;
    return `
      <tr data-item="${escapeHtml(i.id)}">
        <td><strong>${escapeHtml(i.productName || '—')}</strong>${approved && i.used ? `<br><small class="muted">ya salieron ${i.used} u.</small>` : ''}</td>
        <td><div class="edit-item-brand"></div></td>
        <td><input type="number" class="edit-item-qty" value="${i.quantity}" min="${min}" step="1" required aria-label="Cantidad"></td>
        <td><input type="text" class="edit-item-lot" value="${escapeHtml(i.lotNumber || '')}" maxlength="60" placeholder="${needsExp ? 'Ej: LOT-1' : 'Opcional'}" ${needsExp ? 'required' : ''} aria-label="Lote"></td>
        <td>${needsExp ? `<input type="date" class="edit-item-exp" value="${i.expirationDate ? String(i.expirationDate).slice(0, 10) : ''}" required aria-label="Vencimiento">` : '<span class="muted">Sin vencimiento</span>'}</td>
      </tr>`;
  }).join('');
  // Un buscador de marca por producto
  editBrandPickers = new Map();
  document.querySelectorAll('#edit-entry-items tr[data-item]').forEach(tr => {
    const picker = createBrandPicker(tr.querySelector('.edit-item-brand'));
    picker.set(editingEntry.items.find(i => i.id === tr.dataset.item)?.brandId || null);
    editBrandPickers.set(tr.dataset.item, picker);
  });

  // El motivo se pide solo si ya ingresó al stock
  document.getElementById('edit-entry-reason-group').classList.toggle('hidden', !approved);
  document.getElementById('edit-entry-reason').required = approved;

  document.getElementById('edit-entry-title').textContent = `Modificar provisión — ${editingEntry.supplierName || 'sin proveedor'}`;
  document.getElementById('edit-entry-info').innerHTML = approved
    ? `Ya está aprobada: los cambios corrigen también el stock de ${escapeHtml(editingEntry.branchName || '')} y los lotes. La cantidad de cada producto no puede ser menor a lo que ya salió.`
    : 'Está pendiente: todavía no ingresó al stock, así que se pueden corregir los datos libremente.';
  openModal('modal-edit-entry');
};

document.getElementById('form-edit-entry')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!editingEntry) return;
  const approved = editingEntry.status === 'APROBADA';
  const items = [...document.querySelectorAll('#edit-entry-items tr[data-item]')].map(tr => {
    const item = {
      id: tr.dataset.item,
      quantity: parseInt(tr.querySelector('.edit-item-qty').value, 10),
      brandId: editBrandPickers.get(tr.dataset.item)?.value || null
    };
    const lot = tr.querySelector('.edit-item-lot');
    const exp = tr.querySelector('.edit-item-exp');
    if (lot) item.lotNumber = lot.value.trim();
    if (exp) item.expirationDate = exp.value;
    return item;
  });
  const body = {
    supplierId: document.getElementById('edit-entry-supplier').value || null,
    notes: document.getElementById('edit-entry-notes').value.trim(),
    items
  };
  if (approved) body.reason = document.getElementById('edit-entry-reason').value.trim();

  const bad = items.find(i => !i.quantity || i.quantity < 1);
  if (bad) return showToast('La cantidad de cada producto debe ser mayor a 0.', 'error');
  if (approved) {
    const under = items.find(i => {
      const original = editingEntry.items.find(o => o.id === i.id);
      return original?.used && i.quantity < original.used;
    });
    if (under) {
      const original = editingEntry.items.find(o => o.id === under.id);
      return showToast(`De ${original.productName} ya salieron ${original.used} u.: la cantidad no puede ser menor.`, 'error');
    }
    if (!body.reason) return showToast('Indicá el motivo de la corrección.', 'error');
  }

  try {
    const res = await apiFetch(`/inventory/provisions/${editingEntry.id}`, { method: 'PUT', body: JSON.stringify(body) });
    showToast(res.changes?.length ? `Provisión modificada: ${res.changes.join(', ')}` : 'No había cambios para guardar', res.changes?.length ? 'success' : 'info', 7000);
    closeModal('modal-edit-entry');
    loadProvisionEntries();
    if (approved) refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

async function renderSuppliersTable() {
  const tbody = document.getElementById('table-suppliers-body');
  const isAdmin = hasRole('Administrador');
  const cols = isAdmin ? 5 : 4;
  const actionsTh = document.querySelector('#subpanel-suppliers-list thead th:last-child');
  if (actionsTh) actionsTh.classList.toggle('hidden', !isAdmin);
  if (!state.suppliers.length) setTableLoading(tbody, cols, 3);
  try {
    await loadSuppliers();
    const list = state.suppliers.filter(s => !supplierSearch ||
      [s.name, s.cuit, s.contactName, s.email].join(' ').toLowerCase().includes(supplierSearch));
    if (!list.length) {
      renderEmptyRow(tbody, cols, supplierSearch ? 'Sin resultados' : 'Todavía no hay proveedores', isAdmin ? 'Registrá a quién le comprás para asociarlo a las provisiones.' : '');
      const pag = document.getElementById('suppliers-pagination');
      if (pag) pag.innerHTML = '';
      return;
    }

    const pageData = paginate(list, suppliersPage, SUPPLIERS_PER_PAGE);
    suppliersPage = pageData.page;

    tbody.innerHTML = pageData.items.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong>${s.notes ? `<div class="cell-detail">${escapeHtml(s.notes)}</div>` : ''}</td>
        <td>${s.cuit ? escapeHtml(s.cuit) : '<span class="muted">—</span>'}</td>
        <td>${s.contactName ? escapeHtml(s.contactName) : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(s.phone || '')}${s.phone && s.email ? '<br>' : ''}<span class="muted">${escapeHtml(s.email || '')}</span>${!s.phone && !s.email ? '<span class="muted">—</span>' : ''}</td>
        ${isAdmin ? `<td>
          <div class="action-btn-group">
            <button class="btn-icon" title="Ver Detalle" onclick="openViewSupplierModal('${s.id}')">${ICON_VIEW}</button>
            <button class="btn-icon" title="Editar" onclick="openSupplierModal('${s.id}')">${ICON_EDIT}</button>
            <button class="btn-icon btn-icon-danger" title="Dar de baja" onclick="deactivateSupplier('${s.id}')">${ICON_DELETE}</button>
          </div>
        </td>` : ''}
      </tr>`).join('');

    renderPagination('suppliers-pagination', pageData, 'proveedores', (p) => {
      suppliersPage = p;
      renderSuppliersTable();
    });
  } catch (err) {
    renderErrorRow(tbody, cols, err.message);
  }
}

window.openViewSupplierModal = (supplierId) => {
  const s = state.suppliers.find(x => String(x.id) === String(supplierId));
  if (!s) return;
  document.getElementById('view-supplier-details-content').innerHTML = `
    <div class="span-2"><strong>Razón Social:</strong> ${escapeHtml(s.name)}</div>
    <div><strong>CUIT:</strong> ${escapeHtml(s.cuit || 'Sin registrar')}</div>
    <div><strong>Persona de Contacto:</strong> ${escapeHtml(s.contactName || 'Sin registrar')}</div>
    <div><strong>Teléfono:</strong> ${escapeHtml(s.phone || 'Sin registrar')}</div>
    <div><strong>Email:</strong> ${escapeHtml(s.email || 'Sin registrar')}</div>
    <div class="span-2"><strong>Dirección:</strong> ${escapeHtml(s.address || 'Sin registrar')}</div>
    <div class="span-2"><strong>Notas:</strong> ${escapeHtml(s.notes || 'Sin notas')}</div>
  `;
  openModal('modal-view-supplier');
};

document.getElementById('supplier-search')?.addEventListener('input', debounce((e) => {
  supplierSearch = e.target.value.toLowerCase().trim();
  suppliersPage = 1;
  renderSuppliersTable();
}, 250));

// --------------------------------------------------------------------------
// Alta / edición de proveedor
// --------------------------------------------------------------------------
window.openSupplierModal = (supplierId = null) => {
  const s = supplierId ? state.suppliers.find(x => x.id === supplierId) : null;
  document.getElementById('form-supplier').reset();
  document.getElementById('supplier-id').value = s?.id || '';
  document.getElementById('supplier-name').value = s?.name || '';
  document.getElementById('supplier-cuit').value = s?.cuit || '';
  document.getElementById('supplier-contact').value = s?.contactName || '';
  document.getElementById('supplier-phone').value = s?.phone || '';
  document.getElementById('supplier-email').value = s?.email || '';
  document.getElementById('supplier-address').value = s?.address || '';
  document.getElementById('supplier-notes').value = s?.notes || '';
  document.getElementById('modal-supplier-title').textContent = s ? `Editar ${s.name}` : 'Nuevo Proveedor';
  openModal('modal-supplier');
};
document.getElementById('btn-open-supplier-modal')?.addEventListener('click', () => openSupplierModal());

document.getElementById('form-supplier')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('supplier-id').value;
  const val = (field) => document.getElementById(`supplier-${field}`).value.trim();
  const data = {
    name: val('name'),
    cuit: val('cuit'),
    contactName: val('contact'),
    phone: val('phone'),
    email: val('email'),
    address: val('address'),
    notes: val("notes")
  };
  try {
    await apiFetch(id ? `/suppliers/${id}` : '/suppliers', { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) });
    showToast(id ? 'Proveedor actualizado' : 'Proveedor registrado', 'success');
    closeModal('modal-supplier');
    renderSuppliersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.deactivateSupplier = async (supplierId) => {
  const s = state.suppliers.find(x => x.id === supplierId);
  const ok = await confirmDialog({
    title: 'Dar de baja proveedor',
    message: `"${s?.name}" dejará de aparecer en los listados. Su historial de compras se conserva.`,
    confirmText: 'Dar de baja',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/suppliers/${supplierId}`, { method: 'DELETE' });
    showToast('Proveedor dado de baja', 'success');
    renderSuppliersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
};
