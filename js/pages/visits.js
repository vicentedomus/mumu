// Visitas — Natasha visita las sucursales (Luan, Marcé) y registra el
// conteo observado sin alterar el inventario real.
Router.register('#/visits', async (container) => {
  document.getElementById('page-title').textContent = 'Visitas';

  const sb = getSupabase();
  if (!sb) return;

  await renderLocationPicker(container, sb);
});

// ============================================
// Selector de sucursal
// ============================================
async function renderLocationPicker(container, sb) {
  const { data: locations, error } = await sb
    .from('locations')
    .select('id, name, type')
    .eq('active', true)
    .eq('type', 'consignacion')
    .order('name');

  if (error) {
    container.innerHTML = `<p class="text-danger">Error cargando sucursales: ${error.message}</p>`;
    return;
  }

  if (!locations || locations.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay sucursales para visitar</p>
        <p class="text-sm mt-8">Las visitas se hacen solo en sucursales de consignación.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <p class="text-secondary mb-16">¿Qué sucursal vas a visitar?</p>
    <div id="visit-location-list">
      ${locations.map(l => `
        <div class="card visit-loc-card" data-loc-id="${l.id}" data-loc-name="${l.name}">
          <div class="flex-between">
            <div>
              <div class="list-item-title">${l.name}</div>
              <div class="list-item-sub">Consignación</div>
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.visit-loc-card').forEach(card => {
    card.addEventListener('click', () => {
      const locId = card.dataset.locId;
      const locName = card.dataset.locName;
      renderVisitView(container, sb, { id: locId, name: locName });
    });
  });
}

// ============================================
// Vista de la visita: lista de variantes + nota + foto
// ============================================
async function renderVisitView(container, sb, location) {
  document.getElementById('page-title').textContent = `Visita · ${location.name}`;

  // Cargar en paralelo
  const [productsRes, visitInvRes, visitNotesRes] = await Promise.all([
    sb.from('products')
      .select(`
        id, name, code, image_url,
        product_variants (
          id, size, color, sku,
          inventory ( quantity, location_id )
        )
      `)
      .eq('active', true)
      .eq('product_variants.active', true)
      .order('name'),
    sb.from('visit_inventory')
      .select('variant_id, observed_qty')
      .eq('location_id', location.id),
    sb.from('visit_notes')
      .select('notes, photo_url')
      .eq('location_id', location.id)
      .maybeSingle()
  ]);

  if (productsRes.error) {
    container.innerHTML = `<p class="text-danger">Error: ${productsRes.error.message}</p>`;
    return;
  }

  const products = productsRes.data || [];
  const observedByVariant = {};
  (visitInvRes.data || []).forEach(r => { observedByVariant[r.variant_id] = r.observed_qty; });
  const visitNotes = visitNotesRes.data || { notes: '', photo_url: null };

  // Filas: solo variantes con stock real en la sucursal o con observación previa
  const rows = [];
  for (const p of products) {
    for (const v of (p.product_variants || [])) {
      const realQty = (v.inventory || [])
        .filter(i => i.location_id === location.id)
        .reduce((s, i) => s + i.quantity, 0);
      const observed = observedByVariant[v.id];
      if (realQty === 0 && observed === undefined) continue;
      rows.push({
        productId: p.id,
        productName: p.name,
        productCode: p.code,
        productImage: p.image_url,
        variantId: v.id,
        size: v.size,
        color: v.color,
        realQty,
        observedQty: observed !== undefined ? observed : realQty,
        hasObservation: observed !== undefined
      });
    }
  }

  rows.sort((a, b) =>
    a.productName.localeCompare(b.productName) || a.color.localeCompare(b.color)
  );

  const hasAnyObservation = rows.some(r => r.hasObservation) || !!visitNotes.notes || !!visitNotes.photo_url;

  container.innerHTML = `
    <div class="visit-header">
      <button class="btn btn-sm btn-outline mb-16" id="visit-back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-2px"><polyline points="15 18 9 12 15 6"/></svg>
        Cambiar sucursal
      </button>

      <div class="form-group">
        <label for="visit-notes">Nota de la visita</label>
        <textarea id="visit-notes" rows="2" placeholder="Ej: faltaba 1 sábana rosa, había una mancha en el overol...">${escapeHtml(visitNotes.notes || '')}</textarea>
      </div>

      <div class="form-group">
        <label>Foto</label>
        <div class="photo-upload-area" id="visit-photo-area">
          ${visitNotes.photo_url
            ? `<img src="${visitNotes.photo_url}" alt="" class="photo-preview" id="visit-photo-preview">
               <button type="button" class="photo-remove" id="visit-photo-remove">&times;</button>`
            : `<div class="photo-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                <span>Toca para agregar foto</span>
              </div>`}
        </div>
        <input type="file" id="visit-photo-input" accept="image/jpeg,image/png,image/webp" style="display:none">
        <input type="hidden" id="visit-photo-url" value="${visitNotes.photo_url || ''}">
      </div>

      <div class="section-divider mt-16 mb-8">
        <span class="section-label">Conteo observado</span>
      </div>
      <p class="text-sm text-muted mb-8">Ajusta lo que ves físicamente. El inventario real no cambia.</p>

      <div class="form-group">
        <input type="search" id="visit-search" placeholder="Buscar producto o color...">
      </div>
    </div>

    <div id="visit-rows">
      ${rows.length === 0
        ? '<p class="text-muted text-sm" style="padding:24px 0;text-align:center">Sin stock en esta sucursal.</p>'
        : rows.map(r => renderVisitRow(r)).join('')}
    </div>

    <div class="visit-footer">
      <button class="btn btn-outline btn-full text-danger" id="visit-reset" ${hasAnyObservation ? '' : 'disabled'}>
        Resetear visita
      </button>
      <button class="btn btn-primary btn-full mt-8" id="visit-save">Guardar visita</button>
    </div>
  `;

  // Cargar lo que el usuario va modificando en memoria
  const edits = new Map(); // variantId -> observed_qty
  rows.forEach(r => { if (r.hasObservation) edits.set(r.variantId, r.observedQty); });

  // Navegación atrás
  document.getElementById('visit-back').addEventListener('click', () => {
    renderLocationPicker(container, sb);
    document.getElementById('page-title').textContent = 'Visitas';
  });

  // Búsqueda
  document.getElementById('visit-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('#visit-rows .visit-row').forEach(el => {
      const match = !q || el.dataset.search.includes(q);
      el.style.display = match ? '' : 'none';
    });
  });

  // Steppers + tracking de cambios
  document.getElementById('visit-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('.qty-btn');
    if (!btn) return;
    const row = btn.closest('.visit-row');
    const input = row.querySelector('input[type="number"]');
    let val = parseInt(input.value) || 0;
    if (btn.classList.contains('qty-plus')) val += 1;
    else if (btn.classList.contains('qty-minus') && val > 0) val -= 1;
    input.value = val;
    updateRowDiff(row, val);
    edits.set(row.dataset.variantId, val);
  });

  document.getElementById('visit-rows').addEventListener('input', (e) => {
    const input = e.target.closest('input[type="number"]');
    if (!input) return;
    const row = input.closest('.visit-row');
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) val = 0;
    updateRowDiff(row, val);
    edits.set(row.dataset.variantId, val);
  });

  // Foto
  setupVisitPhoto();

  // Resetear
  document.getElementById('visit-reset').addEventListener('click', async () => {
    const ok = await UI.confirm(`¿Resetear la visita de ${location.name}? Las observaciones, nota y foto se borrarán y volverán al inventario real.`);
    if (!ok) return;

    await Promise.all([
      sb.from('visit_inventory').delete().eq('location_id', location.id),
      sb.from('visit_notes').delete().eq('location_id', location.id)
    ]);

    UI.toast(`Visita de ${location.name} reseteada`);
    await renderVisitView(container, sb, location);
  });

  // Guardar
  document.getElementById('visit-save').addEventListener('click', async () => {
    const btn = document.getElementById('visit-save');
    await UI.withLoading(btn, async () => {
      const notes = document.getElementById('visit-notes').value.trim();

      // Subir foto si hay archivo nuevo
      let photoUrl = document.getElementById('visit-photo-url').value || null;
      const file = document.getElementById('visit-photo-input').files[0];
      if (file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${location.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await sb.storage
          .from('visit-photos')
          .upload(fileName, file, { contentType: file.type });
        if (upErr) { UI.toast('Error subiendo foto: ' + upErr.message, 'error'); return; }
        const { data: urlData } = sb.storage.from('visit-photos').getPublicUrl(fileName);
        photoUrl = urlData.publicUrl;
      }

      // Upsert de filas observadas (solo las que difieren del real o ya tenían observación)
      const toUpsert = [];
      for (const r of rows) {
        const edited = edits.get(r.variantId);
        if (edited === undefined) continue;
        // Si la observación coincide con real y no había fila previa, no insertar (ahorra ruido)
        if (!r.hasObservation && edited === r.realQty) continue;
        toUpsert.push({
          variant_id: r.variantId,
          location_id: location.id,
          observed_qty: edited,
          updated_at: new Date().toISOString()
        });
      }

      if (toUpsert.length > 0) {
        const { error } = await sb.from('visit_inventory')
          .upsert(toUpsert, { onConflict: 'variant_id,location_id' });
        if (error) { UI.toast('Error guardando conteo: ' + error.message, 'error'); return; }
      }

      // Upsert de nota+foto
      const { error: notesErr } = await sb.from('visit_notes').upsert({
        location_id: location.id,
        notes,
        photo_url: photoUrl,
        updated_at: new Date().toISOString()
      }, { onConflict: 'location_id' });
      if (notesErr) { UI.toast('Error guardando nota: ' + notesErr.message, 'error'); return; }

      // Construir snapshot de diferencias para la pantalla de resumen
      const diffs = [];
      for (const r of rows) {
        const edited = edits.get(r.variantId);
        const observed = edited !== undefined ? edited : r.observedQty;
        if (observed === r.realQty) continue;
        diffs.push({
          productName: r.productName,
          color: r.color,
          size: r.size,
          productImage: r.productImage,
          realQty: r.realQty,
          observedQty: observed,
          diff: observed - r.realQty
        });
      }

      UI.toast('Visita guardada');
      renderVisitSummary(container, sb, location, { diffs, notes, photoUrl });
    });
  });
}

// ============================================
// Pantalla de resumen tras guardar
// ============================================
function renderVisitSummary(container, sb, location, summary) {
  document.getElementById('page-title').textContent = `Visita guardada · ${location.name}`;

  const { diffs, notes, photoUrl } = summary;
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  const negatives = diffs.filter(d => d.diff < 0);
  const positives = diffs.filter(d => d.diff > 0);
  const headline = diffs.length === 0
    ? 'Sin diferencias detectadas'
    : `${diffs.length} diferencia${diffs.length === 1 ? '' : 's'} detectada${diffs.length === 1 ? '' : 's'}`;

  container.innerHTML = `
    <div class="card" style="text-align:center;padding:20px 16px">
      <div style="width:64px;height:64px;border-radius:50%;background:var(--sage);color:#2d5a2e;margin:0 auto 8px;display:flex;align-items:center;justify-content:center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 style="margin:8px 0 4px;font-family:'Varela Round',sans-serif">Visita guardada</h2>
      <p class="text-secondary" style="margin:0">${escapeHtml(location.name)}</p>
      <p class="mt-8" style="margin-bottom:0">${headline}</p>
      ${diffs.length > 0 ? `
        <div class="flex" style="gap:12px;justify-content:center;margin-top:8px">
          ${negatives.length > 0 ? `<span class="text-danger"><strong>${negatives.length}</strong> faltante${negatives.length === 1 ? '' : 's'}</span>` : ''}
          ${positives.length > 0 ? `<span class="text-success"><strong>${positives.length}</strong> sobrante${positives.length === 1 ? '' : 's'}</span>` : ''}
        </div>
      ` : ''}
    </div>

    ${diffs.length > 0 ? `
      <div class="section-divider mt-16 mb-8"><span class="section-label">Diferencias</span></div>
      <div>
        ${diffs.map(d => `
          <div class="card" style="padding:12px 14px">
            <div class="flex-between" style="gap:12px;align-items:center">
              <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
                ${d.productImage ? `<img src="${d.productImage}" alt="" class="product-thumb">` : ''}
                <div style="min-width:0">
                  <div class="list-item-title" style="font-size:0.9rem">${escapeHtml(d.productName)}</div>
                  <div class="list-item-sub">${escapeHtml(d.color)} · ${escapeHtml(d.size)}</div>
                </div>
              </div>
              <div class="text-right" style="white-space:nowrap">
                <div class="text-sm text-muted">${d.realQty} → <strong>${d.observedQty}</strong></div>
                <div>${diffBadge(d.diff)}</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${notes ? `
      <div class="section-divider mt-16 mb-8"><span class="section-label">Nota</span></div>
      <div class="card"><p style="margin:0;white-space:pre-wrap">${escapeHtml(notes)}</p></div>
    ` : ''}

    ${photoUrl ? `
      <div class="section-divider mt-16 mb-8"><span class="section-label">Foto</span></div>
      <div style="text-align:center"><img src="${photoUrl}" alt="" class="product-detail-img" style="max-height:240px;cursor:pointer" id="visit-summary-photo"></div>
    ` : ''}

    <div class="mt-16">
      <button class="btn btn-primary btn-full" id="visit-summary-inventory">Ver inventario según visitas</button>
      <button class="btn btn-outline btn-full mt-8" id="visit-summary-edit">Editar esta visita</button>
      <button class="btn btn-outline btn-full mt-8" id="visit-summary-back">Volver a Inventario</button>
    </div>
  `;

  document.getElementById('visit-summary-inventory').addEventListener('click', () => {
    sessionStorage.setItem('inventory_view_mode', 'visit');
    Router.navigate('#/inventory');
  });
  document.getElementById('visit-summary-edit').addEventListener('click', () => {
    renderVisitView(container, sb, location);
  });
  document.getElementById('visit-summary-back').addEventListener('click', () => {
    Router.navigate('#/inventory');
  });

  const photoEl = document.getElementById('visit-summary-photo');
  if (photoEl) {
    photoEl.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay';
      overlay.innerHTML = `<img src="${photoUrl}" alt="" class="lightbox-img">`;
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
  }
}

function renderVisitRow(r) {
  const diff = r.observedQty - r.realQty;
  const diffHtml = diffBadge(diff);
  const searchKey = `${r.productName} ${r.color} ${r.size} ${r.productCode || ''}`.toLowerCase();
  return `
    <div class="card visit-row" data-variant-id="${r.variantId}" data-real-qty="${r.realQty}" data-search="${escapeHtml(searchKey)}">
      <div class="flex-between" style="gap:12px;align-items:center">
        <div style="display:flex;gap:10px;align-items:center;flex:1;min-width:0">
          ${r.productImage ? `<img src="${r.productImage}" alt="" class="product-thumb">` : ''}
          <div style="min-width:0">
            <div class="list-item-title" style="font-size:0.9rem">${escapeHtml(r.productName)}</div>
            <div class="list-item-sub">${escapeHtml(r.color)} · ${escapeHtml(r.size)}</div>
            <div class="text-sm text-muted mt-8">
              Real: <strong>${r.realQty}</strong>
              <span class="visit-diff" style="margin-left:8px">${diffHtml}</span>
            </div>
          </div>
        </div>
        <div class="qty-stepper">
          <button type="button" class="qty-btn qty-minus" aria-label="Menos">−</button>
          <input type="number" min="0" value="${r.observedQty}">
          <button type="button" class="qty-btn qty-plus" aria-label="Más">+</button>
        </div>
      </div>
    </div>
  `;
}

function diffBadge(diff) {
  if (diff === 0) return '<span class="text-muted">sin diferencia</span>';
  const sign = diff > 0 ? '+' : '';
  const cls = diff > 0 ? 'text-success' : 'text-danger';
  return `<strong class="${cls}">${sign}${diff}</strong>`;
}

function updateRowDiff(row, observed) {
  const real = parseInt(row.dataset.realQty) || 0;
  const diff = observed - real;
  const el = row.querySelector('.visit-diff');
  if (el) el.innerHTML = diffBadge(diff);
}

function setupVisitPhoto() {
  const area = document.getElementById('visit-photo-area');
  const input = document.getElementById('visit-photo-input');
  const urlField = document.getElementById('visit-photo-url');

  const placeholderHtml = `
    <div class="photo-placeholder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
      <span>Toca para agregar foto</span>
    </div>
  `;

  area.addEventListener('click', (e) => {
    if (e.target.closest('.photo-remove')) return;
    input.click();
  });

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      area.innerHTML = `
        <img src="${ev.target.result}" alt="" class="photo-preview">
        <button type="button" class="photo-remove">&times;</button>
      `;
      area.querySelector('.photo-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        input.value = '';
        urlField.value = '';
        area.innerHTML = placeholderHtml;
      });
    };
    reader.readAsDataURL(file);
  });

  const existingRemove = document.getElementById('visit-photo-remove');
  if (existingRemove) {
    existingRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      input.value = '';
      urlField.value = '';
      area.innerHTML = placeholderHtml;
    });
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
