// Ventas — listado con filtros + registro de venta
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
}

// ============================================
// Nueva venta (independiente del inventario)
// ============================================
async function openNewSaleForm(locations, container, sb) {
  // Cargar productos con variantes que tengan stock
  const { data: products } = await sb
    .from('products')
    .select('id, name, sale_price, product_variants(id, size, color, sku, inventory(quantity, location_id))')
    .eq('active', true)
    .order('name');

  const html = `
    <form id="new-sale-form">
      <div class="form-group">
        <label>Ubicación de venta</label>
        <select id="ns-location" required>
          ${locations.map(l => `<option value="${l.id}" data-rate="${l.commission_rate}">${l.name}${l.commission_rate > 0 ? ` (${l.commission_rate}%)` : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Producto</label>
        <select id="ns-product" required>
          <option value="">Seleccionar...</option>
          ${(products || []).map(p => `<option value="${p.id}" data-price="${p.sale_price}">${p.name} — $${p.sale_price}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Variante</label>
        <select id="ns-variant" required disabled>
          <option value="">Primero selecciona producto</option>
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="ns-quantity" min="1" value="1" required>
      </div>

      <div class="card sale-preview mt-8 mb-16" id="ns-preview" style="cursor:default">
        <p class="text-sm text-muted">Selecciona un producto</p>
      </div>

      <button type="submit" class="btn btn-primary btn-full" id="ns-submit" disabled>Registrar venta</button>
    </form>
  `;

  UI.openSheet('Nueva venta', html);

  // Producto → cargar variantes
  document.getElementById('ns-product').addEventListener('change', (e) => {
    const productId = e.target.value;
    const variantSelect = document.getElementById('ns-variant');
    const locationId = document.getElementById('ns-location').value;

    if (!productId) {
      variantSelect.innerHTML = '<option value="">Primero selecciona producto</option>';
      variantSelect.disabled = true;
      document.getElementById('ns-submit').disabled = true;
      return;
    }

    const product = products.find(p => p.id === productId);
    const variants = (product?.product_variants || []).filter(v => {
      // Mostrar solo variantes con stock en la ubicación seleccionada
      const inv = (v.inventory || []).find(i => i.location_id === locationId);
      return inv && inv.quantity > 0;
    });

    if (variants.length === 0) {
      variantSelect.innerHTML = '<option value="">Sin stock en esta ubicación</option>';
      variantSelect.disabled = true;
      document.getElementById('ns-submit').disabled = true;
    } else {
      variantSelect.innerHTML = variants.map(v => {
        const stock = (v.inventory || []).find(i => i.location_id === locationId)?.quantity || 0;
        return `<option value="${v.id}" data-stock="${stock}">${v.color} · ${v.size} (${stock} disponibles)</option>`;
      }).join('');
      variantSelect.disabled = false;
      document.getElementById('ns-submit').disabled = false;
    }
    updateNewSalePreview(products, locations);
  });

  // Actualizar variantes al cambiar ubicación
  document.getElementById('ns-location').addEventListener('change', () => {
    const prodSelect = document.getElementById('ns-product');
    if (prodSelect.value) prodSelect.dispatchEvent(new Event('change'));
    updateNewSalePreview(products, locations);
  });

  document.getElementById('ns-quantity').addEventListener('input', () => updateNewSalePreview(products, locations));
  document.getElementById('ns-variant').addEventListener('change', () => updateNewSalePreview(products, locations));

  // Submit
  document.getElementById('new-sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const variantId = document.getElementById('ns-variant').value;
    const locationId = document.getElementById('ns-location').value;
    const quantity = parseInt(document.getElementById('ns-quantity').value);

    if (!variantId) { UI.toast('Selecciona una variante', 'error'); return; }

    const { error } = await sb.rpc('register_sale', {
      p_variant_id: variantId, p_location_id: locationId, p_quantity: quantity
    });

    if (error) {
      UI.toast(error.message.includes('insuficiente') ? 'Stock insuficiente' : 'Error: ' + error.message, 'error');
      return;
    }

    UI.closeSheet();
    UI.toast('Venta registrada');
    // Re-render
    location.hash = '#/sales';
    Router.navigate('#/sales');
  });
}

function updateNewSalePreview(products, locations) {
  const preview = document.getElementById('ns-preview');
  if (!preview) return;

  const productId = document.getElementById('ns-product').value;
  const locationId = document.getElementById('ns-location').value;
  const qty = parseInt(document.getElementById('ns-quantity').value) || 1;

  if (!productId) {
    preview.innerHTML = '<p class="text-sm text-muted">Selecciona un producto</p>';
    return;
  }

  const product = products.find(p => p.id === productId);
  const loc = locations.find(l => l.id === locationId);
  const subtotal = product.sale_price * qty;
  const commission = subtotal * ((loc?.commission_rate || 0) / 100);
  const net = subtotal - commission;

  preview.innerHTML = `
    <div class="flex-between"><span>Precio unitario</span><strong>$${product.sale_price}</strong></div>
    <div class="flex-between"><span>Cantidad</span><span>x${qty}</span></div>
    <div class="flex-between"><span>Subtotal</span><strong>$${subtotal.toLocaleString()}</strong></div>
    ${commission > 0 ? `<div class="flex-between text-muted"><span>Comisión ${loc.commission_rate}%</span><span>-$${commission.toLocaleString()}</span></div>` : ''}
    <div class="flex-between mt-8" style="border-top:1px solid rgba(194,199,209,0.1);padding-top:8px">
      <strong>Neto</strong><strong class="text-accent">$${net.toLocaleString()}</strong>
    </div>
  `;
}
