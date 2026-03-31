// Reportes — métricas y análisis
Router.register('#/reports', async (container) => {
  document.getElementById('page-title').textContent = 'Reportes';

  container.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <p>Reportes disponibles pronto</p>
      <p class="text-sm mt-8">Se habilitarán cuando haya datos de ventas</p>
    </div>
  `;
});
