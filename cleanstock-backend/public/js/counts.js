let activeCount = null;
let countSearch = '';

async function loadCountsPanel() {
  await ensureBaseData();
  const branches = operableBranches();
  const select = document.getElementById('count-branch-select');
  const label = document.querySelector('label[for="count-branch-select"]');
  const showBranchPicker = hasRole('Administrador') && !isSingleBranch() && branches.length > 1;
  select?.classList.toggle('hidden', !showBranchPicker);
  label?.classList.toggle('hidden', !showBranchPicker);

  fillSelect(select, branches, { getLabel: branchLabel, value: select.value || userBranchId() || branches[0]?.id });
  select.disabled = branches.length <= 1;
  if (!select.value && branches.length) select.value = branches[0].id;
  document.getElementById('btn-start-count').disabled = !branches.length;
  await loadCountsHistory();
}

async function loadCountsHistory() {
  const tbody = document.getElementById('table-counts-history');
  setTableLoading(tbody, 7, 2);
  try {
    const counts = await apiFetch('/counts');
    const open = counts.find(c => c.status === 'ABIERTO');
    if (open && (!activeCount || activeCount.id !== open.id)) await openCountEditor(open.id);
    if (!open) hideCountEditor();

    if (!counts.length) {
      renderEmptyRow(tbody, 7, 'Todavía no se hicieron conteos');
      return;
    }
    const statusCls = { ABIERTO: 'status-pendiente', CERRADO: 'status-entregado', CANCELADO: 'status-rechazado' };
    tbody.innerHTML = counts.map(c => `
      <tr>
        <td class="cell-date">${formatDateTime(c.createdAt)}</td>
        <td><strong>${escapeHtml(c.branchName)}</strong></td>
        <td><span class="status-badge ${statusCls[c.status]}">${escapeHtml(capitalize(c.status.toLowerCase()))}</span></td>
        <td>${c.countedItems} de ${c.totalItems}</td>
        <td>${c.differences ? `<span class="text-warning strong">${c.differences}</span>` : '0'}</td>
        <td>${escapeHtml(getUserDisplayName(c.createdBy))}</td>
        <td>${c.status === 'ABIERTO'
          ? `<button class="btn btn-primary btn-sm" onclick="openCountEditor('${c.id}')">Continuar</button>`
          : `<button class="btn btn-secondary btn-sm" onclick="openCountEditor('${c.id}')">Ver detalle</button>`}</td>
      </tr>`).join('');
  } catch (err) {
    renderErrorRow(tbody, 7, err.message);
  }
}

