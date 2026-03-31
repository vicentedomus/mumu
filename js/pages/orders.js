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
      id, supplier, status, total, shipping_cost, taxes, estimated_arrival, notes, created_at,
      purchase_order_items ( id, quantity, unit_cost, product_variants ( color, size, products ( name ) ) )
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
            <div class="list-item-title">${o.supplier}</div>
            <div class="list-item-sub">${new Date(o.created_at).toLocaleDateString('es-CL')}${o.estimated_arrival ? ' · Llega: ' + new Date(o.estimated_arrival).toLocaleDateString('es-CL') : ''}</div>
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
      <p class="text-sm text-muted mt-8" style="text-align:center">Al recibir se agregará el stock automáticamente</p>
    `;
  }

  const html = `
    <div class="flex-between mb-16">
      <div>
        <div class="text-sm text-muted">Proveedor</div>
        <div class="list-item-title">${order.supplier}</div>
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
      const ok = await UI.confirm('¿Marcar como recibido? Se agregarán las unidades al stock de Casa.');
      if (!ok) return;

      // Obtener ubicación "Casa"
      const { data: casaLoc } = await sb.from('locations').select('id').eq('name', 'Casa').single();
      if (!casaLoc) { UI.toast('No se encontró ubicación Casa', 'error'); return; }

      // Agregar stock por cada ítem
      for (const item of items) {
        const variantId = item.product_variants ? item.id : null;
        // Necesitamos el variant_id real
        const { data: oiData } = await sb.from('purchase_order_items').select('variant_id').eq('id', item.id).single();
        if (!oiData) continue;

        // Upsert inventario
        const { data: existing } = await sb.from('inventory')
          .select('id, quantity').eq('variant_id', oiData.variant_id).eq('location_id', casaLoc.id).single();

        if (existing) {
          await sb.from('inventory').update({ quantity: existing.quantity + item.quantity, updated_at: new Date().toISOString() }).eq('id', existing.id);
        } else {
          await sb.from('inventory').insert({ variant_id: oiData.variant_id, location_id: casaLoc.id, quantity: item.quantity });
        }

        // Registrar movimiento
        await sb.from('inventory_movements').insert({
          variant_id: oiData.variant_id, to_location_id: casaLoc.id, quantity: item.quantity,
          type: 'ingreso', notes: `Pedido recibido: ${order.supplier}`
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

  const html = `
    <form id="new-order-form">
      <div class="form-group">
        <label>Proveedor</label>
        <input type="text" id="no-supplier" required placeholder="Ej: Temu, Shein, etc.">
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

  const addItemRow = () => {
    const idx = itemIndex++;
    document.getElementById('order-items-container').insertAdjacentHTML('beforeend', `
      <div class="card order-item-row" data-idx="${idx}" style="cursor:default;padding:14px;margin-bottom:10px">
        <div class="form-group" style="margin-bottom:10px">
          <select class="oi-product" data-idx="${idx}">
            <option value="">Seleccionar producto...</option>
            ${(products || []).map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} ($${p.cost} c/u)</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <select class="oi-variant" data-idx="${idx}" disabled>
            <option value="">Primero selecciona producto</option>
          </select>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="oi-qty" data-idx="${idx}" min="1" value="1" placeholder="Cant.">
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="oi-cost" data-idx="${idx}" step="0.01" min="0" placeholder="Costo unit.">
          </div>
          <button type="button" class="remove-variant oi-remove" data-idx="${idx}" style="margin-bottom:0">&times;</button>
        </div>
      </div>
    `);
  };

  // Agregar primer ítem
  addItemRow();

  document.getElementById('add-order-item').addEventListener('click', addItemRow);

  // Delegated events para los ítems
  document.getElementById('order-items-container').addEventListener('change', (e) => {
    if (e.target.classList.contains('oi-product')) {
      const idx = e.target.dataset.idx;
      const productId = e.target.value;
      const variantSelect = document.querySelector(`.oi-variant[data-idx="${idx}"]`);
      const costInput = document.querySelector(`.oi-cost[data-idx="${idx}"]`);

      if (!productId) {
        variantSelect.innerHTML = '<option value="">Primero selecciona producto</option>';
        variantSelect.disabled = true;
        return;
      }

      const product = products.find(p => p.id === productId);
      costInput.value = product.cost;
      variantSelect.innerHTML = (product.product_variants || []).map(v =>
        `<option value="${v.id}">${v.color} · ${v.size}</option>`
      ).join('');
      variantSelect.disabled = false;
      updateOrderTotal();
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

    const supplier = document.getElementById('no-supplier').value.trim();
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
      if (variantId && qty > 0) {
        items.push({ variant_id: variantId, quantity: qty, unit_cost: cost });
        productTotal += qty * cost;
      }
    });

    if (items.length === 0) { UI.toast('Agrega al menos un artículo', 'error'); return; }

    const total = productTotal + shipping_cost + taxes;

    // Crear pedido
    const { data: newOrder, error } = await sb.from('purchase_orders')
      .insert({ supplier, shipping_cost, taxes, total, estimated_arrival, notes, status: 'ordered' })
      .select().single();

    if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

    // Crear ítems
    for (const item of items) {
      await sb.from('purchase_order_items').insert({
        order_id: newOrder.id, variant_id: item.variant_id, quantity: item.quantity, unit_cost: item.unit_cost
      });
    }

    UI.closeSheet();
    UI.toast('Pedido creado');
    await renderOrdersList(container, sb);
  });
}
