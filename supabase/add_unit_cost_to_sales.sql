-- Agrega unit_cost a la tabla sales para registrar el costo unitario
-- al momento de cada venta, permitiendo calcular margen histórico real.
-- Ejecutar en el SQL Editor de Supabase (schema: mumu)

ALTER TABLE mumu.sales
  ADD COLUMN IF NOT EXISTS unit_cost numeric DEFAULT 0;
