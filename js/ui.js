// UI helpers — modales, toasts, confirmaciones
const UI = {
  // Abrir modal tipo bottom sheet
  openSheet(title, contentHTML, onClose) {
    this.closeSheet(); // cerrar si hay uno abierto
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <div id="modal-body">${contentHTML}</div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Cerrar al tocar overlay o botón X
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeSheet(onClose);
    });
    document.getElementById('modal-close-btn').addEventListener('click', () => this.closeSheet(onClose));

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
        setTimeout(() => this.closeSheet(onClose), 300);
      } else {
        sheet.style.transform = '';
        overlay.style.background = '';
      }
    }, { passive: true });

    return document.getElementById('modal-body');
  },

  closeSheet(onClose) {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
      overlay.remove();
      if (typeof onClose === 'function') onClose();
    }
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
