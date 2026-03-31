// Dashboard — pantalla principal con métricas
Router.register('#/dashboard', async (container) => {
  document.getElementById('page-title').textContent = 'Dashboard';

  const sb = getSupabase();
  if (!sb) {
    container.innerHTML = '<p class="text-muted">Conectando...</p>';
    return;
  }

  // Obtener datos
  const [
    { count: totalProducts },
    { data: inventory },
    { data: recentSales }
  ] = await Promise.all([
    sb.from('products').select('*', { count: 'exact', head: true }),
    sb.from('inventory').select('quantity'),
    sb.from('sales').select('unit_price, quantity, commission_amount, created_at')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .order('created_at', { ascending: false })
  ]);

  const totalStock = (inventory || []).reduce((sum, i) => sum + i.quantity, 0);
  const monthlySales = (recentSales || []);
  const monthlyRevenue = monthlySales.reduce((sum, s) => sum + (s.unit_price * s.quantity), 0);
  const monthlyCommissions = monthlySales.reduce((sum, s) => sum + (s.commission_amount || 0), 0);

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalProducts || 0}</div>
        <div class="stat-label">Productos</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalStock}</div>
        <div class="stat-label">Unidades</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${monthlyRevenue.toLocaleString()}</div>
        <div class="stat-label">Ventas mes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">$${monthlyCommissions.toLocaleString()}</div>
        <div class="stat-label">Comisiones</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Ventas recientes</div>
      ${monthlySales.length === 0
        ? '<p class="text-muted text-sm">Sin ventas este mes</p>'
        : monthlySales.slice(0, 5).map(s => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">Venta</div>
              <div class="list-item-sub">${new Date(s.created_at).toLocaleDateString('es-CL')}</div>
            </div>
            <div class="list-item-right">
              <strong>$${(s.unit_price * s.quantity).toLocaleString()}</strong>
            </div>
          </div>
        `).join('')
      }
    </div>
  `;
});
