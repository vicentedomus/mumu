// Pedidos — compras a proveedores con flujo de estados
Router.register('#/orders', async (container) => {
  document.getElementById('page-title').textContent = 'Pedidos';

  const sb = getSupabase();
  if (!sb) return;

  addFAB(() => openNewOrderForm(container, sb));
  await renderOrdersList(container, sb);
});

// ============================================
// Render lista de pedidos
// ============================================
async function renderOrdersList(container, sb) {
  const { data: orders, error } = await sb
    .from('purchase_orders')
    .select(`
      id, supplier, status, total, shipping_cost, taxes, estimated_arrival, notes, created_at, destination_location_id,
      destination_location:locations!destination_location_id ( name ),
      purchase_order_items ( id, quantity, unit_cost, source_url, product_variants ( color, size, products ( name ) ) )
    `)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
    return;
  }

  const statusLabels = { ordered: 'Pedido', in_transit: 'En tránsito', received: 'Recibido', cancelled: 'Cancelado' };
  const statusClasses = { ordered: 'badge-consign', in_transit: 'badge-low', received: 'badge-stock', cancelled: '' };

  if (!orders || orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img src="/assets/mumu-gift.svg" alt="" style="width:120px;height:120px;opacity:0.5;margin-bottom:16px">
        <p>Sin pedidos todavía</p>
        <p class="text-sm mt-8">Toca el <strong>+</strong> para crear uno</p>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(o => {
    const itemCount = (o.purchase_order_items || []).reduce((sum, i) => sum + i.quantity, 0);
    const itemNames = [...new Set((o.purchase_order_items || []).map(i => i.product_variants?.products?.name).filter(Boolean))];

    return `
      <div class="card order-card" data-id="${o.id}">
        <div class="flex-between mb-8">
          <div>
            <div class="list-item-title">${o.supplier || itemNames.join(', ') || 'Pedido'}</div>
            <div class="list-item-sub">${new Date(o.created_at).toLocaleDateString('es-CL')}${o.estimated_arrival ? ' · Llega: ' + new Date(o.estimated_arrival).toLocaleDateString('es-CL') : ''}${o.destination_location?.name ? ' · → ' + o.destination_location.name : ''}</div>
          </div>
          <span class="badge ${statusClasses[o.status] || ''}">${statusLabels[o.status] || o.status}</span>
        </div>
        <div class="text-sm text-secondary mb-8">${itemCount} artículo${itemCount !== 1 ? 's' : ''}: ${itemNames.join(', ') || 'Sin ítems'}</div>
        <div class="flex-between">
          <div class="text-sm">
            ${o.shipping_cost > 0 ? `Envío: $${o.shipping_cost.toLocaleString()} · ` : ''}
            ${o.taxes > 0 ? `Imp: $${o.taxes.toLocaleString()} · ` : ''}
          </div>
          <strong>$${(o.total || 0).toLocaleString()}</strong>
        </div>
        ${o.notes ? `<div class="text-sm text-muted mt-8">${o.notes}</div>` : ''}
      </div>
    `;
  }).join('');

  // Click en pedido → detalle con acciones de estado
  document.querySelectorAll('.order-card').forEach(card => {
    card.addEventListener('click', () => {
      const order = orders.find(o => o.id === card.dataset.id);
      if (order) openOrderDetail(order, container, sb);
    });
  });
}

