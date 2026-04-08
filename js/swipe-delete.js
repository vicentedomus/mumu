// Swipe-to-delete — componente reutilizable
// Uso: initSwipeToDelete(container, onDelete)
// HTML: .swipeable-item > .swipeable-delete + .swipeable-content
function initSwipeToDelete(container, onDelete) {
  const items = container.querySelectorAll('.swipeable-item');
  const DELETE_THRESHOLD = 80;
  const SNAP_WIDTH = 80;

  items.forEach(item => {
    const content = item.querySelector('.swipeable-content');
    if (!content) return;

    let startX = 0, currentX = 0, dragging = false, swiped = false;

    content.addEventListener('touchstart', (e) => {
      // Cerrar cualquier otro item abierto
      container.querySelectorAll('.swipeable-item.swiped').forEach(other => {
        if (other !== item) {
          other.classList.remove('swiped');
          other.querySelector('.swipeable-content').style.transform = '';
        }
      });

      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = false;
      swiped = item.classList.contains('swiped');
      content.style.transition = 'none';
    }, { passive: true });

    content.addEventListener('touchmove', (e) => {
      currentX = e.touches[0].clientX;
      const diffX = startX - currentX;

      // Solo activar si el movimiento horizontal es mayor que el vertical
      if (!dragging && Math.abs(diffX) > 8) {
        dragging = true;
      }

      if (!dragging) return;

      let translateX;
      if (swiped) {
        // Ya estaba abierto — permitir cerrar (deslizar derecha) o mantener
        translateX = Math.min(0, Math.max(-SNAP_WIDTH * 1.5, -SNAP_WIDTH - diffX));
      } else {
        // Cerrado — permitir abrir (deslizar izquierda)
        translateX = Math.min(0, Math.max(-SNAP_WIDTH * 1.5, -diffX));
      }

      content.style.transform = `translateX(${translateX}px)`;
      e.preventDefault();
    }, { passive: false });

    content.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      content.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';

      const diffX = startX - currentX;

      if (swiped) {
        // Estaba abierto
        if (diffX < -30) {
          // Deslizó a la derecha → cerrar
          content.style.transform = '';
          item.classList.remove('swiped');
        } else {
          // Mantener abierto
          content.style.transform = `translateX(-${SNAP_WIDTH}px)`;
        }
      } else {
        // Estaba cerrado
        if (diffX > DELETE_THRESHOLD) {
          // Deslizó suficiente a la izquierda → abrir
          content.style.transform = `translateX(-${SNAP_WIDTH}px)`;
          item.classList.add('swiped');
        } else {
          // No suficiente → volver
          content.style.transform = '';
        }
      }
    }, { passive: true });

    // Click en botón de eliminar
    const deleteBtn = item.querySelector('.swipeable-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (onDelete) {
          const result = await onDelete(item);
          if (result !== false) {
            // Animar salida
            item.style.transition = 'all 0.3s var(--ease)';
            item.style.maxHeight = item.offsetHeight + 'px';
            requestAnimationFrame(() => {
              item.style.maxHeight = '0';
              item.style.opacity = '0';
              item.style.marginBottom = '0';
              item.style.padding = '0';
              setTimeout(() => item.remove(), 300);
            });
          } else {
            // Cancelado — cerrar swipe
            content.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
            content.style.transform = '';
            item.classList.remove('swiped');
          }
        }
      });
    }
  });
}
