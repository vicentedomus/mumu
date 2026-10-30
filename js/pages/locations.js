// Ubicaciones — alta, edición, orden y desactivación de los puntos de stock/venta
Router.register('#/locations', async (container) => {
  document.getElementById('page-title').textContent = 'Ubicaciones';

  const sb = getSupabase();
  if (!sb) return;

  await renderLocationsPage(container, sb);
});

async function renderLocationsPage(container, sb) {
  const [locations, stockRes] = await Promise.all([
    Locations.all(sb),
    sb.from('inventory').select('location_id, quantity').gt('quantity', 0)
  ]);

  const stockByLoc = {};
  (stockRes.data || []).forEach(r => {
    stockByLoc[r.location_id] = (stockByLoc[r.location_id] || 0) + r.quantity;
  });

  const active = locations.filter(l => l.active);
  const inactive = locations.filter(l => !l.active);
  const defaultId = Locations.pickDefault(active)?.id;

  container.innerHTML = `
    <p class="text-sm text-muted mb-16">Puntos donde guardas o vendes stock. Toca una para editarla y usa las flechas para cambiar el orden en que aparecen en la app.</p>
    <div id="locations-active">
      ${active.map((l, i) => renderLocationCard(l, {
        stock: stockByLoc[l.id] || 0,
        isDefault: l.id === defaultId,
        isFirst: i === 0,
        isLast: i === active.length - 1
      })).join('')}
    </div>
    ${inactive.length > 0 ? `
      <div class="section-divider mt-16 mb-8"><span class="section-label">Inactivas</span></div>
      <p class="text-sm text-muted mb-8">No aparecen al vender, trasladar ni hacer pedidos. Sus ventas siguen en el historial y los reportes.</p>
      ${inactive.map(l => renderLocationCard(l, { stock: stockByLoc[l.id] || 0 })).join('')}
    ` : ''}
  `;

  addFAB(() => openLocationForm(null, locations, container, sb));

  container.querySelectorAll('.location-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const loc = locations.find(l => l.id === card.dataset.locId);
      if (loc) openLocationForm(loc, locations, container, sb);
    });
  });

  container.querySelectorAll('.loc-move').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = active.findIndex(l => l.id === btn.dataset.locId);
      const target = idx + parseInt(btn.dataset.dir);
      if (idx < 0 || target < 0 || target >= active.length) return;
      const ordered = [...active];
      [ordered[idx], ordered[target]] = [ordered[target], ordered[idx]];
      // Renumera todas para corregir empates (ej: todas en 0)
      const updates = ordered
        .map((l, i) => ({ l, i }))
        .filter(({ l, i }) => l.sort_order !== i)
        .map(({ l, i }) => sb.from('locations').update({ sort_order: i }).eq('id', l.id));
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed) { UI.toast('Error: ' + failed.error.message, 'error'); return; }
      await renderLocationsPage(container, sb);
    });
  });

  container.querySelectorAll('.loc-reactivate').forEach(btn => {
    btn.addEventListener('click', async () => {
      await UI.withLoading(btn, async () => {
        const { error } = await sb.from('locations')
          .update({ active: true, sort_order: nextSortOrder(locations) })
          .eq('id', btn.dataset.locId);
        if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
        UI.toast('Ubicación reactivada');
      });
      await renderLocationsPage(container, sb);
    });
  });
}