// ============================================
// Detalle de pedido — cambiar estado
// ============================================
async function openOrderDetail(order, container, sb) {
  const statusLabels = { ordered: 'Pedido', in_transit: 'En tránsito', received: 'Recibido', cancelled: 'Cancelado' };
  const items = order.purchase_order_items || [];

  let actionsHTML = '';
  if (order.status === 'ordered') {
    actionsHTML = `
      <button class="btn btn-primary btn-full mb-8" id="od-transit">Marcar en tránsito</button>
      <button class="btn btn-outline btn-full text-danger" id="od-cancel">Cancelar pedido</button>
    `;
  } else if (order.status === 'in_transit') {
    actionsHTML = `
      <button class="btn btn-primary btn-full mb-8" id="od-received">Marcar como recibido</button>
      <p class="text-sm text-muted mt-8" style="text-align:center">Al recibir se agregará el stock a ${order.destination_location?.name || 'Casa'}</p>
    `;
  }

  const html = `
    <div class="flex-between mb-16">
      <div>
        ${order.supplier ? `<div class="text-sm text-muted">Proveedor</div><div class="list-item-title">${order.supplier}</div>` : ''}
        ${order.destination_location?.name ? `<div class="text-sm text-muted mt-8">Destino</div><div class="text-sm"><strong>${order.destination_location.name}</strong></div>` : ''}
      </div>
      <span class="badge ${order.status === 'received' ? 'badge-stock' : order.status === 'in_transit' ? 'badge-low' : 'badge-consign'}">${statusLabels[order.status]}</span>
    </div>

    <div class="card" style="cursor:default;background:var(--surface-container)">
      <div class="flex-between"><span>Productos</span><strong>$${((order.total || 0) - (order.shipping_cost || 0) - (order.taxes || 0)).toLocaleString()}</strong></div>
      ${order.shipping_cost > 0 ? `<div class="flex-between"><span>Envío</span><strong>$${order.shipping_cost.toLocaleString()}</strong></div>` : ''}
      ${order.taxes > 0 ? `<div class="flex-between"><span>Impuestos</span><strong>$${order.taxes.toLocaleString()}</strong></div>` : ''}
      <div class="flex-between mt-8" style="border-top:1px solid rgba(194,199,209,0.1);padding-top:8px">
        <strong>Total</strong><strong class="text-accent">$${(order.total || 0).toLocaleString()}</strong>
      </div>
    </div>

    <div class="section-divider mb-8 mt-16"><span class="section-label">Artículos</span></div>
    ${items.map(i => `
      <div class="list-item">
        <div class="list-item-content">
          <div class="list-item-title">${i.product_variants?.products?.name || 'Producto'}</div>
          <div class="list-item-sub">${i.product_variants?.color || ''} · ${i.product_variants?.size || ''}</div>
          ${i.source_url ? i.source_url.split('\n').map((url, idx) => `<a href="${url}" target="_blank" class="text-sm text-accent" style="display:inline-block;margin-top:2px">Link ${i.source_url.includes('\n') ? (idx + 1) : ''} ↗</a>`).join(' ') : ''}
        </div>
        <div class="list-item-right">
          <strong>x${i.quantity}</strong>
          <div class="text-sm text-muted">$${i.unit_cost} c/u</div>
        </div>
      </div>
    `).join('')}

    ${order.notes ? `<div class="card mt-16" style="cursor:default;background:var(--surface-container)"><div class="text-sm">${order.notes}</div></div>` : ''}

    <div class="mt-16">${actionsHTML}</div>
  `;

  UI.openSheet('Pedido', html);

  // Acciones de estado
  const btnTransit = document.getElementById('od-transit');
  const btnReceived = document.getElementById('od-received');
  const btnCancel = document.getElementById('od-cancel');

  if (btnTransit) {
    btnTransit.addEventListener('click', async () => {
      await sb.from('purchase_orders').update({ status: 'in_transit' }).eq('id', order.id);
      UI.closeSheet();
      UI.toast('Pedido en tránsito');
      await renderOrdersList(container, sb);
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', async () => {
      const ok = await UI.confirm('¿Cancelar este pedido?');
      if (!ok) return;
      await sb.from('purchase_orders').update({ status: 'cancelled' }).eq('id', order.id);
      UI.closeSheet();
      UI.toast('Pedido cancelado');
      await renderOrdersList(container, sb);
    });
  }

  if (btnReceived) {
    btnReceived.addEventListener('click', async () => {
      // Determinar ubicación destino
      let destLocId = order.destination_location_id;
      let destLocName = order.destination_location?.name || 'Casa';
      if (!destLocId) {
        // Fallback a Casa si no se guardó destino
        const { data: casaLoc } = await sb.from('locations').select('id').eq('name', 'Casa').single();
        if (!casaLoc) { UI.toast('No se encontró ubicación', 'error'); return; }
        destLocId = casaLoc.id;
        destLocName = 'Casa';
      }

      const ok = await UI.confirm(`¿Marcar como recibido? Se agregarán las unidades al stock de ${destLocName}.`);
      if (!ok) return;

      // Agregar stock por cada ítem
      for (const item of items) {
        // Necesitamos el variant_id real
        const { data: oiData } = await sb.from('purchase_order_items').select('variant_id').eq('id', item.id).single();
        if (!oiData) continue;

        // Upsert inventario en la ubicación destino
        const { data: existing } = await sb.from('inventory')
          .select('id, quantity').eq('variant_id', oiData.variant_id).eq('location_id', destLocId).single();

        if (existing) {
          await sb.from('inventory').update({ quantity: existing.quantity + item.quantity, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await sb.from('inventory').insert({ variant_id: oiData.variant_id, location_id: destLocId, quantity: item.quantity });
        }

        // Registrar movimiento
        await sb.from('inventory_movements').insert({
          variant_id: oiData.variant_id, to_location_id: destLocId, quantity: item.quantity,
          type: 'ingreso', notes: `Pedido recibido${order.supplier ? ': ' + order.supplier : ''} → ${destLocName}`
        });
      }

      // Actualizar estado
      await sb.from('purchase_orders').update({ status: 'received' }).eq('id', order.id);

      UI.closeSheet();
      UI.toast('Pedido recibido — stock actualizado');
      await renderOrdersList(container, sb);
    });
  }
}

// ============================================
// Crear nuevo pedido
// ============================================
async function openNewOrderForm(container, sb) {
  const { data: products } = await sb
    .from('products')
    .select('id, name, cost, product_variants(id, size, color)')
    .eq('active', true)
    .order('name');

  const { data: locations } = await sb.from('locations').select('id, name').eq('active', true);

  const html = `
    <form id="new-order-form">
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Proveedor (opcional)</label>
          <input type="text" id="no-supplier" placeholder="Ej: Temu, Shein...">
        </div>
        <div class="form-group" style="flex:1">
          <label>Destino</label>
          <select id="no-destination">
            ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Envío ($)</label>
          <input type="number" id="no-shipping" step="0.01" min="0" value="0" placeholder="0">
        </div>
        <div class="form-group" style="flex:1">
          <label>Impuestos ($)</label>
          <input type="number" id="no-taxes" step="0.01" min="0" value="0" placeholder="0">
        </div>
      </div>
      <div class="form-group">
        <label>Fecha estimada de llegada</label>
        <input type="date" id="no-arrival">
      </div>
      <div class="form-group">
        <label>Notas</label>
        <input type="text" id="no-notes" placeholder="Opcional">
      </div>

      <div class="section-divider mt-16 mb-16"><span class="section-label">Artículos del pedido</span></div>

      <div id="order-items-container"></div>
      <button type="button" class="btn btn-outline btn-sm mt-8 btn-full" id="add-order-item">+ Agregar artículo</button>

      <div class="card sale-preview mt-16 mb-16" id="order-total-preview" style="cursor:default">
        <p class="text-sm text-muted">Agrega artículos al pedido</p>
      </div>

      <button type="submit" class="btn btn-primary btn-full" id="no-submit">Crear pedido</button>
    </form>
  `;

  UI.openSheet('Nuevo pedido', html);
  let itemIndex = 0;

  let productsList = products || [];

  const addItemRow = () => {
    const idx = itemIndex++;
    document.getElementById('order-items-container').insertAdjacentHTML('beforeend', `
      <div class="card order-item-row" data-idx="${idx}" style="cursor:default;padding:14px;margin-bottom:10px">
        <div class="form-group" style="margin-bottom:10px">
          <select class="oi-product" data-idx="${idx}">
            <option value="">Seleccionar producto...</option>
            ${productsList.map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} ($${p.cost} c/u)</option>`).join('')}
            <option value="__new__">＋ Crear producto nuevo...</option>
          </select>
        </div>
        <div class="form-row" style="margin-bottom:10px">
          <div class="form-group" style="flex:1;margin-bottom:0">
            <label style="font-size:0.7rem">Talla</label>
            <select class="oi-size" data-idx="${idx}" disabled>
              <option value="">—</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <label style="font-size:0.7rem">Color</label>
            <select class="oi-color" data-idx="${idx}" disabled>
              <option value="">—</option>
            </select>
          </div>
        </div>
        <input type="hidden" class="oi-variant" data-idx="${idx}" value="">
        <div class="form-row">
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="oi-qty" data-idx="${idx}" min="1" value="1" placeholder="Cant.">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="oi-cost" data-idx="${idx}" step="0.01" min="0" placeholder="Costo unit.">
          </div>
          <button type="button" class="remove-variant oi-remove" data-idx="${idx}" style="margin-bottom:0">&times;</button>
        </div>
        <div class="oi-links-container" data-idx="${idx}" style="margin-top:8px">
          <div class="form-group" style="margin-bottom:0">
            <input type="url" class="oi-source-url" data-idx="${idx}" placeholder="Link del producto (Temu, Shein...)">
          </div>
          <div class="form-row mt-8" style="gap:6px;margin-bottom:0;justify-content:flex-end">
            <button type="button" class="btn-icon oi-add-link" data-idx="${idx}" title="Agregar otro link" style="flex-shrink:0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
      </div>
    `);
  };

  // Agregar primer ítem
  addItemRow();

  document.getElementById('add-order-item').addEventListener('click', addItemRow);

  // Resolver variante desde talla+color
  function resolveVariant(idx) {
    const productId = document.querySelector(`.oi-product[data-idx="${idx}"]`)?.value;
    const size = document.querySelector(`.oi-size[data-idx="${idx}"]`)?.value;
    const color = document.querySelector(`.oi-color[data-idx="${idx}"]`)?.value;
    const hiddenInput = document.querySelector(`.oi-variant[data-idx="${idx}"]`);
    if (!productId || !size || !color) { hiddenInput.value = ''; return; }
    const product = productsList.find(p => p.id === productId);
    const variant = (product?.product_variants || []).find(v => v.size === size && v.color === color);
    hiddenInput.value = variant ? variant.id : '';
  }

  // Delegated events para los ítems
  document.getElementById('order-items-container').addEventListener('change', (e) => {
    if (e.target.classList.contains('oi-product')) {
      const idx = e.target.dataset.idx;
      const productId = e.target.value;
      const sizeSelect = document.querySelector(`.oi-size[data-idx="${idx}"]`);
      const colorSelect = document.querySelector(`.oi-color[data-idx="${idx}"]`);
      const costInput = document.querySelector(`.oi-cost[data-idx="${idx}"]`);

      // Crear producto nuevo inline
      if (productId === '__new__') {
        e.target.value = ''; // reset select
        UI.closeSheet();
        openProductFormForOrder(container, sb, async (newProduct) => {
          // Recargar productos y reabrir formulario de pedido
          const { data: refreshed } = await sb
            .from('products')
            .select('id, name, cost, product_variants(id, size, color)')
            .eq('active', true)
            .order('name');
          productsList = refreshed || [];
          // Re-abrir el formulario de pedido con el producto nuevo pre-seleccionado
          UI.toast('Producto creado — agrégalo al pedido');
          openNewOrderForm(container, sb);
        });
        return;
      }

      if (!productId) {
        sizeSelect.innerHTML = '<option value="">—</option>';
        sizeSelect.disabled = true;
        colorSelect.innerHTML = '<option value="">—</option>';
        colorSelect.disabled = true;
        return;
      }

      const product = productsList.find(p => p.id === productId);
      costInput.value = product.cost;

      const sizes = [...new Set((product.product_variants || []).map(v => v.size))];
      const colors = [...new Set((product.product_variants || []).map(v => v.color))];

      sizeSelect.innerHTML = sizes.map(s => `<option value="${s}">${s}</option>`).join('')
        + '<option value="__new_size__">+ Nueva talla...</option>';
      sizeSelect.disabled = false;
      colorSelect.innerHTML = colors.map(c => `<option value="${c}">${c}</option>`).join('')
        + '<option value="__new_color__">+ Nuevo color...</option>';
      colorSelect.disabled = false;

      resolveVariant(idx);
      updateOrderTotal();
    }

    // Nueva talla
    if (e.target.classList.contains('oi-size') && e.target.value === '__new_size__') {
      const idx = e.target.dataset.idx;
      const productId = document.querySelector(`.oi-product[data-idx="${idx}"]`)?.value;
      const product = productsList.find(p => p.id === productId);
      if (!product) return;

      const existingSizes = [...new Set((product.product_variants || []).map(v => v.size))];
      const ALL_SIZES = ['única', 'N/A', '0-3', '3-6', '6-9', '9-12', '12-18', '18-24'];
      const availableSizes = ALL_SIZES.filter(s => !existingSizes.includes(s));

      e.target.value = existingSizes[0] || '';

      if (availableSizes.length === 0) {
        UI.toast('Ya tiene todas las tallas', 'error');
        return;
      }

      const sizeHtml = `
        <p class="text-sm text-muted mb-8">Selecciona talla a agregar para <strong>${product.name}</strong>:</p>
        <div class="chip-selector" id="new-size-chips">
          ${availableSizes.map(s => `<button type="button" class="chip" data-value="${s}">${s}</button>`).join('')}
        </div>
        <button class="btn btn-primary btn-full mt-16" id="new-size-confirm" disabled>Agregar talla</button>
      `;
      UI.openSheet('Nueva talla', sizeHtml);

      let selectedSize = null;
      document.getElementById('new-size-chips').addEventListener('click', (ev) => {
        const chip = ev.target.closest('.chip');
        if (!chip) return;
        document.querySelectorAll('#new-size-chips .chip').forEach(c => c.classList.remove('chip-active'));
        chip.classList.add('chip-active');
        selectedSize = chip.dataset.value;
        document.getElementById('new-size-confirm').disabled = false;
      });

      document.getElementById('new-size-confirm').addEventListener('click', async () => {
        if (!selectedSize) return;
        const btn = document.getElementById('new-size-confirm');
        await UI.withLoading(btn, async () => {
          const existingColors = [...new Set((product.product_variants || []).map(v => v.color))];
          const productCode = product.code || await SKU.generateProductCode(sb);
          if (!product.code) {
            await sb.from('products').update({ code: productCode }).eq('id', product.id);
            product.code = productCode;
          }

          for (const color of existingColors) {
            const sku = await SKU.ensureUniqueSKU(sb, SKU.generateSKU(productCode, color, selectedSize));
            const { data: newVar } = await sb.from('product_variants')
              .insert({ product_id: product.id, size: selectedSize, color, sku })
              .select().single();
            if (newVar) product.product_variants.push(newVar);
          }

          UI.closeSheet();
          UI.toast(`Talla ${selectedSize} agregada`);

          // Refrescar dropdowns del ítem
          const sizeSelect = document.querySelector(`.oi-size[data-idx="${idx}"]`);
          const colorSelect = document.querySelector(`.oi-color[data-idx="${idx}"]`);
          const sizes = [...new Set(product.product_variants.map(v => v.size))];
          const colors = [...new Set(product.product_variants.map(v => v.color))];
          sizeSelect.innerHTML = sizes.map(s => `<option value="${s}">${s}</option>`).join('')
            + '<option value="__new_size__">+ Nueva talla...</option>';
          colorSelect.innerHTML = colors.map(c => `<option value="${c}">${c}</option>`).join('')
            + '<option value="__new_color__">+ Nuevo color...</option>';
          sizeSelect.value = selectedSize;
          resolveVariant(idx);
        });
      });
      return;
    }

    // Nuevo color
    if (e.target.classList.contains('oi-color') && e.target.value === '__new_color__') {
      const idx = e.target.dataset.idx;
      const productId = document.querySelector(`.oi-product[data-idx="${idx}"]`)?.value;
      const product = productsList.find(p => p.id === productId);
      if (!product) return;

      const existingColors = [...new Set((product.product_variants || []).map(v => v.color))];
      e.target.value = existingColors[0] || '';

      const colorHtml = `
        <p class="text-sm text-muted mb-8">Nuevo color para <strong>${product.name}</strong>:</p>
        <div class="form-group">
          <input type="text" id="new-color-input" placeholder="Nombre del color (ej: rosa)" autofocus>
        </div>
        <button class="btn btn-primary btn-full" id="new-color-confirm">Agregar color</button>
      `;
      UI.openSheet('Nuevo color', colorHtml);

      document.getElementById('new-color-confirm').addEventListener('click', async () => {
        const colorName = document.getElementById('new-color-input').value.trim().toLowerCase();
        if (!colorName) { UI.toast('Escribe un color', 'error'); return; }
        if (existingColors.includes(colorName)) { UI.toast('Ese color ya existe', 'error'); return; }

        const btn = document.getElementById('new-color-confirm');
        await UI.withLoading(btn, async () => {
          const existingSizes = [...new Set((product.product_variants || []).map(v => v.size))];
          const productCode = product.code || await SKU.generateProductCode(sb);
          if (!product.code) {
            await sb.from('products').update({ code: productCode }).eq('id', product.id);
            product.code = productCode;
          }

          for (const size of existingSizes) {
            const sku = await SKU.ensureUniqueSKU(sb, SKU.generateSKU(productCode, colorName, size));
            const { data: newVar } = await sb.from('product_variants')
              .insert({ product_id: product.id, size, color: colorName, sku })
              .select().single();
            if (newVar) product.product_variants.push(newVar);
          }

          UI.closeSheet();
          UI.toast(`Color ${colorName} agregado`);

          // Refrescar dropdowns del ítem
          const sizeSelect = document.querySelector(`.oi-size[data-idx="${idx}"]`);
          const colorSelect = document.querySelector(`.oi-color[data-idx="${idx}"]`);
          const sizes = [...new Set(product.product_variants.map(v => v.size))];
          const colors = [...new Set(product.product_variants.map(v => v.color))];
          sizeSelect.innerHTML = sizes.map(s => `<option value="${s}">${s}</option>`).join('')
            + '<option value="__new_size__">+ Nueva talla...</option>';
          colorSelect.innerHTML = colors.map(c => `<option value="${c}">${c}</option>`).join('')
            + '<option value="__new_color__">+ Nuevo color...</option>';
          colorSelect.value = colorName;
          resolveVariant(idx);
        });
      });
      return;
    }

    if (e.target.classList.contains('oi-size') || e.target.classList.contains('oi-color')) {
      resolveVariant(e.target.dataset.idx);
    }
  });

  document.getElementById('order-items-container').addEventListener('input', (e) => {
    if (e.target.classList.contains('oi-qty') || e.target.classList.contains('oi-cost')) {
      updateOrderTotal();
    }
  });

  document.getElementById('order-items-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('oi-remove')) {
      const row = e.target.closest('.order-item-row');
      if (document.querySelectorAll('.order-item-row').length > 1) {
        row.remove();
        updateOrderTotal();
      }
    }
    // Agregar otro link
    if (e.target.closest('.oi-add-link')) {
      const btn = e.target.closest('.oi-add-link');
      const container = btn.closest('.oi-links-container');
      // Insertar antes del botón "+"
      btn.closest('.form-row').insertAdjacentHTML('beforebegin', `
        <div class="form-row mt-8 oi-extra-link" style="gap:6px;margin-bottom:0">
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="url" class="oi-source-url" placeholder="Otro link...">
          </div>
          <button type="button" class="btn-icon oi-remove-link" title="Quitar" style="margin-bottom:0;flex-shrink:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `);
    }
    // Quitar link extra
    if (e.target.closest('.oi-remove-link')) {
      e.target.closest('.oi-extra-link').remove();
    }
  });

  document.getElementById('no-shipping').addEventListener('input', updateOrderTotal);
  document.getElementById('no-taxes').addEventListener('input', updateOrderTotal);

  function updateOrderTotal() {
    const preview = document.getElementById('order-total-preview');
    let productTotal = 0;
    document.querySelectorAll('.order-item-row').forEach(row => {
      const qty = parseFloat(row.querySelector('.oi-qty')?.value) || 0;
      const cost = parseFloat(row.querySelector('.oi-cost')?.value) || 0;
      productTotal += qty * cost;
    });
    const shipping = parseFloat(document.getElementById('no-shipping').value) || 0;
    const taxes = parseFloat(document.getElementById('no-taxes').value) || 0;
    const total = productTotal + shipping + taxes;

    preview.innerHTML = `
      <div class="flex-between"><span>Productos</span><strong>$${productTotal.toLocaleString()}</strong></div>
      ${shipping > 0 ? `<div class="flex-between"><span>Envío</span><strong>$${shipping.toLocaleString()}</strong></div>` : ''}
      ${taxes > 0 ? `<div class="flex-between"><span>Impuestos</span><strong>$${taxes.toLocaleString()}</strong></div>` : ''}
      <div class="flex-between mt-8" style="border-top:1px solid rgba(194,199,209,0.1);padding-top:8px">
        <strong>Total</strong><strong class="text-accent">$${total.toLocaleString()}</strong>
      </div>
    `;
  }

  // Submit
  document.getElementById('new-order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('no-submit');
    await UI.withLoading(btn, async () => {
      const supplier = document.getElementById('no-supplier').value.trim() || '';
      const destination_location_id = document.getElementById('no-destination').value;
      const shipping_cost = parseFloat(document.getElementById('no-shipping').value) || 0;
      const taxes = parseFloat(document.getElementById('no-taxes').value) || 0;
      const estimated_arrival = document.getElementById('no-arrival').value || null;
      const notes = document.getElementById('no-notes').value.trim() || null;

      // Collect items
      const items = [];
      let productTotal = 0;
      document.querySelectorAll('.order-item-row').forEach(row => {
        const variantId = row.querySelector('.oi-variant')?.value;
        const qty = parseInt(row.querySelector('.oi-qty')?.value) || 0;
        const cost = parseFloat(row.querySelector('.oi-cost')?.value) || 0;
        const links = [...row.querySelectorAll('.oi-source-url')].map(i => i.value.trim()).filter(Boolean);
        const source_url = links.length > 0 ? links.join('\n') : null;
        if (variantId && qty > 0) {
          items.push({ variant_id: variantId, quantity: qty, unit_cost: cost, source_url });
          productTotal += qty * cost;
        }
      });

      if (items.length === 0) { UI.toast('Agrega al menos un artículo', 'error'); return; }

      const total = productTotal + shipping_cost + taxes;

      const { data: newOrder, error } = await sb.from('purchase_orders')
        .insert({ supplier, destination_location_id, shipping_cost, taxes, total, estimated_arrival, notes, status: 'ordered' })
        .select().single();

      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      for (const item of items) {
        await sb.from('purchase_order_items').insert({
          order_id: newOrder.id, variant_id: item.variant_id, quantity: item.quantity, unit_cost: item.unit_cost, source_url: item.source_url
        });
      }

      UI.closeSheet();
      UI.toast('Pedido creado');
      await renderOrdersList(container, sb);
    });
  });
}

