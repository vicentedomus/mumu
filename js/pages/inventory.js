// Inventario — lista de productos, detalle, CRUD, traslados
Router.register('#/inventory', async (container) => {
  document.getElementById('page-title').textContent = 'Inventario';

  const sb = getSupabase();
  if (!sb) return;

  await renderProductList(container, sb);
});

// ============================================
// Render lista de productos
// ============================================
async function renderProductList(container, sb) {
  const { data: products, error } = await sb
    .from('products')
    .select(`
      id, code, name, cost, sale_price, image_url,
      product_variants (
        id, size, color, sku,
        inventory ( quantity, location_id, locations ( name ) )
      )
    `)
    .eq('active', true)
    .order('name');

  if (error) {
    container.innerHTML = `<p class="text-danger">Error cargando productos: ${error.message}</p>`;
    return;
  }

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img src="/assets/mumu-shopping.svg" alt="" style="width:120px;height:120px;opacity:0.6;margin-bottom:16px">
        <p>No hay productos todavía</p>
        <p class="text-sm mt-8">Toca el <strong>+</strong> para agregar uno</p>
      </div>
    `;
    addFAB(() => openProductForm(null, container, sb));
    return;
  }

  container.innerHTML = `
    <div class="form-group mb-16">
      <input type="search" id="search-products" placeholder="Buscar producto...">
    </div>
    <div id="product-list">
      ${products.map(p => renderProductCard(p)).join('')}
    </div>
  `;

  // FAB para agregar producto
  addFAB(() => openProductForm(null, container, sb));

  // Búsqueda
  document.getElementById('search-products').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.product-card').forEach(card => {
      card.style.display = card.dataset.name.includes(q) ? '' : 'none';
    });
  });

  // Click en producto → detalle
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const product = products.find(p => p.id === card.dataset.id);
      if (product) openProductDetail(product, container, sb);
    });
  });
}

function renderProductCard(p) {
  const totalStock = (p.product_variants || []).reduce((sum, v) =>
    sum + (v.inventory || []).reduce((s, i) => s + i.quantity, 0), 0);
  const variants = (p.product_variants || []).length;
  const colors = [...new Set((p.product_variants || []).map(v => v.color))];

  return `
    <div class="card product-card" data-id="${p.id}" data-name="${p.name.toLowerCase()}">
      <div class="flex-between">
        <div>
          <div class="list-item-title">${p.name}</div>
          <div class="list-item-sub">${p.code} · ${variants} variante${variants !== 1 ? 's' : ''}</div>
          <div class="mt-8">
            ${colors.map(c => `<span class="color-tag">${c}</span>`).join('')}
          </div>
        </div>
        <div class="text-right">
          <div class="stat-value" style="font-size:1.3rem">${totalStock}</div>
          <span class="badge ${totalStock === 0 ? 'badge-low' : totalStock <= 3 ? 'badge-low' : 'badge-stock'}">
            ${totalStock === 0 ? 'Sin stock' : totalStock <= 3 ? 'Stock bajo' : 'En stock'}
          </span>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// FAB helper
// ============================================
function addFAB(onClick) {
  let fab = document.getElementById('fab-main');
  if (fab) fab.remove();
  fab = document.createElement('button');
  fab.id = 'fab-main';
  fab.className = 'fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.addEventListener('click', onClick);
  document.body.appendChild(fab);
}

// ============================================
// Formulario crear/editar producto
// ============================================
function openProductForm(product, container, sb) {
  const isEdit = !!product;
  const title = isEdit ? 'Editar producto' : 'Nuevo producto';

  const html = `
    <form id="product-form">
      <div class="form-group">
        <label for="pf-name">Nombre del producto *</label>
        <input type="text" id="pf-name" required value="${isEdit ? product.name : ''}" placeholder="Ej: Overol de punto">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pf-cost">Costo ($)</label>
          <input type="number" id="pf-cost" step="0.01" min="0" value="${isEdit ? product.cost : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="pf-price">Precio venta ($)</label>
          <input type="number" id="pf-price" step="0.01" min="0" value="${isEdit ? product.sale_price : ''}" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label for="pf-image">URL imagen (opcional)</label>
        <input type="url" id="pf-image" value="${isEdit ? (product.image_url || '') : ''}" placeholder="https://...">
      </div>

      <div class="section-divider mt-16 mb-16">
        <span class="section-label">Variantes (talla + color)</span>
      </div>

      <div id="variants-container">
        ${isEdit && product.product_variants ? product.product_variants.map((v, i) => variantRowHTML(i, v)).join('') : variantRowHTML(0)}
      </div>
      <button type="button" class="btn btn-outline btn-sm mt-8" id="add-variant-btn">+ Agregar variante</button>

      <button type="submit" class="btn btn-primary btn-full mt-16">${isEdit ? 'Guardar cambios' : 'Crear producto'}</button>
      ${isEdit ? '<button type="button" class="btn btn-outline btn-full mt-8 text-danger" id="delete-product-btn">Eliminar producto</button>' : ''}
    </form>
  `;

  const body = UI.openSheet(title, html);
  let variantCount = isEdit ? (product.product_variants?.length || 1) : 1;

  // Agregar variante
  document.getElementById('add-variant-btn').addEventListener('click', () => {
    const vc = document.getElementById('variants-container');
    vc.insertAdjacentHTML('beforeend', variantRowHTML(variantCount));
    variantCount++;
  });

  // Eliminar variante
  body.addEventListener('click', (e) => {
    if (e.target.closest('.remove-variant')) {
      const row = e.target.closest('.variant-row');
      if (document.querySelectorAll('.variant-row').length > 1) {
        row.remove();
      }
    }
  });

  // Submit
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('pf-name').value.trim();
    const cost = parseFloat(document.getElementById('pf-cost').value) || 0;
    const sale_price = parseFloat(document.getElementById('pf-price').value) || 0;
    const image_url = document.getElementById('pf-image').value.trim() || null;

    // Recoger variantes
    const variantRows = document.querySelectorAll('.variant-row');
    const variants = [];
    variantRows.forEach(row => {
      const size = row.querySelector('.vr-size').value.trim() || 'única';
      const color = row.querySelector('.vr-color').value.trim() || 'único';
      const existingId = row.dataset.variantId || null;
      variants.push({ size, color, id: existingId });
    });

    if (isEdit) {
      // Actualizar producto
      const { error } = await sb.from('products').update({ name, cost, sale_price, image_url }).eq('id', product.id);
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      // Agregar variantes nuevas (las que no tienen id)
      for (const v of variants) {
        if (!v.id) {
          await sb.from('product_variants').insert({
            product_id: product.id, size: v.size, color: v.color, sku: ''
          });
        }
      }
    } else {
      // Crear producto
      const { data: newProd, error } = await sb.from('products').insert({ name, cost, sale_price, image_url, code: '' }).select().single();
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      // Crear variantes
      for (const v of variants) {
        await sb.from('product_variants').insert({
          product_id: newProd.id, size: v.size, color: v.color, sku: ''
        });
      }
    }

    UI.closeSheet();
    UI.toast(isEdit ? 'Producto actualizado' : 'Producto creado');
    await renderProductList(container, sb);
  });

  // Eliminar
  if (isEdit) {
    document.getElementById('delete-product-btn').addEventListener('click', async () => {
      const ok = await UI.confirm(`¿Eliminar "${product.name}"? Se eliminarán todas sus variantes y stock.`);
      if (!ok) return;
      await sb.from('products').update({ active: false }).eq('id', product.id);
      UI.closeSheet();
      UI.toast('Producto eliminado');
      await renderProductList(container, sb);
    });
  }
}

