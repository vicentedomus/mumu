-- Gestión de ubicaciones: orden configurable y ubicación principal.
-- La ubicación principal reemplaza a "Casa" escrita fija en el código
-- (destino por defecto de pedidos y stock inicial de variantes nuevas).
alter table mumu.locations
  add column if not exists sort_order int not null default 0,
  add column if not exists is_default boolean not null default false;

-- Solo una ubicación puede ser la principal
create unique index if not exists locations_one_default
  on mumu.locations (is_default) where is_default;

update mumu.locations set is_default = true, sort_order = 0 where name = 'Casa';
update mumu.locations set sort_order = 1 where name = 'Marcé';
update mumu.locations set sort_order = 2 where name = 'Luan';
