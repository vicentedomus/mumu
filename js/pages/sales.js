// Ventas — listado con filtros + registro de venta multi-producto
Router.register('#/sales', async (container) => {
  document.getElementById('page-title').textContent = 'Ventas';

  const sb = getSupabase();
  if (!sb) return;

  // Cargar ubicaciones para filtro y formulario
  const { data: locations } = await sb.from('locations').select('id, name, type, commission_rate').eq('active', true);

  // FAB para nueva venta
  addFAB(() => openNewSaleForm(locations, container, sb));

  await renderSalesList(container, sb, locations, {});
});

// ============================================
// Render lista de ventas con filtros
// ============================================
async function renderSalesList(container, sb, locations, filters) {
  let query = sb
    .from('sales')
    .select(`
      id, quantity, unit_price, commission_amount, created_at,
      product_variants ( sku, color, size, products ( name ) ),
      locations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  // Aplicar filtros
  if (filters.locationId) {
    query = query.eq('location_id', filters.locationId);
  }
  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo + 'T23:59:59');
  }

  const { data: sales, error } = await query;

  if (error) {
    container.innerHTML = `<p class="text-danger">Error: ${error.message}</p>`;
    return;
  }

  // Calcular totales
  const totalRevenue = (sales || []).reduce((sum, s) => sum + (s.unit_price * s.quantity), 0);
  const totalCommissions = (sales || []).reduce((sum, s) => sum + (s.commission_amount || 0), 0);
  const totalNet = totalRevenue - totalCommissions;

  container.innerHTML = `
    <div class="sales-filters mb-16">
      <div class="form-row">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <select id="filter-location">
            <option value="">Todas las ubicaciones</option>
            ${locations.map(l => `<option value="${l.id}" ${filters.locationId === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row mt-8">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <input type="date" id="filter-from" value="${filters.dateFrom || ''}" placeholder="Desde">
        </div>
        <div class="form-group" style="flex:1;margin-bottom:0">
          <input type="date" id="filter-to" value="${filters.dateTo || ''}" placeholder="Hasta">
        </div>
      </div>
    </div>

    <div class="stats-grid" style="grid-template-columns:1fr 1fr 1fr;gap:10px">
      <div class="stat-card" style="padding:14px 10px">
        <div class="stat-value" style="font-size:1.2rem">$${totalRevenue.toLocaleString()}</div>
        <div class="stat-label">Bruto</div>
      </div>
      <div class="stat-card" style="padding:14px 10px">
        <div class="stat-value" style="font-size:1.2rem;color:var(--danger)">-$${totalCommissions.toLocaleString()}</div>
        <div class="stat-label">Comisiones</div>
      </div>
      <div class="stat-card" style="padding:14px 10px">
        <div class="stat-value" style="font-size:1.2rem;color:var(--sage-dark)">$${totalNet.toLocaleString()}</div>
        <div class="stat-label">Neto</div>
      </div>
    </div>

    <div class="card" style="cursor:default">
      <div class="card-title">${(sales || []).length} ventas</div>
      ${!sales || sales.length === 0
        ? `<div class="empty-state" style="padding:24px 0">
            <img src="/assets/mumu-shopping.svg" alt="" style="width:80px;height:80px;opacity:0.5;margin-bottom:12px">
            <p class="text-sm">Sin ventas en este período</p>
          </div>`
        : sales.map(s => `
          <div class="swipeable-item" data-sale-id="${s.id}">
            <div class="swipeable-delete" aria-label="Eliminar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Eliminar</span>
            </div>
            <div class="swipeable-content">
              <div class="list-item">
                <div class="movement-icon movement-icon-venta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <div class="list-item-content">
                  <div class="list-item-title">${s.product_variants?.products?.name || 'Producto'}</div>
                  <div class="list-item-sub">${s.product_variants?.color || ''} ${s.product_variants?.size || ''} · x${s.quantity} · ${s.locations?.name || ''}</div>
                </div>
                <div class="list-item-right">
                  <strong>$${(s.unit_price * s.quantity).toLocaleString()}</strong>
                  ${s.commission_amount > 0 ? `<div class="text-sm text-muted">-$${s.commission_amount.toLocaleString()}</div>` : ''}
                  <div class="text-sm text-muted">${new Date(s.created_at).toLocaleDateString('es-CL')}</div>
                </div>
              </div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;

  // Filter listeners
  const applyFilters = () => {
    const newFilters = {
      locationId: document.getElementById('filter-location').value || null,
      dateFrom: document.getElementById('filter-from').value || null,
      dateTo: document.getElementById('filter-to').value || null,
    };
    renderSalesList(container, sb, locations, newFilters);
  };

  document.getElementById('filter-location').addEventListener('change', applyFilters);
  document.getElementById('filter-from').addEventListener('change', applyFilters);
  document.getElementById('filter-to').addEventListener('change', applyFilters);

  // Click para abrir detalle de venta
  container.querySelectorAll('.swipeable-content').forEach(el => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const saleId = el.closest('.swipeable-item')?.dataset.saleId;
      const sale = sales.find(s => s.id === saleId);
      if (sale) openSaleDetail(sale);
    });
  });

  // Swipe-to-delete para ventas
  initSwipeToDelete(container, async (item) => {
    const saleId = item.dataset.saleId;
    const sale = sales.find(s => s.id === saleId);
    const label = `${sale?.product_variants?.products?.name || 'Producto'} (x${sale?.quantity})`;
    const ok = await UI.confirm(`¿Eliminar venta de ${label}? Se devolverá el stock.`);
    if (!ok) return false;

    const { error } = await sb.rpc('delete_sale', { p_sale_id: saleId });
    if (error) { UI.toast('Error: ' + error.message, 'error'); return false; }

    UI.toast('Venta eliminada — stock devuelto');
    await renderSalesList(container, sb, locations, filters);
    return true;
  });
}

