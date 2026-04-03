// SKU automático — formato MU-XXX-CC-TT
// XXX = número secuencial del producto (001, 002...)
// CC = primeras 2 letras del color sin acentos
// TT = código de talla

const SKU = {
  // Mapa de tallas a códigos cortos
  SIZE_CODES: {
    'única': 'UN', 'n/a': 'NA', '0-3': '03', '3-6': '36',
    '6-9': '69', '9-12': '912', '12-18': '1218', '18-24': '1824',
    'único': 'UN'
  },

  // Quitar acentos y tomar primeras 2 letras en mayúscula
  colorCode(color) {
    const clean = color.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    return clean.slice(0, 2).padEnd(2, 'X');
  },

  sizeCode(size) {
    return this.SIZE_CODES[size.toLowerCase()] || size.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
  },

  // Genera código de producto (MU-001, MU-002...) consultando el máximo existente
  async generateProductCode(sb) {
    const { data } = await sb.from('products').select('code').not('code', 'eq', '').order('code', { ascending: false }).limit(1);
    let next = 1;
    if (data && data.length > 0 && data[0].code) {
      const match = data[0].code.match(/MU-(\d+)/);
      if (match) next = parseInt(match[1]) + 1;
    }
    return `MU-${String(next).padStart(3, '0')}`;
  },

  // Genera SKU descriptivo: MU-001-RS-03
  generateSKU(productCode, color, size) {
    return `${productCode}-${this.colorCode(color)}-${this.sizeCode(size)}`;
  },

  // Verifica unicidad, agrega sufijo si hace falta
  async ensureUniqueSKU(sb, sku) {
    const { data } = await sb.from('product_variants').select('sku').eq('sku', sku);
    if (!data || data.length === 0) return sku;
    // Buscar variantes con sufijo
    let suffix = 2;
    while (true) {
      const candidate = `${sku}-${suffix}`;
      const { data: check } = await sb.from('product_variants').select('sku').eq('sku', candidate);
      if (!check || check.length === 0) return candidate;
      suffix++;
    }
  }
};
