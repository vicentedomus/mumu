// Dashboard — pantalla principal con métricas
Router.register('#/dashboard', async (container) => {
  document.getElementById('page-title').textContent = 'Inicio';

  const sb = getSupabase();
  if (!sb) {
    container.innerHTML = '<p class="text-muted">Conectando...</p>';
    return;
  }

  const [
    { count: totalProducts },
    { data: inventory },
    { data: recentSales },
    { data: lowStockData }
  ] = await Promise.all([
    sb.from('products').select('*', { count: 'exact', head: true }).eq('active', true),
    sb.from('inventory').select('quantity'),
    sb.from('sales').select('unit_price, quantity, commission_amount, created_at, product_variants(color, size, products(name)), locations(name)')
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
      .order('created_at', { ascending: false }),
    sb.from('inventory').select('quantity, product_variants(color, size, products(name))')
      .lte('quantity', 3)
      .gt('quantity', 0)
  ]);

  const totalStock = (inventory || []).reduce((sum, i) => sum + i.quantity, 0);
  const monthlySales = (recentSales || []);
  const monthlyRevenue = monthlySales.reduce((sum, s) => sum + (s.unit_price * s.quantity), 0);
  const monthlyCommissions = monthlySales.reduce((sum, s) => sum + (s.commission_amount || 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Buenos dias' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const now = new Date();

  container.innerHTML = `
    <div class="welcome-section">
      <div>
        <h2>${greeting}</h2>
        <p>Resumen de ${monthNames[now.getMonth()]} ${now.getFullYear()}</p>
      </div>
      <img src="/assets/mumu-face.svg" alt="" class="welcome-mascot">
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon stat-icon-sand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        </div>
        <div class="stat-value">${totalProducts || 0}</div>
        <div class="stat-label">Productos</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blue">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <div class="stat-value">${totalStock}</div>
        <div class="stat-label">Unidades</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-sage">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div class="stat-value">$${monthlyRevenue.toLocaleString()}</div>
        <div class="stat-label">Ventas mes</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon stat-icon-blush">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/></svg>
        </div>
        <div class="stat-value">$${monthlyCommissions.toLocaleString()}</div>
        <div class="stat-label">Comisiones</div>
      </div>
    </div>

    ${lowStockData && lowStockData.length > 0 ? `
      <div class="card card-alert">
        <div class="card-title" style="display:flex;align-items:center;gap:8px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Stock bajo
        </div>
        ${lowStockData.slice(0, 4).map(item => `
          <div class="list-item">
            <div class="list-item-content">
              <div class="list-item-title">${item.product_variants?.products?.name || 'Producto'}</div>
              <div class="list-item-sub">${item.product_variants?.color || ''} · ${item.product_variants?.size || ''}</div>
            </div>
            <div class="list-item-right">
              <span class="badge badge-low">${item.quantity} uds</span>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="card" style="cursor:default">
      <div class="card-title">Ventas recientes</div>
      ${monthlySales.length === 0
        ? '<p class="text-muted text-sm" style="padding:12px 0">Sin ventas este mes</p>'
        : monthlySales.slice(0, 5).map(s => `
          <div class="list-item">
            <div class="movement-icon movement-icon-venta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <div class="list-item-content">
              <div class="list-item-title">${s.product_variants?.products?.name || 'Venta'}</div>
              <div class="list-item-sub">${s.locations?.name || ''} · ${new Date(s.created_at).toLocaleDateString('es-CL')}</div>
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
