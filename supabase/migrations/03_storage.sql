-- 03_storage.sql (compat cross-version)

-- Crea/actualiza el bucket 'products' sin usar storage.create_bucket()
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set
  name   = excluded.name,
  public = excluded.public;

-- Asegura RLS en objetos del storage
alter table if exists storage.objects enable row level security;

-- Lectura pública SOLO del bucket 'products'
drop policy if exists "public can read product images" on storage.objects;
create policy "public can read product images"
  on storage.objects for select
  using (bucket_id = 'products');

-- Escritura para Admin autenticado o Service Role
drop policy if exists "admin write product images" on storage.objects;
create policy "admin write product images"
  on storage.objects for all
  using (
    bucket_id = 'products'
    and (is_admin(auth.uid()) or auth.role() = 'service_role')
  )
  with check (
    bucket_id = 'products'
    and (is_admin(auth.uid()) or auth.role() = 'service_role')
  );
