-- Elimina la versión vieja de register_sale (sin p_skip_commission) que
-- causaba ambigüedad de overload con la nueva versión de 4 argumentos.
-- El frontend siempre pasa p_skip_commission, así que la firma de 3 args
-- ya no se usa.
-- Ejecutar en el SQL Editor de Supabase (schema: mumu)

DROP FUNCTION IF EXISTS mumu.register_sale(uuid, uuid, integer);
