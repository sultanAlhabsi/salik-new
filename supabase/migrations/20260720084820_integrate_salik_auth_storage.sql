insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salik-private',
  'salik-private',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "salik users upload to their private folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'salik-private'
  and (storage.foldername(name))[1] = (select auth.jwt() -> 'app_metadata' ->> 'salik_organization_id')
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "salik users read their private files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'salik-private'
  and (storage.foldername(name))[1] = (select auth.jwt() -> 'app_metadata' ->> 'salik_organization_id')
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "salik users replace their private files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'salik-private'
  and (storage.foldername(name))[1] = (select auth.jwt() -> 'app_metadata' ->> 'salik_organization_id')
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'salik-private'
  and (storage.foldername(name))[1] = (select auth.jwt() -> 'app_metadata' ->> 'salik_organization_id')
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

create policy "salik users delete their private files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'salik-private'
  and (storage.foldername(name))[1] = (select auth.jwt() -> 'app_metadata' ->> 'salik_organization_id')
  and (storage.foldername(name))[2] = (select auth.uid())::text
);
