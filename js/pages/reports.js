// Reportes — métricas, gráficas y análisis
Router.register('#/reports', async (container) => {
  document.getElementById('page-title').textContent = 'Reportes';

  const sb = getSupabase();
  if (!sb) return;

  // Estado del período
  let currentPeriod = 'month'; // month, week, quarter
  await renderReports(container, sb, currentPeriod);
});

async function renderReports(container, sb, period) {
  const now = new Date();
  const { start, end, prevStart, prevEnd, label, prevLabel } = getPeriodDates(now, period);

  // Cargar todos los datos en paralelo
  const [
    { data: salesCurrent },
    { data: salesPrev },
    { data: ordersCurrent },
    { data: ordersPrev },
    { data: inventory },
    { data: locations }
  ] = await Promise.all([
    sb.from('sales').select('id, unit_price, quantity, commission_amount, created_at, variant_id, location_id, product_variants(color, size, product_id, products(name, cost)), locations(name, type, commission_rate)')
      .gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
    sb.from('sales').select('id, unit_price, quantity, commission_amount, created_at, product_variants(products(name, cost)), locations(name)')
      .gte('created_at', prevStart.toISOString()).lte('created_at', prevEnd.toISOString()),
    sb.from('purchase_orders').select('id, total, shipping_cost, taxes, status, created_at')
      .gte('created_at', start.toISOString()).lte('created_at', end.toISOString()),
    sb.from('purchase_orders').select('id, total, shipping_cost, taxes, status, created_at')
      .gte('created_at', prevStart.toISOString()).lte('created_at', prevEnd.toISOString()),
    sb.from('inventory').select('quantity, location_id, product_variants(color, size, products(name)), locations(name, type)'),
    sb.from('locations').select('id, name, type, commission_rate').eq('active', true)
  ]);

  const sc = salesCurrent || [];
  const sp = salesPrev || [];
  const oc = (ordersCurrent || []).filter(o => o.status !== 'cancelled');
  const op = (ordersPrev || []).filter(o => o.status !== 'cancelled');

  // ===== Cálculos período actual =====
  const revenue = sc.reduce((s, x) => s + x.unit_price * x.quantity, 0);
  const commissions = sc.reduce((s, x) => s + (x.commission_amount || 0), 0);
  const costOfGoods = sc.reduce((s, x) => s + (x.product_variants?.products?.cost || 0) * x.quantity, 0);
  const netProfit = revenue - commissions - costOfGoods;
  const investment = oc.reduce((s, x) => s + (x.total || 0), 0);
  const investShipping = oc.reduce((s, x) => s + (x.shipping_cost || 0), 0);
  const investTaxes = oc.reduce((s, x) => s + (x.taxes || 0), 0);
  const unitsSold = sc.reduce((s, x) => s + x.quantity, 0);

  // ===== Cálculos período anterior =====
  const prevRevenue = sp.reduce((s, x) => s + x.unit_price * x.quantity, 0);
  const prevCommissions = sp.reduce((s, x) => s + (x.commission_amount || 0), 0);
  const prevCostOfGoods = sp.reduce((s, x) => s + (x.product_variants?.products?.cost || 0) * x.quantity, 0);
  const prevNetProfit = prevRevenue - prevCommissions - prevCostOfGoods;
  const prevInvestment = op.reduce((s, x) => s + (x.total || 0), 0);
  const prevUnitsSold = sp.reduce((s, x) => s + x.quantity, 0);

  // ===== Top productos =====
  const productMap = {};
  sc.forEach(s => {
    const name = s.product_variants?.products?.name || '?';
    if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0, cost: 0, commission: 0 };
    productMap[name].qty += s.quantity;
    productMap[name].revenue += s.unit_price * s.quantity;
    productMap[name].cost += (s.product_variants?.products?.cost || 0) * s.quantity;
    productMap[name].commission += s.commission_amount || 0;
  });
  const topProducts = Object.entries(productMap)
    .map(([name, d]) => ({ name, ...d, margin: d.revenue - d.cost - d.commission }))
    .sort((a, b) => b.qty - a.qty);

  // ===== Ventas por ubicación =====
  const locationMap = {};
  sc.forEach(s => {
    const locName = s.locations?.name || '?';
    if (!locationMap[locName]) locationMap[locName] = { qty: 0, revenue: 0, commission: 0 };
    locationMap[locName].qty += s.quantity;
    locationMap[locName].revenue += s.unit_price * s.quantity;
    locationMap[locName].commission += s.commission_amount || 0;
  });

  // ===== Ventas por semana (gráfica de barras) =====
  const weeklyData = getWeeklyData(sc, start, end);

  // ===== Consignación =====
  const consignLocs = (locations || []).filter(l => l.type === 'consignacion');
  const consignData = consignLocs.map(loc => {
    const stockItems = (inventory || []).filter(i => i.locations?.name === loc.name && i.quantity > 0);
    const totalUnits = stockItems.reduce((s, i) => s + i.quantity, 0);
    const locSales = locationMap[loc.name] || { qty: 0, revenue: 0, commission: 0 };
    const netOwed = locSales.revenue - locSales.commission;
    return { name: loc.name, rate: loc.commission_rate, unitsInStore: totalUnits, sold: locSales.qty, revenue: locSales.revenue, commission: locSales.commission, netOwed };
  });

  // ===== RENDER =====
  container.innerHTML = `
    <div class="period-selector">
      <button class="period-chip ${period === 'week' ? 'active' : ''}" data-period="week">Semana</button>
      <button class="period-chip ${period === 'month' ? 'active' : ''}" data-period="month">Mes</button>
      <button class="period-chip ${period === 'quarter' ? 'active' : ''}" data-period="quarter">Trimestre</button>
    </div>

    <!-- Rentabilidad general -->
    <div class="card" style="cursor:default">
      <div class="card-title">Rentabilidad · ${label}</div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card" style="padding:14px 10px">
          <div class="stat-value" style="font-size:1.15rem">$${revenue.toLocaleString()}</div>
          <div class="stat-label">Ventas</div>
        </div>
        <div class="stat-card" style="padding:14px 10px">
          <div class="stat-value" style="font-size:1.15rem;color:var(--danger)">-$${(commissions + costOfGoods).toLocaleString()}</div>
          <div class="stat-label">Costos</div>
        </div>
        <div class="stat-card" style="padding:14px 10px">
          <div class="stat-value" style="font-size:1.15rem;color:var(--sage-dark)">$${netProfit.toLocaleString()}</div>
          <div class="stat-label">Ganancia</div>
        </div>
        <div class="stat-card" style="padding:14px 10px">
          <div class="stat-value" style="font-size:1.15rem">${unitsSold}</div>
          <div class="stat-label">Unidades</div>
        </div>
      </div>
      <div class="text-sm text-secondary mt-8" style="text-align:center">
        Costo producto: $${costOfGoods.toLocaleString()} · Comisiones: $${commissions.toLocaleString()}
      </div>
    </div>

    <!-- Comparación con período anterior -->
    <div class="card" style="cursor:default">
      <div class="card-title">vs. ${prevLabel}</div>
      ${compareRow('Ventas', revenue, prevRevenue, true)}
      ${compareRow('Ganancia neta', netProfit, prevNetProfit, true)}
      ${compareRow('Unidades', unitsSold, prevUnitsSold, false)}
      ${compareRow('Inversión', investment, prevInvestment, true, true)}
    </div>

    <!-- Gráfica ventas por semana -->
    <div class="card" style="cursor:default">
      <div class="card-title">Ventas por semana</div>
      <div class="chart-bar-container">
        ${weeklyData.map(w => {
          const maxVal = Math.max(...weeklyData.map(x => x.revenue), 1);
          const pct = (w.revenue / maxVal) * 100;
          return `
            <div class="chart-bar-wrapper">
              <div class="chart-bar-value">$${w.revenue > 999 ? Math.round(w.revenue / 1000) + 'k' : w.revenue.toLocaleString()}</div>
              <div class="chart-bar" style="height:${Math.max(pct, 3)}%;background:var(--blue)"></div>
              <div class="chart-bar-label">${w.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Top productos -->
    <div class="card" style="cursor:default">
      <div class="card-title">Productos más vendidos</div>
      ${topProducts.length === 0
        ? '<p class="text-sm text-muted">Sin ventas</p>'
        : topProducts.slice(0, 8).map(p => {
          const maxQty = Math.max(...topProducts.map(x => x.qty), 1);
          const pct = (p.qty / maxQty) * 100;
          const marginPct = p.revenue > 0 ? Math.round((p.margin / p.revenue) * 100) : 0;
          return `
            <div class="chart-h-bar">
              <div class="chart-h-bar-label">${p.name}</div>
              <div class="chart-h-bar-track">
                <div class="chart-h-bar-fill" style="width:${Math.max(pct, 8)}%;background:var(--blue)">${p.qty}u</div>
              </div>
              <div class="chart-h-bar-extra">$${p.margin.toLocaleString()}<br><span class="text-sm text-muted">${marginPct}%</span></div>
            </div>
          `;
        }).join('')
      }
    </div>

    <!-- Ventas por ubicación -->
    <div class="card" style="cursor:default">
      <div class="card-title">Ventas por ubicación</div>
      ${Object.entries(locationMap).length === 0
        ? '<p class="text-sm text-muted">Sin ventas</p>'
        : Object.entries(locationMap).map(([name, d]) => {
          const maxRev = Math.max(...Object.values(locationMap).map(x => x.revenue), 1);
          const pct = (d.revenue / maxRev) * 100;
          const net = d.revenue - d.commission;
          return `
            <div class="chart-h-bar">
              <div class="chart-h-bar-label">${name}</div>
              <div class="chart-h-bar-track">
                <div class="chart-h-bar-fill" style="width:${Math.max(pct, 10)}%;background:var(--sage)">${d.qty}u</div>
              </div>
              <div class="chart-h-bar-extra">$${net.toLocaleString()}</div>
            </div>
          `;
        }).join('')
      }
    </div>

    <!-- Reporte consignación -->
    ${consignData.length > 0 ? `
      <div class="card" style="cursor:default">
        <div class="card-title">Consignación</div>
        ${consignData.map(c => `
          <div style="margin-bottom:16px">
            <div class="flex-between mb-8">
              <strong>${c.name}</strong>
              <span class="badge badge-consign">${c.rate}% comisión</span>
            </div>
            <table class="consign-table">
              <tr><th>Concepto</th><th>Valor</th></tr>
              <tr><td>En tienda</td><td><strong>${c.unitsInStore} uds</strong></td></tr>
              <tr><td>Vendidos (${label})</td><td><strong>${c.sold} uds</strong></td></tr>
              <tr><td>Venta bruta</td><td>$${c.revenue.toLocaleString()}</td></tr>
              <tr><td>Comisión (${c.rate}%)</td><td class="text-danger">-$${c.commission.toLocaleString()}</td></tr>
              <tr><td><strong>Te deben</strong></td><td><strong class="text-accent">$${c.netOwed.toLocaleString()}</strong></td></tr>
            </table>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Inversión en compras -->
    <div class="card" style="cursor:default">
      <div class="card-title">Inversión en compras · ${label}</div>
      <div class="compare-row">
        <div class="compare-label">Pedidos</div>
        <div class="compare-value">${oc.length}</div>
      </div>
      <div class="compare-row">
        <div class="compare-label">Productos</div>
        <div class="compare-value">$${(investment - investShipping - investTaxes).toLocaleString()}</div>
      </div>
      <div class="compare-row">
        <div class="compare-label">Envíos</div>
        <div class="compare-value">$${investShipping.toLocaleString()}</div>
      </div>
      <div class="compare-row">
        <div class="compare-label">Impuestos</div>
        <div class="compare-value">$${investTaxes.toLocaleString()}</div>
      </div>
      <div class="compare-row" style="border-top:1px solid rgba(194,199,209,0.1)">
        <div class="compare-label"><strong>Total invertido</strong></div>
        <div class="compare-value"><strong>$${investment.toLocaleString()}</strong></div>
      </div>
      ${revenue > 0 ? `
        <div class="compare-row">
          <div class="compare-label"><strong>ROI</strong></div>
          <div class="compare-value"><strong class="${netProfit > 0 ? 'text-success' : 'text-danger'}">${investment > 0 ? Math.round((netProfit / investment) * 100) : 0}%</strong></div>
        </div>
      ` : ''}
    </div>
  `;

  // Period selector events
  container.querySelectorAll('.period-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      renderReports(container, sb, chip.dataset.period);
    });
  });
}

// ===== Helpers =====

function getPeriodDates(now, period) {
  const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  if (period === 'week') {
    const dayOfWeek = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); start.setHours(0,0,0,0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23,59,59,999);
    const prevStart = new Date(start); prevStart.setDate(start.getDate() - 7);
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1); prevEnd.setHours(23,59,59,999);
    return { start, end, prevStart, prevEnd, label: 'Esta semana', prevLabel: 'Semana anterior' };
  }

  if (period === 'quarter') {
    const qMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qMonth, 1);
    const end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59, 999);
    const prevStart = new Date(now.getFullYear(), qMonth - 3, 1);
    const prevEnd = new Date(now.getFullYear(), qMonth, 0, 23, 59, 59, 999);
    const qNum = Math.floor(qMonth / 3) + 1;
    return { start, end, prevStart, prevEnd, label: `Q${qNum} ${now.getFullYear()}`, prevLabel: `Q${qNum - 1 || 4} ${qNum === 1 ? now.getFullYear() - 1 : now.getFullYear()}` };
  }

  // Default: month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start, end, prevStart, prevEnd, label: `${monthNames[now.getMonth()]} ${now.getFullYear()}`, prevLabel: `${monthNames[now.getMonth() - 1] || monthNames[11]} ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}` };
}

function getWeeklyData(sales, periodStart, periodEnd) {
  const weeks = [];
  const current = new Date(periodStart);
  let weekNum = 1;

  while (current <= periodEnd) {
    const weekStart = new Date(current);
    const weekEnd = new Date(current);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > periodEnd) weekEnd.setTime(periodEnd.getTime());

    const weekSales = sales.filter(s => {
      const d = new Date(s.created_at);
      return d >= weekStart && d <= weekEnd;
    });

    weeks.push({
      label: `S${weekNum}`,
      revenue: weekSales.reduce((s, x) => s + x.unit_price * x.quantity, 0),
      qty: weekSales.reduce((s, x) => s + x.quantity, 0)
    });

    current.setDate(current.getDate() + 7);
    weekNum++;
  }

  return weeks;
}

function compareRow(label, current, previous, isMoney, invertColor = false) {
  const diff = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
  const isUp = diff > 0;
  const isDown = diff < 0;
  const colorClass = invertColor
    ? (isUp ? 'compare-down' : isDown ? 'compare-up' : 'compare-neutral')
    : (isUp ? 'compare-up' : isDown ? 'compare-down' : 'compare-neutral');
  const arrow = isUp ? '↑' : isDown ? '↓' : '—';
  const prefix = isMoney ? '$' : '';

  return `
    <div class="compare-row">
      <div class="compare-label">${label}</div>
      <div class="compare-value">${prefix}${current.toLocaleString()}</div>
      <div class="compare-change ${colorClass}">${arrow} ${Math.abs(diff)}%</div>
    </div>
  `;
}
