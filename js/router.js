// Router hash-based simple — sin dependencias
const Router = {
  routes: {},
  currentPage: null,

  register(hash, loadFn) {
    this.routes[hash] = loadFn;
  },

  async navigate(hash) {
    if (!hash || hash === '#') hash = '#/dashboard';
    const route = this.routes[hash];
    if (!route) {
      console.warn(`Ruta no encontrada: ${hash}`);
      return;
    }

    // Actualizar nav activo
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.route === hash);
    });

    // Cargar página
    const container = document.getElementById('page-content');
    container.classList.add('page-exit');

    await new Promise((r) => setTimeout(r, 150));
    this.currentPage = hash;
    await route(container);
    container.classList.remove('page-exit');
    container.classList.add('page-enter');
    setTimeout(() => container.classList.remove('page-enter'), 300);
  },

  init() {
    window.addEventListener('hashchange', () => this.navigate(location.hash));
    this.navigate(location.hash || '#/dashboard');
  }
};
