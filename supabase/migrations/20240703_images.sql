-- Képek oszlop hozzáadása
alter table public.places  add column if not exists images text[] default '{}';
alter table public.reviews add column if not exists images text[] default '{}';

-- Storage bucket (ezt a Supabase dashboardon kell létrehozni, de a policy itt kezelhető)
-- Bucket neve: place-images (public)

-- Storage RLS: bárki feltölthet, bárki olvashatja a publikus fájlokat
insert into storage.buckets (id, name, public)
values ('place-images', 'place-images', true)
on conflict (id) do nothing;

create policy "Public read place-images"
  on storage.objects for select
  using (bucket_id = 'place-images');

create policy "Authenticated upload place-images"
  on storage.objects for insert
  with check (bucket_id = 'place-images' AND auth.role() = 'authenticated');
