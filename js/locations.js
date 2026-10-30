// Ubicaciones — carga compartida, ordenada por sort_order y nombre.
// Se usa select('*') para no romper si la migración de sort_order/is_default
// todavía no está aplicada. Ante un error devuelve [] y avisa con un toast.
const Locations = {
  async all(sb) {
    const { data, error } = await sb.from('locations').select('*');
    if (error) {
      console.error('Error cargando ubicaciones', error);
      UI.toast('Error cargando ubicaciones: ' + error.message, 'error');
      return [];
    }
    return (data || []).sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
  },

  async active(sb) {
    return (await this.all(sb)).filter(l => l.active);
  },

  // Ubicación principal: la marcada is_default, si no la primera directa activa
  async getDefault(sb) {
    return this.pickDefault(await this.active(sb));
  },

  pickDefault(locations) {
    return locations.find(l => l.is_default)
      || locations.find(l => l.type === 'directo')
      || locations[0]
      || null;
  },

  // Etiqueta para selects de historial (ventas/reportes) donde se listan inactivas
  label(l) {
    return l.active ? l.name : `${l.name} (inactiva)`;
  }
};
