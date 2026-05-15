-- Visitas: estado observado por variante/sucursal (sin alterar inventario real)
create table mumu.visit_inventory (
  variant_id uuid not null references mumu.product_variants(id) on delete cascade,
  location_id uuid not null references mumu.locations(id) on delete cascade,
  observed_qty integer not null check (observed_qty >= 0),
  updated_at timestamptz default now(),
  primary key (variant_id, location_id)
);

alter table mumu.visit_inventory enable row level security;

create policy authenticated_full_access on mumu.visit_inventory
  for all to public
  using (auth.role() = 'authenticated');

-- Nota + foto por sucursal (una por location)
create table mumu.visit_notes (
  location_id uuid primary key references mumu.locations(id) on delete cascade,
  notes text default '',
  photo_url text,
  updated_at timestamptz default now()
);

alter table mumu.visit_notes enable row level security;

create policy authenticated_full_access on mumu.visit_notes
  for all to public
  using (auth.role() = 'authenticated');

-- Bucket público para fotos de visita
insert into storage.buckets (id, name, public)
values ('visit-photos', 'visit-photos', true)
on conflict (id) do nothing;

create policy "Authenticated users can upload visit photos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'visit-photos');

create policy "Authenticated users can update visit photos"
  on storage.objects for update to authenticated
  using (bucket_id = 'visit-photos');

create policy "Authenticated users can delete visit photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'visit-photos');

create policy "Public read access for visit photos"
  on storage.objects for select to public
  using (bucket_id = 'visit-photos');
