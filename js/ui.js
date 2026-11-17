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

  // Prepara una foto para subir a Storage: copia los bytes a memoria (en iOS la
  // referencia al File del carrete puede quedar ilegible después) y la reduce a
  // JPEG de máx. maxDim px para no topar con el límite de tamaño del bucket.
  // Devuelve un Blob; si no se puede comprimir, devuelve la foto original.
  async prepareImage(file, { maxDim = 1600, quality = 0.82 } = {}) {
    const emptyMsg = 'No se pudo leer la foto. Vuelve a elegirla.';
    if (!file || file.size === 0) throw new Error(emptyMsg);
    let bytes;
    try { bytes = await file.arrayBuffer(); } catch (_) { throw new Error(emptyMsg); }
    if (!bytes || bytes.byteLength === 0) throw new Error(emptyMsg);
    const original = new Blob([bytes], { type: file.type || 'image/jpeg' });

    try {
      const url = URL.createObjectURL(original);
      let img;
      try {
        img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve(i);
          i.onerror = () => reject(new Error('decode'));
          i.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (out && out.size > 0 && (out.size < original.size || scale < 1)) return out;
    } catch (_) {
      // Si no se puede decodificar/comprimir, se sube la original
    }
    return original;
  },

  // Extensión de archivo según el tipo MIME del blob a subir
  imageExt(blob) {
    if (blob.type === 'image/png') return 'png';
    if (blob.type === 'image/webp') return 'webp';
    return 'jpg';
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
