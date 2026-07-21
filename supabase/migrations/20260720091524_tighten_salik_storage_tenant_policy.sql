drop policy if exists "salik users upload to their private folder" on storage.objects;
drop policy if exists "salik users read their private files" on storage.objects;
drop policy if exists "salik users replace their private files" on storage.objects;
drop policy if exists "salik users delete their private files" on storage.objects;

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
