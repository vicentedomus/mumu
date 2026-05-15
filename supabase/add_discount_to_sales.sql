-- Agrega descuento por línea de venta. discount_amount es el monto absoluto
-- en pesos restado al subtotal (unit_price * quantity) antes de calcular
-- comisión y neto. El frontend traduce % → monto al registrar la venta.
-- Ejecutar en el SQL Editor de Supabase (schema: mumu)

ALTER TABLE mumu.sales
  ADD COLUMN IF NOT EXISTS discount_amount numeric NOT NULL DEFAULT 0;

-- Reemplaza register_sale para aceptar p_discount_amount opcional.
-- Comisión se calcula sobre el subtotal POST-descuento.
DROP FUNCTION IF EXISTS mumu.register_sale(uuid, uuid, integer, boolean);

CREATE OR REPLACE FUNCTION mumu.register_sale(
  p_variant_id uuid,
  p_location_id uuid,
  p_quantity integer,
  p_skip_commission boolean DEFAULT false,
  p_discount_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sale_id UUID;
  v_price NUMERIC;
  v_commission_rate NUMERIC;
  v_commission NUMERIC;
  v_current_stock INTEGER;
  v_discount NUMERIC;
  v_subtotal NUMERIC;
BEGIN
  -- Verificar stock
  SELECT quantity INTO v_current_stock
  FROM mumu.inventory
  WHERE variant_id = p_variant_id AND location_id = p_location_id;

  IF v_current_stock IS NULL OR v_current_stock < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %', COALESCE(v_current_stock, 0);
  END IF;

  -- Obtener precio del producto
  SELECT p.sale_price INTO v_price
  FROM mumu.products p
  JOIN mumu.product_variants pv ON pv.product_id = p.id
  WHERE pv.id = p_variant_id;

  -- Cap discount al subtotal, no permitir negativo
  v_discount := GREATEST(COALESCE(p_discount_amount, 0), 0);
  IF v_discount > (v_price * p_quantity) THEN
    v_discount := v_price * p_quantity;
  END IF;
  v_subtotal := (v_price * p_quantity) - v_discount;

  -- Obtener comisión de la ubicación (0 si es venta personal)
  IF p_skip_commission THEN
    v_commission := 0;
  ELSE
    SELECT commission_rate INTO v_commission_rate
    FROM mumu.locations WHERE id = p_location_id;
    v_commission := v_subtotal * (COALESCE(v_commission_rate, 0) / 100);
  END IF;

  -- Insertar venta
  INSERT INTO mumu.sales (variant_id, location_id, quantity, unit_price, commission_amount, discount_amount)
  VALUES (p_variant_id, p_location_id, p_quantity, v_price, v_commission, v_discount)
  RETURNING id INTO v_sale_id;

  -- Descontar stock
  UPDATE mumu.inventory
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE variant_id = p_variant_id AND location_id = p_location_id;

  -- Registrar movimiento
  INSERT INTO mumu.inventory_movements (variant_id, from_location_id, quantity, type)
  VALUES (p_variant_id, p_location_id, p_quantity, 'venta');

  RETURN v_sale_id;
END;
$function$;
