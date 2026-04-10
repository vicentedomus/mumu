// Inventario — lista de productos, detalle, CRUD, traslados
Router.register('#/inventory', async (container) => {
  document.getElementById('page-title').textContent = 'Inventario';

  const sb = getSupabase();
  if (!sb) return;

  await renderProductList(container, sb);
});

// ============================================
// Render lista de productos
// ============================================
async function renderProductList(container, sb) {
  const { data: products, error } = await sb
    .from('products')
    .select(`
      id, code, name, cost, sale_price, product_url, image_url,
      product_variants (
        id, size, color, sku,
        inventory ( quantity, location_id, locations ( name ) )
      )
    `)
    .eq('active', true)
    .order('name');

  if (error) {
    container.innerHTML = `<p class="text-danger">Error cargando productos: ${error.message}</p>`;
    return;
  }

  const { data: locations } = await sb.from('locations').select('id, name').eq('active', true);

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <img src="/assets/mumu-shopping.svg" alt="" style="width:120px;height:120px;opacity:0.6;margin-bottom:16px">
        <p>No hay productos todavía</p>
        <p class="text-sm mt-8">Toca el <strong>+</strong> para agregar uno</p>
      </div>
    `;
    addFAB(() => openProductForm(null, container, sb));
    return;
  }

  container.innerHTML = `
    <div class="form-group mb-16">
      <select id="filter-location">
        <option value="">Todas las ubicaciones</option>
        ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group mb-16">
      <input type="search" id="search-products" placeholder="Buscar producto...">
    </div>
    <div id="product-list">
      ${products.map(p => {
        const stockByLocId = {};
        (p.product_variants || []).forEach(v => {
          (v.inventory || []).forEach(inv => {
            stockByLocId[inv.location_id] = (stockByLocId[inv.location_id] || 0) + inv.quantity;
          });
        });
        return `
        <div class="swipeable-item" data-product-id="${p.id}" data-product-name="${p.name}" data-name="${p.name.toLowerCase()}" data-stock-by-locid='${JSON.stringify(stockByLocId)}'>
          <div class="swipeable-delete" aria-label="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Eliminar</span>
          </div>
          <div class="swipeable-content">
            ${renderProductCard(p)}
          </div>
        </div>
      `; }).join('')}
    </div>
  `;

  // FAB para agregar producto
  addFAB(() => openProductForm(null, container, sb));

  // Helper: aplicar filtros de búsqueda + ubicación
  function applyProductFilters() {
    const q = document.getElementById('search-products').value.toLowerCase();
    const locId = document.getElementById('filter-location').value;
    document.querySelectorAll('.swipeable-item[data-product-id]').forEach(item => {
      const matchesSearch = !q || item.dataset.name.includes(q);
      const matchesLoc = !locId || (JSON.parse(item.dataset.stockByLocid || '{}')[locId] || 0) > 0;
      item.style.display = matchesSearch && matchesLoc ? '' : 'none';
    });
  }

  // Búsqueda
  document.getElementById('search-products').addEventListener('input', applyProductFilters);

  // Filtro por ubicación
  document.getElementById('filter-location').addEventListener('change', applyProductFilters);

  // Click en producto → detalle
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const item = card.closest('.swipeable-item');
      if (item && item.classList.contains('swiped')) return; // no abrir si está en swipe
      const product = products.find(p => p.id === card.dataset.id);
      if (product) openProductDetail(product, container, sb);
    });
  });

  // Swipe-to-delete para productos
  initSwipeToDelete(container, async (item) => {
    const productId = item.dataset.productId;
    const productName = item.dataset.productName;
    const product = products.find(p => p.id === productId);
    const variantCount = (product?.product_variants || []).length;
    const totalStock = (product?.product_variants || []).reduce((sum, v) =>
      (v.inventory || []).reduce((s, i) => s + i.quantity, sum), 0);

    let msg = `¿Eliminar "${productName}" con todas sus ${variantCount} variante${variantCount !== 1 ? 's' : ''}?`;
    if (totalStock > 0) {
      msg += ` Tiene ${totalStock} unidad${totalStock !== 1 ? 'es' : ''} en stock que se perderán del inventario.`;
    }
    msg += ' Esta acción no se puede deshacer.';

    const ok = await UI.confirm(msg);
    if (!ok) return false;

    // Soft-delete: marcar producto como inactivo
    const { error } = await sb.from('products').update({ active: false }).eq('id', productId);
    if (error) { UI.toast('Error: ' + error.message, 'error'); return false; }

    UI.toast(`"${productName}" eliminado`);
    return true;
  });

}

function renderProductCard(p) {
  const totalStock = (p.product_variants || []).reduce((sum, v) =>
    sum + (v.inventory || []).reduce((s, i) => s + i.quantity, 0), 0);
  const variants = (p.product_variants || []).length;
  const colors = [...new Set((p.product_variants || []).map(v => v.color))];

  // Stock por ubicación
  const stockByLoc = {};
  (p.product_variants || []).forEach(v => {
    (v.inventory || []).forEach(inv => {
      const locName = inv.locations?.name || '?';
      stockByLoc[locName] = (stockByLoc[locName] || 0) + inv.quantity;
    });
  });

  return `
    <div class="card product-card" data-id="${p.id}" data-name="${p.name.toLowerCase()}">
      <div class="flex-between">
        <div style="display:flex;gap:12px;align-items:flex-start;flex:1;min-width:0">
          ${p.image_url ? `<img src="${p.image_url}" alt="" class="product-thumb">` : ''}
          <div style="min-width:0">
            <div class="list-item-title">${p.name}</div>
            <div class="list-item-sub">${p.code} · ${variants} variante${variants !== 1 ? 's' : ''}</div>
            <div class="mt-8">
              ${colors.map(c => `<span class="color-tag">${c}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="text-right">
          <div class="stat-value" style="font-size:1.3rem">${totalStock}</div>
          <span class="badge ${totalStock === 0 ? 'badge-low' : totalStock <= 3 ? 'badge-low' : 'badge-stock'}">
            ${totalStock === 0 ? 'Sin stock' : totalStock <= 3 ? 'Stock bajo' : 'En stock'}
          </span>
        </div>
      </div>
      ${Object.keys(stockByLoc).length > 0 ? `
        <div class="stock-locations mt-8">
          ${Object.entries(stockByLoc).map(([loc, qty]) => `
            <div class="stock-loc-item" style="padding:6px 10px">
              <span class="text-sm text-muted" style="font-size:0.7rem">${loc}</span>
              <strong style="font-size:0.9rem">${qty}</strong>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================
// FAB helper
// ============================================
function addFAB(onClick) {
  let fab = document.getElementById('fab-main');
  if (fab) fab.remove();
  fab = document.createElement('button');
  fab.id = 'fab-main';
  fab.className = 'fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  fab.addEventListener('click', onClick);
  document.body.appendChild(fab);
}

// ============================================
// Formulario crear/editar producto
// ============================================
const ALL_SIZES = ['única', 'N/A', '0-3', '3-6', '6-9', '9-12', '12-18', '18-24'];

async function openProductForm(product, container, sb) {
  const isEdit = !!product;
  const title = isEdit ? 'Editar producto' : 'Nuevo producto';

  // Cargar ubicaciones para stock inicial
  const { data: locations } = await sb.from('locations').select('id, name').eq('active', true);

  // Extraer tallas y colores existentes
  const existingSizes = isEdit ? [...new Set((product.product_variants || []).map(v => v.size))] : [];
  const existingColors = isEdit ? [...new Set((product.product_variants || []).map(v => v.color))] : [];

  const html = `
    <form id="product-form">
      <div class="form-group">
        <label for="pf-name">Nombre del producto *</label>
        <input type="text" id="pf-name" required value="${isEdit ? product.name : ''}" placeholder="Ej: Overol de punto">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pf-cost">Costo ($)</label>
          <input type="number" id="pf-cost" step="0.01" min="0" value="${isEdit ? product.cost : ''}" placeholder="0.00">
        </div>
        <div class="form-group">
          <label for="pf-price">Precio venta ($)</label>
          <input type="number" id="pf-price" step="0.01" min="0" value="${isEdit ? product.sale_price : ''}" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label>Foto del producto</label>
        <div class="photo-upload-area" id="pf-photo-area">
          ${isEdit && product.image_url
            ? `<img src="${product.image_url}" alt="" class="photo-preview" id="pf-photo-preview">`
            : `<div class="photo-placeholder" id="pf-photo-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>Toca para agregar foto</span>
              </div>`}
          ${isEdit && product.image_url ? '<button type="button" class="photo-remove" id="pf-photo-remove">&times;</button>' : ''}
        </div>
        <input type="file" id="pf-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none">
        <input type="hidden" id="pf-image" value="${isEdit ? (product.image_url || '') : ''}">
      </div>

      <div class="section-divider mt-16 mb-16">
        <span class="section-label">Tallas</span>
      </div>
      <div class="chip-selector" id="size-selector">
        ${ALL_SIZES.map(s => `<button type="button" class="chip ${existingSizes.includes(s) ? 'chip-active' : ''}" data-value="${s}">${s}</button>`).join('')}
      </div>

      <div class="section-divider mt-16 mb-16">
        <span class="section-label">Colores</span>
      </div>
      <div class="chip-list" id="color-list">
        ${existingColors.map(c => `<span class="chip chip-active chip-removable" data-value="${c}">${c} <span class="chip-x">&times;</span></span>`).join('')}
      </div>
      <div class="form-row mt-8">
        <div class="form-group" style="flex:1;margin-bottom:0">
          <input type="text" id="color-input" placeholder="Agregar color (ej: rosa)">
        </div>
        <button type="button" class="btn btn-sm btn-outline" id="add-color-btn">+</button>
      </div>

      ${!isEdit ? `
      <div class="form-group mt-16">
        <label>Ubicación del stock inicial</label>
        <select id="pf-stock-location">
          ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
        </select>
      </div>
      ` : ''}

      <div class="section-divider mt-16 mb-8">
        <span class="section-label">${isEdit ? 'Preview de variantes' : 'Stock inicial (opcional)'}</span>
      </div>
      <div id="variants-preview" class="mb-16"></div>

      <button type="submit" class="btn btn-primary btn-full">${isEdit ? 'Guardar cambios' : 'Crear producto'}</button>
      ${isEdit ? '<button type="button" class="btn btn-outline btn-full mt-8 text-danger" id="delete-product-btn">Eliminar producto</button>' : ''}
    </form>
  `;

  const body = UI.openSheet(title, html);

  // --- Foto: subir archivo ---
  const photoArea = document.getElementById('pf-photo-area');
  const photoInput = document.getElementById('pf-photo-input');
  const hiddenImageUrl = document.getElementById('pf-image');

  photoArea.addEventListener('click', (e) => {
    if (e.target.closest('.photo-remove')) return;
    photoInput.click();
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      photoArea.innerHTML = `
        <img src="${ev.target.result}" alt="" class="photo-preview" id="pf-photo-preview">
        <button type="button" class="photo-remove" id="pf-photo-remove">&times;</button>
      `;
      // Re-bind remove
      document.getElementById('pf-photo-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        photoInput.value = '';
        hiddenImageUrl.value = '';
        photoArea.innerHTML = `
          <div class="photo-placeholder" id="pf-photo-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
            <span>Toca para agregar foto</span>
          </div>
        `;
      });
    };
    reader.readAsDataURL(file);
  });

  // Remove existing photo
  const removeBtn = document.getElementById('pf-photo-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      photoInput.value = '';
      hiddenImageUrl.value = '';
      photoArea.innerHTML = `
        <div class="photo-placeholder" id="pf-photo-placeholder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          <span>Toca para agregar foto</span>
        </div>
      `;
    });
  }

  // --- Tallas: toggle chips ---
  document.getElementById('size-selector').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    chip.classList.toggle('chip-active');
    updateVariantsPreview();
  });

  // --- Colores: agregar/quitar ---
  const addColor = () => {
    const input = document.getElementById('color-input');
    const color = input.value.trim().toLowerCase();
    if (!color) return;
    // No duplicar
    const existing = document.querySelectorAll('#color-list .chip');
    for (const c of existing) { if (c.dataset.value === color) return; }
    document.getElementById('color-list').insertAdjacentHTML('beforeend',
      `<span class="chip chip-active chip-removable" data-value="${color}">${color} <span class="chip-x">&times;</span></span>`
    );
    input.value = '';
    updateVariantsPreview();
  };

  document.getElementById('add-color-btn').addEventListener('click', addColor);
  document.getElementById('color-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addColor(); }
  });

  document.getElementById('color-list').addEventListener('click', (e) => {
    if (e.target.classList.contains('chip-x')) {
      e.target.closest('.chip').remove();
      updateVariantsPreview();
    }
  });

  // --- Preview de variantes ---
  function getSelectedSizes() {
    return [...document.querySelectorAll('#size-selector .chip-active')].map(c => c.dataset.value);
  }
  function getSelectedColors() {
    return [...document.querySelectorAll('#color-list .chip')].map(c => c.dataset.value);
  }
  function updateVariantsPreview() {
    const sizes = getSelectedSizes();
    const colors = getSelectedColors();
    const preview = document.getElementById('variants-preview');
    if (sizes.length === 0 && colors.length === 0) {
      preview.innerHTML = '<p class="text-sm text-muted">Selecciona al menos una talla o color</p>';
      return;
    }
    const s = sizes.length > 0 ? sizes : ['única'];
    const c = colors.length > 0 ? colors : ['único'];
    const combos = [];
    s.forEach(size => c.forEach(color => combos.push({ size, color })));

    if (isEdit) {
      // Mostrar variantes existentes con stock actual editable
      const existingVariants = product.product_variants || [];
      preview.innerHTML = `
        <p class="text-sm text-secondary mb-8"><strong>${existingVariants.length}</strong> variante${existingVariants.length !== 1 ? 's' : ''} existentes</p>
        ${existingVariants.map(v => {
          const currentStock = (v.inventory || []).reduce((s, i) => s + i.quantity, 0);
          return `
            <div class="flex-between mb-8" style="gap:8px">
              <span class="text-sm" style="flex:1;min-width:0"><strong>${v.color}</strong> · ${v.size} <span class="text-muted">(actual: ${currentStock})</span></span>
              <div class="qty-stepper">
                <button type="button" class="qty-btn qty-minus" aria-label="Menos">−</button>
                <input type="number" class="stock-edit-input" data-variant-id="${v.id}" data-current="${currentStock}"
                  min="0" value="${currentStock}" placeholder="0">
                <button type="button" class="qty-btn qty-plus" aria-label="Más">+</button>
              </div>
            </div>
          `;
        }).join('')}
        ${combos.filter(cb => !existingVariants.find(v => v.size === cb.size && v.color === cb.color)).length > 0 ? `
          <p class="text-sm text-secondary mt-16 mb-8">Nuevas variantes</p>
          ${combos.filter(cb => !existingVariants.find(v => v.size === cb.size && v.color === cb.color)).map(v => `
            <div class="flex-between mb-8" style="gap:8px">
              <span class="text-sm" style="flex:1;min-width:0"><strong>${v.color}</strong> · ${v.size} <span class="text-muted">(nueva)</span></span>
              <div class="qty-stepper">
                <button type="button" class="qty-btn qty-minus" aria-label="Menos">−</button>
                <input type="number" class="stock-initial-input" data-size="${v.size}" data-color="${v.color}"
                  min="0" value="0" placeholder="0">
                <button type="button" class="qty-btn qty-plus" aria-label="Más">+</button>
              </div>
            </div>
          `).join('')}
        ` : ''}
      `;
    } else {
      preview.innerHTML = `
        <p class="text-sm text-secondary mb-8"><strong>${combos.length}</strong> variante${combos.length !== 1 ? 's' : ''}</p>
        ${combos.map(v => `
          <div class="flex-between mb-8" style="gap:8px">
            <span class="text-sm" style="flex:1;min-width:0"><strong>${v.color}</strong> · ${v.size}</span>
            <div class="qty-stepper">
              <button type="button" class="qty-btn qty-minus" aria-label="Menos">−</button>
              <input type="number" class="stock-initial-input" data-size="${v.size}" data-color="${v.color}"
                min="0" value="0" placeholder="0">
              <button type="button" class="qty-btn qty-plus" aria-label="Más">+</button>
            </div>
          </div>
        `).join('')}
      `;
    }
  }
  updateVariantsPreview();

  // --- Stepper +/- para stock ---
  document.getElementById('variants-preview').addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const input = btn.parentElement.querySelector('input[type="number"]');
    if (!input) return;
    let val = parseInt(input.value) || 0;
    if (btn.classList.contains('qty-plus')) {
      input.value = val + 1;
    } else if (btn.classList.contains('qty-minus') && val > 0) {
      input.value = val - 1;
    }
  });

  // --- Submit ---
  document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {
    const name = document.getElementById('pf-name').value.trim();
    const cost = parseFloat(document.getElementById('pf-cost').value) || 0;
    const sale_price = parseFloat(document.getElementById('pf-price').value) || 0;
    // Subir foto si hay archivo nuevo
    let image_url = document.getElementById('pf-image').value.trim() || null;
    const photoFile = document.getElementById('pf-photo-input').files[0];
    if (photoFile) {
      const ext = photoFile.name.split('.').pop().toLowerCase();
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { data: uploadData, error: uploadError } = await sb.storage
        .from('product-images')
        .upload(fileName, photoFile, { contentType: photoFile.type });
      if (uploadError) {
        UI.toast('Error subiendo foto: ' + uploadError.message, 'error');
        return;
      }
      const { data: urlData } = sb.storage.from('product-images').getPublicUrl(fileName);
      image_url = urlData.publicUrl;
    }

    const sizes = getSelectedSizes();
    const colors = getSelectedColors();
    const s = sizes.length > 0 ? sizes : ['única'];
    const c = colors.length > 0 ? colors : ['único'];

    if (isEdit) {
      // Detectar cambios de stock
      const stockChanges = [];
      document.querySelectorAll('.stock-edit-input').forEach(input => {
        const variantId = input.dataset.variantId;
        const current = parseInt(input.dataset.current) || 0;
        const newQty = parseInt(input.value) || 0;
        if (newQty !== current) {
          stockChanges.push({ variantId, current, newQty, diff: newQty - current });
        }
      });

      // Si hay cambios de stock, pedir nota antes de continuar
      if (stockChanges.length > 0) {
        // Enriquecer cambios con nombre de variante
        const existingVariants = product.product_variants || [];
        stockChanges.forEach(ch => {
          const v = existingVariants.find(vv => vv.id === ch.variantId);
          ch.label = v ? `${v.color} · ${v.size}` : '?';
        });

        const note = await new Promise((resolve) => {
          UI.closeSheet();
          const noteHtml = `
            <p class="text-sm text-secondary mb-8">Estás ajustando stock en:</p>
            ${stockChanges.map(ch => `
              <div class="flex-between mb-8">
                <span class="text-sm"><strong>${ch.label}</strong></span>
                <span class="text-sm">${ch.current} → <strong>${ch.newQty}</strong> <span class="${ch.diff > 0 ? 'text-success' : 'text-danger'}">(${ch.diff > 0 ? '+' : ''}${ch.diff})</span></span>
              </div>
            `).join('')}
            <div class="form-group mt-16">
              <label>Nota del ajuste *</label>
              <input type="text" id="adjust-note" required placeholder="Ej: Conteo físico, corrección, etc.">
            </div>
            <div class="flex gap-8">
              <button class="btn btn-outline btn-full" id="adjust-cancel">Cancelar</button>
              <button class="btn btn-primary btn-full" id="adjust-confirm">Confirmar</button>
            </div>
          `;
          UI.openSheet('Ajuste de stock', noteHtml);
          document.getElementById('adjust-cancel').addEventListener('click', () => { UI.closeSheet(); resolve(null); });
          document.getElementById('adjust-confirm').addEventListener('click', () => {
            const val = document.getElementById('adjust-note').value.trim();
            if (!val) { UI.toast('Escribe una nota', 'error'); return; }
            UI.closeSheet();
            resolve(val);
          });
        });

        if (!note) return; // Cancelado

        // Aplicar cambios de stock
        const { data: casaLoc } = await sb.from('locations').select('id').eq('name', 'Casa').single();
        for (const change of stockChanges) {
          if (!casaLoc) continue;
          const { data: existing } = await sb.from('inventory')
            .select('id, quantity').eq('variant_id', change.variantId).eq('location_id', casaLoc.id).single();

          if (existing) {
            await sb.from('inventory').update({ quantity: change.newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
          } else if (change.newQty > 0) {
            await sb.from('inventory').insert({ variant_id: change.variantId, location_id: casaLoc.id, quantity: change.newQty });
          }

          // Registrar movimiento de ajuste
          const movType = change.diff > 0 ? 'ingreso' : 'ajuste';
          await sb.from('inventory_movements').insert({
            variant_id: change.variantId,
            to_location_id: change.diff > 0 ? casaLoc.id : null,
            from_location_id: change.diff < 0 ? casaLoc.id : null,
            quantity: Math.abs(change.diff),
            type: 'ajuste',
            notes: note
          });
        }
      }

      // Actualizar datos del producto
      const { error } = await sb.from('products').update({ name, cost, sale_price, image_url }).eq('id', product.id);
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      // Crear variantes nuevas (las que no existían)
      const existingCombos = (product.product_variants || []).map(v => `${v.size}|${v.color}`);
      const editProductCode = product.code || await SKU.generateProductCode(sb);
      if (!product.code) await sb.from('products').update({ code: editProductCode }).eq('id', product.id);
      for (const size of s) {
        for (const color of c) {
          if (!existingCombos.includes(`${size}|${color}`)) {
            const sku = await SKU.ensureUniqueSKU(sb, SKU.generateSKU(editProductCode, color, size));
            const { data: newVar } = await sb.from('product_variants').insert({ product_id: product.id, size, color, sku }).select().single();
            // Stock inicial para variante nueva
            if (newVar) {
              const input = document.querySelector(`.stock-initial-input[data-size="${size}"][data-color="${color}"]`);
              const qty = parseInt(input?.value) || 0;
              if (qty > 0) {
                const { data: casaLoc } = await sb.from('locations').select('id').eq('name', 'Casa').single();
                if (casaLoc) {
                  await sb.from('inventory').insert({ variant_id: newVar.id, location_id: casaLoc.id, quantity: qty });
                  await sb.from('inventory_movements').insert({ variant_id: newVar.id, to_location_id: casaLoc.id, quantity: qty, type: 'ingreso', notes: 'Stock inicial' });
                }
              }
            }
          }
        }
      }
    } else {
      // Crear producto con código auto-generado
      const productCode = await SKU.generateProductCode(sb);
      const { data: newProd, error } = await sb.from('products').insert({ name, cost, sale_price, image_url, code: productCode }).select().single();
      if (error) { UI.toast('Error: ' + error.message, 'error'); return; }

      // Ubicación seleccionada para stock inicial
      const stockLocationId = document.getElementById('pf-stock-location')?.value;

      // Crear todas las variantes (producto cartesiano) + stock inicial
      for (const size of s) {
        for (const color of c) {
          const sku = await SKU.ensureUniqueSKU(sb, SKU.generateSKU(productCode, color, size));
          const { data: variant } = await sb.from('product_variants').insert({ product_id: newProd.id, size, color, sku }).select().single();

          // Stock inicial en la ubicación seleccionada
          if (variant && stockLocationId) {
            const input = document.querySelector(`.stock-initial-input[data-size="${size}"][data-color="${color}"]`);
            const qty = parseInt(input?.value) || 0;
            if (qty > 0) {
              await sb.from('inventory').insert({ variant_id: variant.id, location_id: stockLocationId, quantity: qty });
              await sb.from('inventory_movements').insert({
                variant_id: variant.id, to_location_id: stockLocationId, quantity: qty,
                type: 'ingreso', notes: 'Stock inicial'
              });
            }
          }
        }
      }
    }

    UI.closeSheet();
    UI.toast(isEdit ? 'Producto actualizado' : 'Producto creado');
    await renderProductList(container, sb);
    }); // withLoading
  });

  // Eliminar
  if (isEdit) {
    document.getElementById('delete-product-btn').addEventListener('click', async () => {
      const ok = await UI.confirm(`¿Eliminar "${product.name}"? Se eliminarán todas sus variantes y stock.`);
      if (!ok) return;
      await sb.from('products').update({ active: false }).eq('id', product.id);
      UI.closeSheet();
      UI.toast('Producto eliminado');
      await renderProductList(container, sb);
    });
  }
}

// ============================================
// Detalle de producto — tabla de variantes
// ============================================
async function openProductDetail(product, container, sb) {
  const { data: variants } = await sb
    .from('product_variants')
    .select('id, size, color, sku, inventory ( quantity, location_id, locations ( name, type ) )')
    .eq('product_id', product.id)
    .eq('active', true);

  const { data: locations } = await sb.from('locations').select('id, name, type, commission_rate').eq('active', true);

  const margin = product.sale_price - product.cost;
  const marginPct = product.cost > 0 ? Math.round((margin / product.cost) * 100) : 0;

  // Preparar datos de variantes
  const variantData = (variants || []).map(v => {
    const stockByLoc = {};
    let total = 0;
    (v.inventory || []).forEach(inv => {
      stockByLoc[inv.locations?.name || '?'] = inv.quantity;
      total += inv.quantity;
    });
    return { ...v, stockByLoc, total };
  });

  const totalStock = variantData.reduce((s, v) => s + v.total, 0);

  const html = `
    ${product.image_url ? `<div style="text-align:center;margin-bottom:16px"><img src="${product.image_url}" alt="" class="product-detail-img" id="product-thumb-img" style="cursor:pointer"></div>` : ''}
    <div class="mb-16">
      <div class="text-sm text-muted">${product.code} · ${variantData.length} variantes · ${totalStock} uds total</div>
      <div class="text-sm mt-8">Costo: <strong>$${product.cost}</strong> · Venta: <strong>$${product.sale_price}</strong> · <span class="text-success">Margen: $${margin} (${marginPct}%)</span></div>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-sm btn-outline" id="edit-product-btn">Editar</button>
        <button class="btn btn-sm btn-outline text-danger" id="delete-product-btn">Eliminar</button>
      </div>
    </div>

    <div class="form-row mb-8" style="gap:8px">
      <div class="form-group" style="flex:1;margin-bottom:0">
        <input type="search" id="variant-search" placeholder="Buscar variante..." style="padding:10px 14px;font-size:0.85rem">
      </div>
      <select id="variant-sort" style="padding:10px 12px;font-size:0.82rem;border:none;background:var(--surface-high);border-radius:var(--r-sm);box-shadow:var(--clay-inner);min-height:44px;font-family:inherit;color:var(--text)">
        <option value="color">Por color</option>
        <option value="size">Por talla</option>
        <option value="stock-desc">Mayor stock</option>
        <option value="stock-asc">Menor stock</option>
      </select>
    </div>

    <div id="variants-table-container">
      ${renderVariantsTable(variantData, locations)}
    </div>

    <div class="section-divider mt-16 mb-8"><span class="section-label">Movimientos recientes</span></div>
    <div id="movements-list"></div>
  `;

  const body = UI.openSheet(product.name, html);

  // Sort y búsqueda
  let currentSort = 'color';
  let currentSearch = '';

  function filterAndSort() {
    let filtered = variantData;
    if (currentSearch) {
      const q = currentSearch.toLowerCase();
      filtered = filtered.filter(v => v.color.toLowerCase().includes(q) || v.size.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q));
    }
    filtered = sortVariants(filtered, currentSort);
    document.getElementById('variants-table-container').innerHTML = renderVariantsTable(filtered, locations);
    bindVariantActions(body, locations, product, variantData, container, sb);
  }

  document.getElementById('variant-search').addEventListener('input', (e) => {
    currentSearch = e.target.value;
    filterAndSort();
  });

  document.getElementById('variant-sort').addEventListener('change', (e) => {
    currentSort = e.target.value;
    filterAndSort();
  });

  // Cargar movimientos
  loadMovements(product, variants, sb);

  // Edit / Delete
  document.getElementById('edit-product-btn').addEventListener('click', () => {
    UI.closeSheet();
    openProductForm(product, container, sb);
  });
  document.getElementById('delete-product-btn').addEventListener('click', async () => {
    const ok = await UI.confirm(`¿Eliminar "${product.name}"? Se eliminarán todas sus variantes y stock.`);
    if (!ok) return;
    await sb.from('products').update({ active: false }).eq('id', product.id);
    UI.closeSheet();
    UI.toast('Producto eliminado');
    await renderProductList(container, sb);
  });

  // Bind acciones iniciales
  bindVariantActions(body, locations, product, variantData, container, sb);

  // Lightbox para imagen de producto
  const thumbImg = document.getElementById('product-thumb-img');
  if (thumbImg) {
    thumbImg.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay';
      overlay.innerHTML = `<img src="${product.image_url}" alt="" class="lightbox-img">`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  }
}

function sortVariants(variants, sortBy) {
  const sizeOrder = ['única', 'N/A', '0-3', '3-6', '6-9', '9-12', '12-18', '18-24'];
  return [...variants].sort((a, b) => {
    if (sortBy === 'color') return a.color.localeCompare(b.color) || sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size);
    if (sortBy === 'size') return sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size) || a.color.localeCompare(b.color);
    if (sortBy === 'stock-desc') return b.total - a.total;
    if (sortBy === 'stock-asc') return a.total - b.total;
    return 0;
  });
}

function renderVariantsTable(variants, locations) {
  if (variants.length === 0) return '<p class="text-sm text-muted" style="padding:16px 0">Sin resultados</p>';

  const maxStock = Math.max(...variants.map(v => v.total), 1);

  // Mobile: cards layout
  const mobileHtml = `
    <div class="variant-cards mobile-only">
      ${variants.map(v => {
        const badgeClass = v.total === 0 ? 'badge-low' : v.total <= 3 ? 'badge-low' : 'badge-stock';
        const locsWithStock = locations.filter(l => (v.stockByLoc[l.name] || 0) > 0);
        const locsWithout = locations.filter(l => (v.stockByLoc[l.name] || 0) === 0);
        return `
          <div class="variant-card" data-variant-id="${v.id}">
            <div class="variant-card-header">
              <div class="variant-card-title">${v.color} · ${v.size}</div>
              <span class="badge ${badgeClass}">${v.total}</span>
            </div>
            <div class="variant-card-bars">
              ${[...locsWithStock, ...locsWithout].map(l => {
                const qty = v.stockByLoc[l.name] || 0;
                const pct = maxStock > 0 ? Math.round((qty / maxStock) * 100) : 0;
                return `
                  <div class="variant-bar-row">
                    <span class="variant-bar-label">${l.name}</span>
                    <div class="variant-bar-track">
                      <div class="variant-bar-fill ${qty === 0 ? 'variant-bar-empty' : ''}" style="width:${Math.max(pct, qty > 0 ? 8 : 0)}%"></div>
                    </div>
                    <span class="variant-bar-qty ${qty === 0 ? 'text-muted' : ''}">${qty}</span>
                  </div>`;
              }).join('')}
            </div>
            <div class="variant-card-actions">
              <button class="variant-card-btn action-add-stock" data-variant-id="${v.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Stock
              </button>
              <button class="variant-card-btn action-transfer" data-variant-id="${v.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                Trasladar
              </button>
              <button class="variant-card-btn variant-card-btn-primary action-sell" data-variant-id="${v.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                Vender
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  // Desktop: table layout (unchanged)
  const desktopHtml = `
    <div class="desktop-only" style="overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="variants-table">
        <thead>
          <tr>
            <th>Color</th>
            <th>Talla</th>
            ${locations.map(l => `<th style="text-align:center">${l.name}</th>`).join('')}
            <th style="text-align:center">Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${variants.map(v => {
            const badgeClass = v.total === 0 ? 'badge-low' : v.total <= 3 ? 'badge-low' : 'badge-stock';
            return `
              <tr class="variant-row-table" data-variant-id="${v.id}">
                <td><strong>${v.color}</strong></td>
                <td>${v.size}</td>
                ${locations.map(l => {
                  const qty = v.stockByLoc[l.name] || 0;
                  return `<td style="text-align:center"><span class="${qty === 0 ? 'text-muted' : ''}">${qty}</span></td>`;
                }).join('')}
                <td style="text-align:center"><span class="badge ${badgeClass}" style="font-size:0.68rem">${v.total}</span></td>
                <td>
                  <div class="variant-btns-inline" style="display:flex">
                    <button class="btn-icon action-add-stock" data-variant-id="${v.id}" title="+ Stock">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <button class="btn-icon action-transfer" data-variant-id="${v.id}" title="Trasladar">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    </button>
                    <button class="btn-icon btn-icon-primary action-sell" data-variant-id="${v.id}" title="Vender">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  return mobileHtml + desktopHtml;
}

function bindVariantActions(body, locations, product, variants, container, sb) {
  body.querySelectorAll('.action-add-stock').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAddStockForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });
  body.querySelectorAll('.action-transfer').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTransferForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });
  body.querySelectorAll('.action-sell').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openQuickSaleForm(btn.dataset.variantId, locations, product, variants, container, sb);
    });
  });
}

async function loadMovements(product, variants, sb) {
  const variantIds = (variants || []).map(v => v.id);
  if (variantIds.length === 0) return;

  const { data: movements } = await sb
    .from('inventory_movements')
    .select('id, variant_id, quantity, type, notes, created_at, from_location:locations!from_location_id(name), to_location:locations!to_location_id(name)')
    .in('variant_id', variantIds)
    .order('created_at', { ascending: false })
    .limit(10);

  const el = document.getElementById('movements-list');
  if (!el) return;

  if (!movements || movements.length === 0) {
    el.innerHTML = '<p class="text-muted text-sm">Sin movimientos</p>';
    return;
  }

  const typeIcons = {
    ingreso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/></svg>',
    venta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    traslado: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>',
    devolucion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
    ajuste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>'
  };
  const typeLabels = {
    ingreso: 'Ingreso', venta: 'Venta', traslado: 'Traslado', devolucion: 'Devolución', ajuste: 'Ajuste'
  };

  el.innerHTML = movements.map(m => {
    const variant = variants.find(v => v.id === m.variant_id);
    const locInfo = m.type === 'traslado'
      ? `${m.from_location?.name || '?'} → ${m.to_location?.name || '?'}`
      : m.from_location?.name || m.to_location?.name || '';
    return `
      <div class="list-item">
        <div class="movement-icon movement-icon-${m.type}">${typeIcons[m.type] || ''}</div>
        <div class="list-item-content">
          <div class="list-item-title">${typeLabels[m.type] || m.type} · x${m.quantity}</div>
          <div class="list-item-sub">${variant ? variant.color + ' ' + variant.size : ''} · ${locInfo}</div>
        </div>
        <div class="text-sm text-muted">${new Date(m.created_at).toLocaleDateString('es-CL')}</div>
      </div>
    `;
  }).join('');
}

// ============================================
// Agregar stock (ingreso)
// ============================================
function openAddStockForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  // Stock actual por ubicación
  const stockByLoc = {};
  (variant?.inventory || []).forEach(inv => {
    const locName = inv.locations?.name || '?';
    const loc = locations.find(l => l.name === locName);
    if (loc) stockByLoc[loc.id] = { name: locName, current: inv.quantity };
  });

  const html = `
    <form id="add-stock-form">
      <p class="text-sm text-secondary mb-16"><strong>${variant?.color}</strong> · ${variant?.size}</p>
      <p class="text-sm text-muted mb-8">Edita el stock por ubicación:</p>
      ${locations.map(l => {
        const current = stockByLoc[l.id]?.current || 0;
        return `
          <div class="flex-between mb-8" style="gap:8px">
            <span class="text-sm" style="flex:1"><strong>${l.name}</strong> <span class="text-muted">(actual: ${current})</span></span>
            <input type="number" class="as-stock-input" data-loc-id="${l.id}" data-loc-name="${l.name}" data-current="${current}"
              min="0" value="${current}"
              style="width:70px;padding:8px;text-align:center;font-size:0.85rem;border-radius:var(--r-sm);border:none;background:var(--surface-high);box-shadow:var(--clay-inner)">
          </div>
        `;
      }).join('')}
      <button type="submit" class="btn btn-primary btn-full mt-16">Guardar</button>
    </form>
  `;

  UI.openSheet('Ajustar stock', html);

  document.getElementById('add-stock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {

    // Detectar cambios
    const changes = [];
    document.querySelectorAll('.as-stock-input').forEach(input => {
      const locId = input.dataset.locId;
      const locName = input.dataset.locName;
      const current = parseInt(input.dataset.current) || 0;
      const newQty = parseInt(input.value) || 0;
      if (newQty !== current) {
        changes.push({ locId, locName, current, newQty, diff: newQty - current });
      }
    });

    if (changes.length === 0) { UI.closeSheet(); return; }

    // Pedir nota
    UI.closeSheet();
    const note = await new Promise((resolve) => {
      const noteHtml = `
        <p class="text-sm text-secondary mb-8"><strong>${variant?.color}</strong> · ${variant?.size}</p>
        ${changes.map(ch => `
          <div class="flex-between mb-8">
            <span class="text-sm"><strong>${ch.locName}</strong></span>
            <span class="text-sm">${ch.current} → <strong>${ch.newQty}</strong> <span class="${ch.diff > 0 ? 'text-success' : 'text-danger'}">(${ch.diff > 0 ? '+' : ''}${ch.diff})</span></span>
          </div>
        `).join('')}
        <div class="form-group mt-16">
          <label>Nota del ajuste *</label>
          <input type="text" id="as-note" required placeholder="Ej: Llegó pedido Temu, conteo físico, etc.">
        </div>
        <div class="flex gap-8">
          <button class="btn btn-outline btn-full" id="as-cancel">Cancelar</button>
          <button class="btn btn-primary btn-full" id="as-confirm">Confirmar</button>
        </div>
      `;
      UI.openSheet('Confirmar ajuste', noteHtml);
      document.getElementById('as-cancel').addEventListener('click', () => { UI.closeSheet(); resolve(null); });
      document.getElementById('as-confirm').addEventListener('click', () => {
        const val = document.getElementById('as-note').value.trim();
        if (!val) { UI.toast('Escribe una nota', 'error'); return; }
        UI.closeSheet();
        resolve(val);
      });
    });

    if (!note) return;

    // Aplicar cambios
    for (const ch of changes) {
      const { data: existing } = await sb.from('inventory')
        .select('id, quantity').eq('variant_id', variantId).eq('location_id', ch.locId).single();

      if (existing) {
        await sb.from('inventory').update({ quantity: ch.newQty, updated_at: new Date().toISOString() }).eq('id', existing.id);
      } else if (ch.newQty > 0) {
        await sb.from('inventory').insert({ variant_id: variantId, location_id: ch.locId, quantity: ch.newQty });
      }

      await sb.from('inventory_movements').insert({
        variant_id: variantId,
        to_location_id: ch.diff > 0 ? ch.locId : null,
        from_location_id: ch.diff < 0 ? ch.locId : null,
        quantity: Math.abs(ch.diff),
        type: 'ajuste',
        notes: note
      });
    }

    UI.toast('Stock actualizado');
    await renderProductList(container, sb);
    }); // withLoading
  });
}

// ============================================
// Trasladar stock
// ============================================
function openTransferForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  const html = `
    <form id="transfer-form">
      <p class="text-sm text-muted mb-16">${product.name} · ${variant?.color} · ${variant?.size}</p>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Desde</label>
          <select id="tf-from" required>
            ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label>Hacia</label>
          <select id="tf-to" required>
            ${locations.map((l, i) => `<option value="${l.id}" ${i === 1 ? 'selected' : ''}>${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="tf-quantity" min="1" value="1" required>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Trasladar</button>
    </form>
  `;

  UI.openSheet('Trasladar stock', html);

  document.getElementById('transfer-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {
      const fromId = document.getElementById('tf-from').value;
      const toId = document.getElementById('tf-to').value;
      const quantity = parseInt(document.getElementById('tf-quantity').value);

      if (fromId === toId) { UI.toast('Origen y destino son iguales', 'error'); return; }

      const { error } = await sb.rpc('transfer_stock', {
        p_variant_id: variantId, p_from_location: fromId, p_to_location: toId, p_quantity: quantity
      });

      if (error) {
        UI.toast(error.message.includes('insuficiente') ? 'Stock insuficiente en origen' : 'Error: ' + error.message, 'error');
        return;
      }

      UI.closeSheet();
      UI.toast(`${quantity} unidades trasladadas`);
      await renderProductList(container, sb);
    });
  });
}

// ============================================
// Venta rápida desde inventario
// ============================================
function openQuickSaleForm(variantId, locations, product, variants, container, sb) {
  UI.closeSheet();
  const variant = variants.find(v => v.id === variantId);

  const html = `
    <form id="sale-form">
      <p class="text-sm text-muted mb-16">${product.name} · ${variant?.color} · ${variant?.size}</p>
      <div class="form-group">
        <label>Ubicación de venta</label>
        <select id="sf-location" required>
          ${locations.map(l => `<option value="${l.id}">${l.name}${l.commission_rate > 0 ? ` (${l.commission_rate}% comisión)` : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Cantidad</label>
        <input type="number" id="sf-quantity" min="1" value="1" required>
      </div>
      <div class="sale-preview card mt-8 mb-16" id="sale-preview">
        <div class="flex-between">
          <span>Precio unitario</span>
          <strong>$${product.sale_price}</strong>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-full">Registrar venta</button>
    </form>
  `;

  UI.openSheet('Registrar venta', html);

  // Preview dinámico
  const updatePreview = () => {
    const qty = parseInt(document.getElementById('sf-quantity').value) || 1;
    const locId = document.getElementById('sf-location').value;
    const loc = locations.find(l => l.id === locId);
    const subtotal = product.sale_price * qty;
    const commission = subtotal * ((loc?.commission_rate || 0) / 100);
    const net = subtotal - commission;

    document.getElementById('sale-preview').innerHTML = `
      <div class="flex-between"><span>Precio unitario</span><strong>$${product.sale_price}</strong></div>
      <div class="flex-between"><span>Cantidad</span><span>x${qty}</span></div>
      <div class="flex-between"><span>Subtotal</span><strong>$${subtotal.toLocaleString()}</strong></div>
      ${commission > 0 ? `<div class="flex-between text-muted"><span>Comisión ${loc.commission_rate}%</span><span>-$${commission.toLocaleString()}</span></div>` : ''}
      <div class="flex-between mt-8" style="border-top:1px solid var(--color-border);padding-top:8px">
        <strong>Neto</strong><strong class="text-accent">$${net.toLocaleString()}</strong>
      </div>
    `;
  };

  document.getElementById('sf-quantity').addEventListener('input', updatePreview);
  document.getElementById('sf-location').addEventListener('change', updatePreview);
  updatePreview();

  document.getElementById('sale-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    await UI.withLoading(btn, async () => {
      const locationId = document.getElementById('sf-location').value;
      const quantity = parseInt(document.getElementById('sf-quantity').value);

      const { error } = await sb.rpc('register_sale', {
        p_variant_id: variantId, p_location_id: locationId, p_quantity: quantity
      });

      if (error) {
        UI.toast(error.message.includes('insuficiente') ? 'Stock insuficiente' : 'Error: ' + error.message, 'error');
        return;
      }

      UI.closeSheet();
      UI.toast('Venta registrada');
      await renderProductList(container, sb);
    });
  });
}