function variantRowHTML(index, variant = null) {
  return `
    <div class="variant-row" data-variant-id="${variant?.id || ''}">
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Talla</label>
          <select class="vr-size">
            ${['única', '0-3', '3-6', '6-9', '9-12', '12-18', '18-24'].map(s =>
              `<option value="${s}" ${variant?.size === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label>Color</label>
          <input type="text" class="vr-color" value="${variant?.color || ''}" placeholder="Ej: rosa">
        </div>
        <button type="button" class="remove-variant" title="Quitar">&times;</button>
      </div>
    </div>
  `;
}

// ============================================
// Detalle de producto — stock por ubicación, acciones
// ============================================
async function openProductDetail(product, container, sb) {
  // Recargar datos frescos con inventario por ubicación
  const { data: variants } = await sb
    .from('product_variants')
    .select(`
      id, size, color, sku,
      inventory ( quantity, location_id, locations ( name, type ) )
    `)
    .eq('product_id', product.id)
    .eq('active', true);

  const { data: locations } = await sb.from('locations').select('id, name, type, commission_rate').eq('active', true);

  const margin = product.sale_price - product.cost;
  const marginPct = product.cost > 0 ? Math.round((margin / product.cost) * 100) : 0;

  let html = `
    <div class="flex-between mb-16">
      <div>
        <div class="text-sm text-muted">${product.code}</div>
        <div class="text-sm mt-8">Costo: <strong>$${product.cost}</strong> · Venta: <strong>$${product.sale_price}</strong></div>
        <div class="text-sm text-success">Margen: $${margin} (${marginPct}%)</div>
      </div>
      <button class="btn btn-sm btn-outline" id="edit-product-btn">Editar</button>
    </div>

    <div class="section-divider mb-8"><span class="section-label">Stock por variante</span></div>
  `;

  if (!variants || variants.length === 0) {
    html += '<p class="text-muted text-sm">Sin variantes</p>';
  } else {
    variants.forEach(v => {
      const stockByLoc = {};
      let total = 0;
      (v.inventory || []).forEach(inv => {
        stockByLoc[inv.locations?.name || '?'] = inv.quantity;
        total += inv.quantity;
      });

      html += `
        <div class="card variant-detail-card">
          <div class="flex-between">
            <div>
              <strong>${v.color}</strong> · ${v.size}
              <div class="text-sm text-muted">${v.sku}</div>
            </div>
            <div class="text-right">
              <span class="badge ${total === 0 ? 'badge-low' : 'badge-stock'}">${total} uds</span>
            </div>
          </div>
          <div class="stock-locations mt-8">
            ${locations.map(loc => {
              const qty = stockByLoc[loc.name] || 0;
              return `<div class="stock-loc-item">
                <span class="text-sm">${loc.name}</span>
                <span class="text-sm"><strong>${qty}</strong></span>
              </div>`;
            }).join('')}
          </div>
          <div class="variant-actions mt-8">
            <button class="btn btn-sm btn-outline action-add-stock" data-variant-id="${v.id}">+ Stock</button>
            <button class="btn btn-sm btn-outline action-transfer" data-variant-id="${v.id}">Trasladar</button>
            <button class="btn btn-sm btn-primary action-sell" data-variant-id="${v.id}">Vender</button>
          </div>
        </div>
      `;
    });
  }

  // Historial reciente
  html += `
    <div class="section-divider mt-16 mb-8"><span class="section-label">Movimientos recientes</span></div>
    <div id="movements-list"></div>
  `;

  const body = UI.openSheet(product.name, html);

  // Cargar movimientos
  loadMovements(product, variants, sb);

  // Edit
  document.getElementById('edit-product-btn').addEventListener('click', () => {
    UI.closeSheet();
    openProductForm(product, container, sb);
  });

  // Acciones por variante
  body.querySelectorAll('.action-add-stock').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddStockForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });

  body.querySelectorAll('.action-transfer').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTransferForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });

  body.querySelectorAll('.action-sell').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openQuickSaleForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });
}

async function loadMovements(product, variants, sb) {
  const variantIds = (variants || []).map(v => v.id);
  if (variantIds.length === 0) return;

  const { data: movements } = await sb
    .from('inventory_movements')
    .select('id, variant_id, quantity, type, notes, created_at, from_location:locations!from_location_id(name), to_location:locations!to_location_id(name)')
    .in('variant_id', variantIds)
    .order('created_at', { ascending: false })
    .limit(10);

  const el = document.getElementById('movements-list');
  if (!el) return;

  if (!movements || movements.length === 0) {
    el.innerHTML = '<p class="text-muted text-sm">Sin movimientos</p>';
    return;
  }

  const typeIcons = {
    ingreso: '📦', venta: '💰', traslado: '🔄', devolucion: '↩️', ajuste: '🔧'
  };
  const typeLabels = {
    ingreso: 'Ingreso', venta: 'Venta', traslado: 'Traslado', devolucion: 'Devolución', ajuste: 'Ajuste'
  };

  el.innerHTML = movements.map(m => {
    const variant = variants.find(v => v.id === m.variant_id);
    const locInfo = m.type === 'traslado'
      ? `${m.from_location?.name || '?'} → ${m.to_location?.name || '?'}`
      : m.from_location?.name || m.to_location?.name || '';
    return `
      <div class="list-item">
        <div style="font-size:1.2rem;width:28px">${typeIcons[m.type] || '📋'}</div>
        <div class="list-item-content">
          <div class="list-item-title">${typeLabels[m.type] || m.type} · x${m.quantity}</div>
          <div class="list-item-sub">${variant ? variant.color + ' ' + variant.size : ''} · ${locInfo}</div>
        </div>
        <div class="text-sm text-muted">${new Date(m.created_at).toLocaleDateString('es-CL')}</div>
      </div>
    `;
  }).join('');
}

// ============================================
// Agregar stock (ingreso)
// ============================================
function openAddStockForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  const html = `
    <form id="add-stock-form">
      <p class="text-sm text-muted mb-16">${product.name} · ${variant?.color} · ${variant?.size}</p>
      <div class="form-group">
        <label>Ubicación</label>
        <select id="as-location" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="as-quantity" min="1" value="1" required>
      </div>
      <div class="form-group">
        <label>Nota (opcional)</label>
        <input type="text" id="as-notes" placeholder="Ej: Llegó pedido Temu">
      </div>
      <button type="submit" class="btn btn-primary btn-full">Agregar stock</button>
    </form>
  `;

  UI.openSheet('Agregar stock', html);

  document.getElementById('add-stock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const locationId = document.getElementById('as-location').value;
    const quantity = parseInt(document.getElementById('as-quantity').value);
    const notes = document.getElementById('as-notes').value.trim() || null;

    // Upsert inventario
    const { data: existing } = await sb.from('inventory')
      .select('id, quantity').eq('variant_id', variantId).eq('location_id', locationId).single();

    if (existing) {
      await sb.from('inventory').update({ quantity: existing.quantity + quantity, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await sb.from('inventory').insert({ variant_id: variantId, location_id: locationId, quantity });
    }

    // Registrar movimiento
    await sb.from('inventory_movements').insert({
      variant_id: variantId, to_location_id: locationId, quantity, type: 'ingreso', notes
    });

    UI.closeSheet();
    UI.toast(`+${quantity} unidades agregadas`);
    await renderProductList(container, sb);
  });
}

// ============================================
// Trasladar stock
// ============================================
function openTransferForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  const html = `
    <form id="transfer-form">
      <p class="text-sm text-muted mb-16">${product.name} · ${variant?.color} · ${variant?.size}</p>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Desde</label>
          <select id="tf-from" required>
            ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label>Hacia</label>
          <select id="tf-to" required>
            ${locations.map((l, i) => `<option value="${l.id}" ${i === 1 ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="tf-quantity" min="1" value="1" required>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Trasladar</button>
    </form>
  `;

  UI.openSheet('Trasladar stock', html);

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fromId = document.getElementById('tf-from').value;
    const toId = document.getElementById('tf-to').value;
    const quantity = parseInt(document.getElementById('tf-quantity').value);

    if (fromId === toId) { UI.toast('Origen y destino son iguales', 'error'); return; }

    const { error } = await sb.rpc('transfer_stock', {
      p_variant_id: variantId, p_from_location: fromId, p_to_location: toId, p_quantity: quantity
    });

    if (error) {
      UI.toast(error.message.includes('insuficiente') ? 'Stock insuficiente en origen' : 'Error: ' + error.message, 'error');
      return;
    }

    UI.closeSheet();
    UI.toast(`${quantity} unidades trasladadas`);
    await renderProductList(container, sb);
  });
}

// ============================================
// Venta rápida desde inventario
// ============================================
function openQuickSaleForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  const html = `
    <form id="sale-form">
      <p class="text-sm text-muted mb-16">${product.name} · ${variant?.color} · ${variant?.size}</p>
      <div class="form-group">
        <label>Ubicación de venta</label>
        <select id="sf-location" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}${l.commission_rate > 0 ? ` (${l.commission_rate}% comisión)` : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="sf-quantity" min="1" value="1" required>
      </div>
      <div class="sale-preview card mt-8 mb-16" id="sale-preview">
        <div class="flex-between">
          <span>Precio unitario</span>
          <strong>$${product.sale_price}</strong>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Registrar venta</button>
    </form>
  `;

  UI.openSheet('Registrar venta', html);

  // Preview dinámico
  const updatePreview = () => {
    const qty = parseInt(document.getElementById('sf-quantity').value) || 1;
    const locId = document.getElementById('sf-location').value;
    const loc = locations.find(l => l.id === locId);
    const subtotal = product.sale_price * qty;
    const commission = subtotal * ((loc?.commission_rate || 0) / 100);
    const net = subtotal - commission;

    document.getElementById('sale-preview').innerHTML = `
      <div class="flex-between"><span>Precio unitario</span><strong>$${product.sale_price}</strong></div>
      <div class="flex-between"><span>Cantidad</span><span>x${qty}</span></div>
      <div class="flex-between"><span>Subtotal</span><strong>$${subtotal.toLocaleString()}</strong></div>
      ${commission > 0 ? `<div class="flex-between text-muted"><span>Comisión ${loc.commission_rate}%</span><span>-$${commission.toLocaleString()}</span></div>` : ''}
      <div class="flex-between mt-8" style="border-top:1px solid var(--color-border);padding-top:8px">
        <strong>Neto</strong><strong class="text-accent">$${net.toLocaleString()}</strong>
      </div>
    `;
  };

  document.getElementById('sf-quantity').addEventListener('input', updatePreview);
  document.getElementById('sf-location').addEventListener('change', updatePreview);
  updatePreview();

  document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const locationId = document.getElementById('sf-location').value;
    const quantity = parseInt(document.getElementById('sf-quantity').value);

    const { error } = await sb.rpc('register_sale', {
      p_variant_id: variantId, p_location_id: locationId, p_quantity: quantity
    });

    if (error) {
      UI.toast(error.message.includes('insuficiente') ? 'Stock insuficiente' : 'Error: ' + error.message, 'error');
      return;
    }

    UI.closeSheet();
    UI.toast('Venta registrada');
    await renderProductList(container, sb);
  });
}
