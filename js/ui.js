// UI helpers — modales, toasts, confirmaciones
const UI = {
  _zBase: 200, // coincide con .modal-overlay en styles.css

  // Abrir modal tipo bottom sheet.
  // options.stack === true → apila el modal encima del actual sin cerrarlo,
  // para no perder el contenido del modal inferior (ej: crear producto/talla
  // desde el formulario de un pedido). Por defecto reemplaza el modal abierto.
  openSheet(title, contentHTML, onClose, options = {}) {
    if (!options.stack) this.closeAllSheets();

    const depth = document.querySelectorAll('.modal-overlay').length;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = depth === 0 ? 'modal-overlay' : `modal-overlay-${depth}`;
    overlay.style.zIndex = this._zBase + depth * 10;
    overlay._onClose = onClose;
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${contentHTML}</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Cerrar al tocar overlay o botón X (solo cierra este modal, no los de abajo)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeSheet();
    });
    overlay.querySelector('.modal-close').addEventListener('click', () => this.closeSheet());

    // Swipe-down-to-close (móvil)
    const sheet = overlay.querySelector('.modal-sheet');
    let _touchY0 = 0, _touchY = 0, _dragging = false;

    sheet.addEventListener('touchstart', (e) => {
      _touchY0 = e.touches[0].clientY;
      _touchY = _touchY0;
      _dragging = false;
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      _touchY = e.touches[0].clientY;
      const diff = _touchY - _touchY0;
      if (!_dragging && diff > 8 && sheet.scrollTop <= 0) {
        _dragging = true;
        sheet.style.transition = 'none';
      }
      if (_dragging && diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
        overlay.style.background = `rgba(61,53,48,${Math.max(0, 0.25 * (1 - diff / 350))})`;
        e.preventDefault();
      }
    }, { passive: false });

    sheet.addEventListener('touchend', () => {
      if (!_dragging) return;
      _dragging = false;
      const diff = _touchY - _touchY0;
      sheet.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
      overlay.style.transition = 'background 0.3s cubic-bezier(.4,0,.2,1)';
      if (diff > 120) {
        sheet.style.transform = 'translateY(100%)';
        overlay.style.background = 'rgba(61,53,48,0)';
        setTimeout(() => this.closeSheet(), 300);
      } else {
        sheet.style.transform = '';
        overlay.style.background = '';
      }
    }, { passive: true });

    return overlay.querySelector('.modal-body');
  },

  // Cierra el modal superior (el último apilado). Si se pasa onClose, sobreescribe
  // el callback registrado al abrir.
  closeSheet(onClose) {
    const overlays = document.querySelectorAll('.modal-overlay');
    const overlay = overlays[overlays.length - 1];
    if (!overlay) return;
    const cb = typeof onClose === 'function' ? onClose : overlay._onClose;
    overlay.remove();
    if (typeof cb === 'function') cb();
  },

  // Cierra todos los modales abiertos (usado al cambiar de página).
  closeAllSheets() {
    document.querySelectorAll('.modal-overlay').forEach((o) => o.remove());
  },

  // Toast notification
  toast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  // Protección contra doble submit — deshabilita botón durante operación async
  async withLoading(btn, fn) {
    if (btn.disabled) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    try {
      await fn();
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  },

  // Confirmar acción
  async confirm(message) {
    return new Promise((resolve) => {
      const body = this.openSheet('Confirmar', `
        <p class="mb-16">${message}</p>
        <div class="flex gap-8">
          <button class="btn btn-outline btn-full" id="confirm-no">Cancelar</button>
          <button class="btn btn-danger btn-full" id="confirm-yes">Confirmar</button>
        </div>
      `);
      document.getElementById('confirm-no').addEventListener('click', () => {
        this.closeSheet(); resolve(false);
      });
      document.getElementById('confirm-yes').addEventListener('click', () => {
        this.closeSheet(); resolve(true);
      });
    });
  }
};