// ============================================
// Crear producto nuevo desde pedidos (formulario rápido)
// ============================================
async function openProductFormForOrder(container, sb, onCreated) {
  const ALL_SIZES = ['única', 'N/A', '0-3', '3-6', '6-9', '9-12', '12-18', '18-24'];

  const html = `
    <form id="quick-product-form">
      <div class="form-group">
        <label>Nombre del producto *</label>
        <input type="text" id="qp-name" required placeholder="Ej: Overol de punto">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Costo ($)</label>
          <input type="number" id="qp-cost" step="0.01" min="0" placeholder="0.00">
        </div>
        <div class="form-group">
          <label>Precio venta ($)</label>
          <input type="number" id="qp-price" step="0.01" min="0" placeholder="0.00">
        </div>
      </div>

      <div class="section-divider mt-16 mb-16"><span class="section-label">Tallas</span></div>
      <div class="chip-selector" id="qp-sizes">
        ${ALL_SIZES.map(s => `<button type="button" class="chip" data-value="${s}">${s}</button>`).join('')}
      </div>

      <div class="section-divider mt-16 mb-16"><span class="section-label">Colores</span></div>
      <div class="chip-list" id="qp-colors"></div>
      <div class="form-row mt-8">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <input type="text" id="qp-color-input" placeholder="Agregar color (ej: rosa)">
        </div>
        <button type="button" class="btn btn-sm btn-outline" id="qp-add-color">+</button>
      </div>

      <button type="submit" class="btn btn-primary btn-full mt-16">Crear producto</button>
      <button type="button" class="btn btn-outline btn-full mt-8" id="qp-cancel">Cancelar</button>
    </form>
  `;

  UI.openSheet('Nuevo producto', html);

  // Tallas toggle
  document.getElementById('qp-sizes').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) chip.classList.toggle('chip-active');
  });

  // Colores
  const addColor = () => {
    const input = document.getElementById('qp-color-input');
    const color = input.value.trim().toLowerCase();
    if (!color) return;
    const existing = document.querySelectorAll('#qp-colors .chip');
    for (const c of existing) { if (c.dataset.value === color) return; }
    document.getElementById('qp-colors').insertAdjacentHTML('beforeend',
      `<span class="chip chip-active chip-removable" data-value="${color}">${color} <span class="chip-x">&times;</span></span>`
    );
    input.value = '';
  };
  document.getElementById('qp-add-color').addEventListener('click', addColor);
  document.getElementById('qp-color-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addColor(); }
  });
  document.getElementById('qp-colors').addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-x')) e.target.closest('.chip').remove();
  });

  // Cancelar
  document.getElementById('qp-cancel').addEventListener('click', () => {
    UI.closeSheet();
    openNewOrderForm(container, sb);
  });

  // Submit
  document.getElementById('quick-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {
      const name = document.getElementById('qp-name').value.trim();
      const cost = parseFloat(document.getElementById('qp-cost').value) || 0;
      const sale_price = parseFloat(document.getElementById('qp-price').value) || 0;

      const sizes = [...document.querySelectorAll('#qp-sizes .chip-active')].map(c => c.dataset.value);
      const colors = [...document.querySelectorAll('#qp-colors .chip')].map(c => c.dataset.value);
      const s = sizes.length > 0 ? sizes : ['única'];
      const c = colors.length > 0 ? colors : ['único'];

      const productCode = await SKU.generateProductCode(sb);
      const { data: newProd, error } = await sb.from('products').insert({ name, cost, sale_price, code: productCode }).select().single();
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      for (const size of s) {
        for (const color of c) {
          const sku = await SKU.ensureUniqueSKU(sb, SKU.generateSKU(productCode, color, size));
          await sb.from('product_variants').insert({ product_id: newProd.id, size, color, sku });
        }
      }

      UI.closeSheet();
      if (onCreated) onCreated(newProd);
    });
  });
}
