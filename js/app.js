// Mumú Babywear — App principal
(async function() {
  // Registrar Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Check auth
  const authenticated = await Auth.check();
  if (!authenticated) return;

  // Mostrar shell de la app
  document.getElementById('bottom-nav').classList.remove('hidden');
  document.querySelector('.page-header').classList.remove('hidden');
  document.body.style.paddingBottom = '';

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.route;
    });
  });

  // Sandbox toggle
  const header = document.querySelector('.page-header');
  const sandboxBtn = document.createElement('button');
  sandboxBtn.id = 'btn-sandbox';
  sandboxBtn.className = 'btn btn-sm btn-outline';
  sandboxBtn.title = 'Modo Sandbox';
  sandboxBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
  header.insertBefore(sandboxBtn, document.getElementById('btn-logout'));

  sandboxBtn.addEventListener('click', () => {
    if (Sandbox.isActive()) {
      Sandbox.disable();
      document.getElementById('sandbox-banner')?.remove();
      UI.toast('Sandbox desactivado');
      location.reload();
    } else {
      Sandbox.enable();
      showSandboxBanner();
      UI.toast('Sandbox activado — escrituras bloqueadas');
    }
  });

  // Restaurar banner si sandbox estaba activo
  if (Sandbox.isActive()) {
    document.body.classList.add('sandbox-mode');
    showSandboxBanner();
  }

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });

  // Iniciar router
  Router.init();

  function showSandboxBanner() {
    if (document.getElementById('sandbox-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'sandbox-banner';
    banner.innerHTML = `
      <span>MODO SANDBOX — Los cambios NO se guardan</span>
      <button id="sandbox-exit-btn">Salir</button>
    `;
    document.body.prepend(banner);
    document.getElementById('sandbox-exit-btn').addEventListener('click', () => {
      Sandbox.disable();
      location.reload();
    });
  }
})();
