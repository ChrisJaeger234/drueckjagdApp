-- =============================================================================
-- 0005 – Storage: privater Bucket für Profilbilder (vorbereitet)
--
-- Pfadkonvention: avatars/<user_id>/<dateiname>
--   * Schreiben/Löschen nur im eigenen Ordner.
--   * Lesen: eigener Ordner oder Benutzer mit gemeinsamer Gruppe.
-- Der Upload in der App folgt, sobald image_picker integriert ist (Phase 2).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "avatars: eigene oder Gruppenmitglieder lesen"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.shares_group_with(private.try_uuid((storage.foldername(name))[1]))
    )
  );

create policy "avatars: nur in eigenen Ordner hochladen"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: nur eigene Dateien ändern"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: nur eigene Dateien löschen"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
