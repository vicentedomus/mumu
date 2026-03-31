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

  // Nav clicks
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      location.hash = btn.dataset.route;
    });
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });

  // Iniciar router
  Router.init();
})();
