// Inventario — lista de productos con stock por ubicación
Router.register('#/inventory', async (container) => {
  document.getElementById('page-title').textContent = 'Inventario';

  const sb = getSupabase();
  if (!sb) return;

  // Traer productos con variantes e inventario
  const { data: products } = await sb
    .from('products')
    .select(`
      id, code, name, cost, sale_price, image_url,
      product_variants (
        id, size, color, sku,
        inventory ( quantity, location_id, locations ( name ) )
      )
    `)
    .order('name');

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        </svg>
        <p>No hay productos todavía</p>
        <p class="text-sm mt-8">Toca el <strong>+</strong> para agregar uno</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="form-group mb-16">
      <input type="search" id="search-products" placeholder="Buscar producto..." style="padding-left:36px">
    </div>
    <div id="product-list">
      ${products.map(p => {
        const totalStock = (p.product_variants || []).reduce((sum, v) =>
          sum + (v.inventory || []).reduce((s, i) => s + i.quantity, 0), 0);
        const variants = (p.product_variants || []).length;
        return `
          <div class="card product-card" data-id="${p.id}" data-name="${p.name.toLowerCase()}">
            <div class="flex-between">
              <div>
                <div class="list-item-title">${p.name}</div>
                <div class="list-item-sub">${p.code} · ${variants} variante${variants !== 1 ? 's' : ''}</div>
              </div>
              <div class="text-right">
                <div class="stat-value" style="font-size:1.3rem">${totalStock}</div>
                <span class="badge ${totalStock <= 3 ? 'badge-low' : 'badge-stock'}">${totalStock <= 3 ? 'Stock bajo' : 'En stock'}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Búsqueda
  document.getElementById('search-products').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.product-card').forEach(card => {
      card.style.display = card.dataset.name.includes(q) ? '' : 'none';
    });
  });

  // Click en producto → detalle (Fase 2)
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      // TODO: Fase 2 — abrir detalle de producto con stock por ubicación
      console.log('Producto:', card.dataset.id);
    });
  });
});