// ============================================
// Nueva venta multi-producto
// ============================================
async function openNewSaleForm(locations, container, sb) {
  // Cargar productos con variantes que tengan stock
  const { data: products } = await sb
    .from('products')
    .select('id, name, cost, sale_price, product_variants(id, size, color, sku, inventory(quantity, location_id))')
    .eq('active', true)
    .eq('product_variants.active', true)
    .order('name');

  const html = `
    <form id="new-sale-form">
      <div class="form-group">
        <label>Punto de venta</label>
        <select id="ns-location" required>
          ${locations.map(l => `<option value="${l.id}" data-rate="${l.commission_rate}">${l.name}${l.commission_rate > 0 ? ` (${l.commission_rate}%)` : ''}</option>`).join('')}
        </select>
      </div>

      <div class="toggle-row mb-16" id="ns-personal-toggle">
        <div class="toggle-label">
          <div class="toggle-title">Venta personal</div>
          <div class="toggle-hint">Sin comisión aunque el PV normalmente cobre</div>
        </div>
        <button type="button" class="toggle-switch" id="ns-skip-commission" role="switch" aria-checked="false">
          <span class="toggle-knob"></span>
        </button>
      </div>

      <div class="section-divider mb-16"><span class="section-label">Productos</span></div>

      <div id="sale-cart-items"></div>
      <button type="button" class="btn btn-outline btn-sm mt-8 btn-full" id="add-cart-item">+ Agregar producto</button>

      <div class="card sale-preview mt-16 mb-16" id="ns-preview" style="cursor:default">
        <p class="text-sm text-muted">Agrega productos a la venta</p>
      </div>

      <button type="submit" class="btn btn-primary btn-full" id="ns-submit" disabled>Registrar venta</button>
    </form>
  `;

  UI.openSheet('Nueva venta', html);

  let cartIndex = 0;
  let skipCommission = false;

  // Toggle venta personal
  const toggleBtn = document.getElementById('ns-skip-commission');
  toggleBtn.addEventListener('click', () => {
    skipCommission = !skipCommission;
    toggleBtn.setAttribute('aria-checked', skipCommission);
    toggleBtn.classList.toggle('toggle-active', skipCommission);
    updateCartPreview(products, locations, skipCommission);
  });

  // Agregar primera línea
  addCartLine();

  document.getElementById('add-cart-item').addEventListener('click', () => addCartLine());

  function addCartLine() {
    const idx = cartIndex++;
    const locationId = document.getElementById('ns-location').value;

    document.getElementById('sale-cart-items').insertAdjacentHTML('beforeend', `
      <div class="card cart-line" data-idx="${idx}" style="cursor:default;padding:14px;margin-bottom:10px">
        <div class="flex-between mb-8">
          <span class="text-sm text-muted">Producto ${idx + 1}</span>
          <button type="button" class="cart-line-remove" data-idx="${idx}">&times;</button>
        </div>
        <div class="form-group" style="margin-bottom:10px">
          <select class="cl-product" data-idx="${idx}">
            <option value="">Seleccionar producto...</option>
            ${(products || []).filter(p => (p.product_variants || []).some(v => (v.inventory || []).some(i => i.location_id === locationId && i.quantity > 0))).map(p => `<option value="${p.id}" data-price="${p.sale_price}">${p.name} — $${p.sale_price}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:2;margin-bottom:0">
            <select class="cl-variant" data-idx="${idx}" disabled>
              <option value="">Primero selecciona producto</option>
            </select>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0">
            <input type="number" class="cl-qty" data-idx="${idx}" min="1" value="1" placeholder="Cant.">
          </div>
        </div>
        <div class="cl-line-info text-sm mt-8" data-idx="${idx}"></div>
      </div>
    `);
  }

  // Delegated events para el carrito
  const cartContainer = document.getElementById('sale-cart-items');

  cartContainer.addEventListener('change', (e) => {
    if (e.target.classList.contains('cl-product')) {
      const idx = e.target.dataset.idx;
      const productId = e.target.value;
      const variantSelect = document.querySelector(`.cl-variant[data-idx="${idx}"]`);
      const locationId = document.getElementById('ns-location').value;

      if (!productId) {
        variantSelect.innerHTML = '<option value="">Primero selecciona producto</option>';
        variantSelect.disabled = true;
        updateCartPreview(products, locations, skipCommission);
        return;
      }

      const product = products.find(p => p.id === productId);
      const variants = (product?.product_variants || []).filter(v => {
        const inv = (v.inventory || []).find(i => i.location_id === locationId);
        return inv && inv.quantity > 0;
      });

      if (variants.length === 0) {
        variantSelect.innerHTML = '<option value="">Sin stock en esta ubicación</option>';
        variantSelect.disabled = true;
      } else {
        variantSelect.innerHTML = variants.map(v => {
          const stock = (v.inventory || []).find(i => i.location_id === locationId)?.quantity || 0;
          return `<option value="${v.id}" data-stock="${stock}">${v.color} · ${v.size} (${stock} disp.)</option>`;
        }).join('');
        variantSelect.disabled = false;
      }
      updateCartPreview(products, locations, skipCommission);
    }

    if (e.target.classList.contains('cl-variant')) {
      updateCartPreview(products, locations, skipCommission);
    }
  });

  cartContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('cl-qty')) {
      updateCartPreview(products, locations, skipCommission);
    }
  });

  cartContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('cart-line-remove')) {
      const row = e.target.closest('.cart-line');
      if (document.querySelectorAll('.cart-line').length > 1) {
        row.remove();
        updateCartPreview(products, locations, skipCommission);
      }
    }
  });

  // Al cambiar ubicación, refrescar productos y variantes disponibles
  document.getElementById('ns-location').addEventListener('change', () => {
    const locationId = document.getElementById('ns-location').value;
    const availableProducts = (products || []).filter(p =>
      (p.product_variants || []).some(v =>
        (v.inventory || []).some(i => i.location_id === locationId && i.quantity > 0)
      )
    );
    const productOptions = '<option value="">Seleccionar producto...</option>' +
      availableProducts.map(p => `<option value="${p.id}" data-price="${p.sale_price}">${p.name} — $${p.sale_price}</option>`).join('');

    document.querySelectorAll('.cl-product').forEach(sel => {
      const prevValue = sel.value;
      sel.innerHTML = productOptions;
      if (prevValue && availableProducts.some(p => p.id === prevValue)) {
        sel.value = prevValue;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        const idx = sel.dataset.idx;
        const variantSelect = document.querySelector(`.cl-variant[data-idx="${idx}"]`);
        if (variantSelect) {
          variantSelect.innerHTML = '<option value="">Primero selecciona producto</option>';
          variantSelect.disabled = true;
        }
      }
    });
    updateCartPreview(products, locations, skipCommission);
  });

  // Submit — registrar todas las líneas
  document.getElementById('new-sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ns-submit');
    await UI.withLoading(btn, async () => {
      const locationId = document.getElementById('ns-location').value;
      const lines = collectCartLines();

      if (lines.length === 0) {
        UI.toast('Agrega al menos un producto', 'error');
        return;
      }

      // Registrar cada línea
      let allOk = true;
      for (const line of lines) {
        const { error } = await sb.rpc('register_sale', {
          p_variant_id: line.variantId,
          p_location_id: locationId,
          p_quantity: line.quantity,
          p_skip_commission: skipCommission
        });
        if (error) {
          const product = products.find(p => p.product_variants?.some(v => v.id === line.variantId));
          UI.toast(`Error en ${product?.name || 'producto'}: ${error.message}`, 'error');
          allOk = false;
          break;
        }
        // Guardar unit_cost en la venta recién creada
        const product = products.find(p => p.product_variants?.some(v => v.id === line.variantId));
        if (product?.cost) {
          const { data: recentSale } = await sb.from('sales')
            .select('id').eq('variant_id', line.variantId).eq('location_id', locationId)
            .order('created_at', { ascending: false }).limit(1).single();
          if (recentSale) await sb.from('sales').update({ unit_cost: product.cost }).eq('id', recentSale.id);
        }
      }

      if (allOk) {
        UI.closeSheet();
        UI.toast(`${lines.length} venta${lines.length > 1 ? 's' : ''} registrada${lines.length > 1 ? 's' : ''}`);
        location.hash = '#/sales';
        Router.navigate('#/sales');
      }
    });
  });
}

function collectCartLines() {
  const lines = [];
  document.querySelectorAll('.cart-line').forEach(row => {
    const variantId = row.querySelector('.cl-variant')?.value;
    const qty = parseInt(row.querySelector('.cl-qty')?.value) || 0;
    if (variantId && qty > 0) {
      lines.push({ variantId, quantity: qty });
    }
  });
  return lines;
}

function updateCartPreview(products, locations, skipCommission) {
  const preview = document.getElementById('ns-preview');
  const submitBtn = document.getElementById('ns-submit');
  if (!preview) return;

  const locationId = document.getElementById('ns-location')?.value;
  const loc = locations.find(l => l.id === locationId);
  const lines = collectCartLines();

  if (lines.length === 0) {
    preview.innerHTML = '<p class="text-sm text-muted">Agrega productos a la venta</p>';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  let subtotal = 0;
  const lineDetails = [];

  for (const line of lines) {
    let price = 0;
    let name = '';
    for (const p of (products || [])) {
      const v = (p.product_variants || []).find(v => v.id === line.variantId);
      if (v) { price = p.sale_price; name = p.name; break; }
    }
    const lineTotal = price * line.quantity;
    subtotal += lineTotal;
    lineDetails.push({ name, qty: line.quantity, price, lineTotal });
  }

  const commissionRate = skipCommission ? 0 : (loc?.commission_rate || 0);
  const commission = subtotal * (commissionRate / 100);
  const net = subtotal - commission;

  preview.innerHTML = `
    ${lineDetails.map(l => `
      <div class="flex-between text-sm"><span>${l.name} x${l.qty}</span><span>$${l.lineTotal.toLocaleString()}</span></div>
    `).join('')}
    <div class="flex-between mt-8" style="border-top:1px solid rgba(194,199,209,0.1);padding-top:8px">
      <span>Subtotal</span><strong>$${subtotal.toLocaleString()}</strong>
    </div>
    ${commission > 0 ? `<div class="flex-between text-muted"><span>Comisión ${loc.commission_rate}%</span><span>-$${commission.toLocaleString()}</span></div>` : ''}
    ${skipCommission && (loc?.commission_rate || 0) > 0 ? `<div class="flex-between text-sm" style="color:var(--sage-dark)"><span>Comisión omitida (${loc.commission_rate}%)</span><span>$0</span></div>` : ''}
    <div class="flex-between mt-8" style="border-top:1px solid rgba(194,199,209,0.1);padding-top:8px">
      <strong>Neto</strong><strong class="text-accent">$${net.toLocaleString()}</strong>
    </div>
  `;

  if (submitBtn) submitBtn.disabled = false;

  // Actualizar info de cada línea
  document.querySelectorAll('.cl-line-info').forEach(el => {
    const idx = el.dataset.idx;
    const row = el.closest('.cart-line');
    const variantSel = row.querySelector('.cl-variant');
    const stockOpt = variantSel?.selectedOptions[0];
    const stock = stockOpt?.dataset.stock;
    const qty = parseInt(row.querySelector('.cl-qty')?.value) || 0;

    if (stock && qty > parseInt(stock)) {
      el.innerHTML = `<span class="text-danger">Solo hay ${stock} disponibles</span>`;
    } else {
      el.innerHTML = '';
    }
  });
}

// ============================================
// Detalle de venta
// ============================================
function openSaleDetail(sale) {
  const productName = sale.product_variants?.products?.name || 'Producto';
  const variant = sale.product_variants;
  const variantLabel = [variant?.color, variant?.size].filter(Boolean).join(' · ');
  const sku = variant?.sku || '—';
  const location = sale.locations?.name || '—';
  const date = new Date(sale.created_at);
  const dateStr = date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const subtotal = sale.unit_price * sale.quantity;
  const commission = sale.commission_amount || 0;
  const net = subtotal - commission;

  const html = `
    <div class="sale-detail">
      <div class="flex-between mb-8">
        <span class="text-muted">Producto</span>
        <strong>${productName}</strong>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">Variante</span>
        <span>${variantLabel || '—'}</span>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">SKU</span>
        <span class="text-sm">${sku}</span>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">Cantidad</span>
        <span>${sale.quantity}</span>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">Precio unitario</span>
        <span>$${sale.unit_price.toLocaleString()}</span>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">Ubicación</span>
        <span>${location}</span>
      </div>
      <div class="flex-between mb-8">
        <span class="text-muted">Fecha</span>
        <span>${dateStr}, ${timeStr}</span>
      </div>

      <div style="border-top:1px solid var(--surface-high);margin:16px 0;padding-top:12px">
        <div class="flex-between mb-8">
          <span>Subtotal</span>
          <strong>$${subtotal.toLocaleString()}</strong>
        </div>
        ${commission > 0 ? `
        <div class="flex-between mb-8 text-muted">
          <span>Comisión</span>
          <span>-$${commission.toLocaleString()}</span>
        </div>` : ''}
        <div class="flex-between">
          <strong>Neto</strong>
          <strong style="color:var(--sage-dark)">$${net.toLocaleString()}</strong>
        </div>
      </div>
    </div>
  `;

  UI.openSheet('Detalle de venta', html);
}
