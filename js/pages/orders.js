// Pedidos — compras a proveedores
Router.register('#/orders', async (container) => {
  document.getElementById('page-title').textContent = 'Pedidos';

  const sb = getSupabase();
  if (!sb) return;

  const { data: orders } = await sb
    .from('purchase_orders')
    .select('id, supplier, status, total, shipping_cost, taxes, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  const statusLabels = {
    ordered: 'Pedido',
    in_transit: 'En tránsito',
    received: 'Recibido'
  };

  const statusColors = {
    ordered: 'badge-consign',
    in_transit: 'badge-low',
    received: 'badge-stock'
  };

  container.innerHTML = `
    <div class="card">
      <div class="card-title">Pedidos a proveedores</div>
      ${!orders || orders.length === 0
        ? '<p class="text-muted text-sm">Sin pedidos registrados</p>'
        : orders.map(o => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${o.supplier}</div>
              <div class="list-item-sub">${new Date(o.created_at).toLocaleDateString('es-CL')}</div>
            </div>
            <div class="list-item-right">
              <span class="badge ${statusColors[o.status] || ''}">${statusLabels[o.status] || o.status}</span>
              <div class="mt-8"><strong>$${(o.total || 0).toLocaleString()}</strong></div>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
});
