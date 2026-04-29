-- Agrega sale_date como fecha visible/editable de la venta, separada
-- del created_at (timestamp automático de registro, queda como trazabilidad).
-- Ejecutar en el SQL Editor de Supabase (schema: mumu)

ALTER TABLE mumu.sales
  ADD COLUMN IF NOT EXISTS sale_date date;

-- Backfill: ventas existentes usan la fecha del created_at
UPDATE mumu.sales
  SET sale_date = created_at::date
  WHERE sale_date IS NULL;

ALTER TABLE mumu.sales
  ALTER COLUMN sale_date SET DEFAULT current_date;

ALTER TABLE mumu.sales
  ALTER COLUMN sale_date SET NOT NULL;