function renderLocationCard(l, { stock, isDefault = false, isFirst = false, isLast = false }) {
  const typeInfo = l.type === 'consignacion'
    ? `Consignación · ${Number(l.commission_rate)}% comisión`
    : 'Directo · sin comisión';
  return `
    <div class="card location-card ${l.active ? '' : 'location-card-inactive'}" data-loc-id="${l.id}">
      <div class="flex-between" style="gap:12px">
        <div style="min-width:0;flex:1">
          <div class="list-item-title">
            ${escapeHtml(l.name)}
            ${isDefault ? '<span class="badge badge-stock" style="margin-left:6px">Principal</span>' : ''}
          </div>
          <div class="list-item-sub">${typeInfo}</div>
          <div class="list-item-sub">${stock} unidad${stock !== 1 ? 'es' : ''} en stock</div>
        </div>
        ${l.active ? `
          <div class="location-order">
            <button type="button" class="btn-icon loc-move" data-loc-id="${l.id}" data-dir="-1" aria-label="Subir" ${isFirst ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" class="btn-icon loc-move" data-loc-id="${l.id}" data-dir="1" aria-label="Bajar" ${isLast ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        ` : `
          <button type="button" class="btn btn-sm btn-outline loc-reactivate" data-loc-id="${l.id}">Reactivar</button>
        `}
      </div>
    </div>
  `;
}

function nextSortOrder(locations) {
  return locations.reduce((max, l) => Math.max(max, l.sort_order ?? 0), -1) + 1;
}

// ============================================
// Formulario crear/editar ubicación
// ============================================
function openLocationForm(location, locations, container, sb) {
  const isEdit = !!location;
  const isActive = !isEdit || location.active;
  const isDefault = isEdit && isActive && Locations.pickDefault(locations.filter(l => l.active))?.id === location.id;
  const type = location?.type || 'consignacion';
  const rate = location ? Number(location.commission_rate) : 30;

  const html = `
    <form id="location-form">
      <div class="form-group">
        <label>Nombre</label>
        <input type="text" id="lf-name" required maxlength="40" placeholder="Ej: Tienda Centro" value="${isEdit ? escapeHtml(location.name) : ''}">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="lf-type">
          <option value="directo" ${type === 'directo' ? 'selected' : ''}>Directo — venta propia, sin comisión</option>
          <option value="consignacion" ${type === 'consignacion' ? 'selected' : ''}>Consignación — tienda que cobra comisión</option>
        </select>
      </div>
      <div class="form-group" id="lf-rate-group" ${type === 'consignacion' ? '' : 'hidden'}>
        <label>Comisión %</label>
        <input type="number" id="lf-rate" min="0" max="100" step="0.5" inputmode="decimal" value="${rate}">
        ${isEdit ? '<p class="text-sm text-muted mt-8">Cambiar la comisión solo afecta las ventas nuevas.</p>' : ''}
      </div>
      ${isActive ? `
        <label class="flex mb-8" style="gap:10px;align-items:center;cursor:pointer">
          <input type="checkbox" id="lf-default" style="width:18px;height:18px;flex-shrink:0" ${isDefault ? 'checked disabled' : ''}>
          <span class="text-sm">Usar como ubicación principal</span>
        </label>
        <p class="text-sm text-muted mb-16">${isDefault
          ? 'Es la principal. Para cambiarla, marca otra ubicación como principal.'
          : 'La principal recibe los pedidos sin destino y el stock inicial de variantes nuevas.'}</p>
      ` : ''}
      <button type="submit" class="btn btn-primary btn-full">${isEdit ? 'Guardar' : 'Crear ubicación'}</button>
      ${isEdit && isActive && !isDefault ? '<button type="button" class="btn btn-outline btn-full text-danger mt-8" id="lf-deactivate">Desactivar</button>' : ''}
    </form>
  `;

  UI.openSheet(isEdit ? 'Editar ubicación' : 'Nueva ubicación', html);

  document.getElementById('lf-type').addEventListener('change', (e) => {
    document.getElementById('lf-rate-group').hidden = e.target.value !== 'consignacion';
  });

  document.getElementById('location-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {
      const name = document.getElementById('lf-name').value.trim();
      const newType = document.getElementById('lf-type').value;
      const newRate = newType === 'consignacion' ? parseFloat(document.getElementById('lf-rate').value) : 0;
      const makeDefault = !!document.getElementById('lf-default')?.checked && !isDefault;

      if (!name) { UI.toast('Escribe un nombre', 'error'); return; }
      if (isNaN(newRate) || newRate < 0 || newRate > 100) { UI.toast('La comisión debe estar entre 0 y 100', 'error'); return; }

      const fields = { name, type: newType, commission_rate: newRate };
      let locId = location?.id;
      let error;
      if (isEdit) {
        ({ error } = await sb.from('locations').update(fields).eq('id', locId));
      } else {
        let data;
        ({ data, error } = await sb.from('locations')
          .insert({ ...fields, sort_order: nextSortOrder(locations) })
          .select().single());
        locId = data?.id;
      }
      if (error) {
        UI.toast(error.code === '23505' ? 'Ya existe una ubicación con ese nombre' : 'Error: ' + error.message, 'error');
        return;
      }

      if (makeDefault && locId) {
        // Primero se quita la anterior: el índice único solo admite una principal
        const { error: e1 } = await sb.from('locations').update({ is_default: false }).eq('is_default', true);
        const { error: e2 } = e1 ? { error: e1 } : await sb.from('locations').update({ is_default: true }).eq('id', locId);
        if (e2) { UI.toast('Guardada, pero no se pudo marcar como principal: ' + e2.message, 'error'); }
      }

      UI.closeSheet();
      UI.toast(isEdit ? 'Ubicación actualizada' : 'Ubicación creada');
      await renderLocationsPage(container, sb);
    });
  });

  const deactivateBtn = document.getElementById('lf-deactivate');
  if (deactivateBtn) deactivateBtn.addEventListener('click', async () => {
    const [{ data: stockRows, error: stockErr }, { data: pending, error: ordersErr }] = await Promise.all([
      sb.from('inventory').select('quantity').eq('location_id', location.id).gt('quantity', 0),
      sb.from('purchase_orders').select('id').eq('destination_location_id', location.id).in('status', ['ordered', 'in_transit'])
    ]);
    if (stockErr || ordersErr) { UI.toast('Error: ' + (stockErr || ordersErr).message, 'error'); return; }

    const units = (stockRows || []).reduce((s, r) => s + r.quantity, 0);
    if (units > 0) {
      UI.toast(`${location.name} tiene ${units} unidad${units !== 1 ? 'es' : ''}. Trasládalas antes de desactivarla.`, 'error');
      return;
    }
    if ((pending || []).length > 0) {
      UI.toast(`Hay ${pending.length} pedido${pending.length !== 1 ? 's' : ''} pendiente${pending.length !== 1 ? 's' : ''} con destino ${location.name}.`, 'error');
      return;
    }

    const ok = await UI.confirm(`¿Desactivar ${escapeHtml(location.name)}? Dejará de aparecer al vender, trasladar y hacer pedidos. Sus ventas se conservan y puedes reactivarla cuando quieras.`);
    if (!ok) return;

    const { error } = await sb.from('locations').update({ active: false }).eq('id', location.id);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }
    UI.toast(`${location.name} desactivada`);
    await renderLocationsPage(container, sb);
  });
}