document.getElementById('btn-start-count')?.addEventListener('click', async () => {
  const branchId = document.getElementById('count-branch-select').value;
  if (!branchId) return;
  const ok = await confirmDialog({
    title: 'Iniciar conteo',
    message: `Se va a tomar una foto del stock actual de ${getBranchName(branchId)} con todos los productos del catálogo. Después cargás lo que contaste en el depósito.`,
    confirmText: 'Iniciar conteo'
  });
  if (!ok) return;
  try {
    const count = await apiFetch('/counts', { method: 'POST', body: JSON.stringify({ branchId }) });
    showToast('Conteo iniciado', 'success');
    activeCount = count;
    renderCountEditor();
    loadCountsHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

window.openCountEditor = async (countId) => {
  try {
    activeCount = await apiFetch(`/counts/${countId}`);
    countSearch = '';
    document.getElementById('count-search').value = '';
    renderCountEditor();
    document.getElementById('count-editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function hideCountEditor() {
  activeCount = null;
  document.getElementById('count-editor').classList.add('hidden');
}

function renderCountEditor() {
  if (!activeCount) return hideCountEditor();
  const editable = activeCount.status === 'ABIERTO';
  document.getElementById('count-editor').classList.remove('hidden');
  document.getElementById('count-editor-title').textContent =
    `${editable ? 'Conteo en curso' : `Conteo ${activeCount.status.toLowerCase()}`} — ${activeCount.branchName} (${formatDateTime(activeCount.createdAt)})`;
  ['btn-count-cancel', 'btn-count-save', 'btn-count-close'].forEach(id => document.getElementById(id).classList.toggle('hidden', !editable));

  const counted = activeCount.items.filter(i => i.countedQty !== null).length;
  document.getElementById('count-progress').textContent = `${counted} de ${activeCount.items.length} productos contados`;

  const tbody = document.getElementById('table-count-items');
  const items = activeCount.items.filter(i => !countSearch || [i.productName, i.sku].join(' ').toLowerCase().includes(countSearch));
  if (!items.length) {
    renderEmptyRow(tbody, 5, 'Sin resultados');
    return;
  }
  tbody.innerHTML = items.map(i => {
    const diff = editable
      ? (i.countedQty === null ? null : i.countedQty - i.systemQty)
      : i.appliedDifference;
    const diffHtml = diff === null || diff === undefined
      ? '<span class="muted">—</span>'
      : diff === 0 ? '<span class="qty-signed">0</span>' : signedQty(diff);
    return `
      <tr class="${diff ? 'row-highlight' : ''}">
        <td><strong>${escapeHtml(i.productName)}</strong></td>
        <td>${i.sku ? escapeHtml(i.sku) : '<span class="muted">—</span>'}</td>
        <td>${i.systemQty}</td>
        <td>${editable
          ? `<input type="number" min="0" class="count-input" data-product-id="${i.productId}" value="${i.countedQty ?? ''}" placeholder="—">`
          : (i.countedQty ?? '<span class="muted">No contado</span>')}</td>
        <td data-diff-for="${i.productId}">${diffHtml}</td>
      </tr>`;
  }).join('');
}

document.getElementById('table-count-items')?.addEventListener('input', (e) => {
  if (!e.target.classList.contains('count-input') || !activeCount) return;
  const item = activeCount.items.find(i => i.productId === e.target.dataset.productId);
  if (!item) return;
  item.countedQty = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
  const diff = item.countedQty === null ? null : item.countedQty - item.systemQty;
  const cell = document.querySelector(`[data-diff-for="${item.productId}"]`);
  cell.innerHTML = diff === null ? '<span class="muted">—</span>' : diff === 0 ? '<span class="qty-signed">0</span>' : signedQty(diff);
  cell.closest('tr').classList.toggle('row-highlight', !!diff);
  const counted = activeCount.items.filter(i => i.countedQty !== null).length;
  document.getElementById('count-progress').textContent = `${counted} de ${activeCount.items.length} productos contados`;
});

document.getElementById('table-count-items')?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('count-input')) return;
  e.preventDefault();
  const inputs = [...document.querySelectorAll('.count-input')];
  inputs[inputs.indexOf(e.target) + 1]?.focus();
});

document.getElementById('count-search')?.addEventListener('input', debounce((e) => {
  countSearch = e.target.value.toLowerCase().trim();
  renderCountEditor();
}, 200));

async function saveCountProgress(silent = false) {
  if (!activeCount) return false;
  try {
    activeCount = await apiFetch(`/counts/${activeCount.id}`, {
      method: 'PUT',
      body: JSON.stringify({ items: activeCount.items.map(i => ({ productId: i.productId, countedQty: i.countedQty })) })
    });
    if (!silent) showToast('Avance del conteo guardado', 'success');
    return true;
  } catch (err) {
    showToast(err.message, 'error');
    return false;
  }
}

document.getElementById('btn-count-save')?.addEventListener('click', async () => {
  if (await saveCountProgress()) renderCountEditor();
});

document.getElementById('btn-count-close')?.addEventListener('click', async () => {
  if (!activeCount) return;
  const withDiff = activeCount.items.filter(i => i.countedQty !== null && i.countedQty !== i.systemQty);
  const notCounted = activeCount.items.filter(i => i.countedQty === null).length;
  const list = withDiff.slice(0, 12).map(i => `<li>${escapeHtml(i.productName)}: sistema ${i.systemQty} → contado ${i.countedQty} (${i.countedQty - i.systemQty > 0 ? '+' : ''}${i.countedQty - i.systemQty})</li>`).join('');
  const ok = await confirmDialog({
    title: 'Cerrar conteo y ajustar stock',
    html: `
      <p>${withDiff.length ? `Se van a ajustar <strong>${withDiff.length}</strong> producto(s):` : 'No hay diferencias contra el sistema.'}</p>
      ${list ? `<ul class="confirm-list">${list}${withDiff.length > 12 ? '<li>...</li>' : ''}</ul>` : ''}
      ${notCounted ? `<p class="hint-text">${notCounted} producto(s) sin contar no se modifican.</p>` : ''}
      <p class="hint-text">La diferencia se calcula contra el stock en este momento, por si hubo movimientos durante el conteo.</p>`,
    confirmText: 'Cerrar y ajustar'
  });
  if (!ok) return;
  if (!(await saveCountProgress(true))) return;
  try {
    const res = await apiFetch(`/counts/${activeCount.id}/close`, { method: 'POST' });
    showToast(res.message, 'success');
    await openCountEditor(activeCount.id);
    loadCountsHistory();
    refreshNotifications();
  } catch (err) {
    showToast(err.message, 'error');
  }
});

document.getElementById('btn-count-cancel')?.addEventListener('click', async () => {
  if (!activeCount) return;
  const ok = await confirmDialog({
    title: 'Cancelar conteo',
    message: 'Se descarta lo cargado y el stock no se modifica.',
    confirmText: 'Cancelar conteo',
    danger: true
  });
  if (!ok) return;
  try {
    await apiFetch(`/counts/${activeCount.id}/cancel`, { method: 'POST' });
    showToast('Conteo cancelado', 'info');
    hideCountEditor();
    loadCountsHistory();
  } catch (err) {
    showToast(err.message, 'error');
  }
});
