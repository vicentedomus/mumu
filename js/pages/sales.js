// Ventas — registro y listado
Router.register('#/sales', async (container) => {
  document.getElementById('page-title').textContent = 'Ventas';

  const sb = getSupabase();
  if (!sb) return;

  const { data: sales } = await sb
    .from('sales')
    .select(`
      id, quantity, unit_price, commission_amount, created_at,
      product_variants ( sku, color, size, products ( name ) ),
      locations ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(30);

  container.innerHTML = `
    <div class="card">
      <div class="card-title">Ventas recientes</div>
      ${!sales || sales.length === 0
        ? '<p class="text-muted text-sm">Sin ventas registradas</p>'
        : sales.map(s => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${s.product_variants?.products?.name || 'Producto'}</div>
              <div class="list-item-sub">${s.product_variants?.color || ''} ${s.product_variants?.size || ''} · ${s.locations?.name || ''} · ${new Date(s.created_at).toLocaleDateString('es-CL')}</div>
            </div>
            <div class="list-item-right">
              <strong>$${(s.unit_price * s.quantity).toLocaleString()}</strong>
              <div class="text-sm text-muted">x${s.quantity}</div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
});
