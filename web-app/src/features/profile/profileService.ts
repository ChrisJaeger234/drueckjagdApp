import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError, guard, unwrap } from '../../lib/errors';

/** Benutzerprofil (Tabelle `profiles`). */
export interface Profile {
  id: string;
  username: string | null;
  displayName: string;
  /** Pfad im privaten Storage-Bucket `avatars`, z. B. `<user-id>/avatar-123.jpg`. */
  avatarPath: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PROFILE_COLUMNS = 'id, username, display_name, avatar_url, created_at, updated_at';

interface ProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export function profileFromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? '',
    avatarPath: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Name für die Anzeige in Listen. */
export function profileLabel(p: Pick<Profile, 'displayName' | 'username'>): string {
  if (p.displayName.trim()) return p.displayName.trim();
  if (p.username) return `@${p.username}`;
  return 'Unbenannt';
}

/** Vollständig, wenn Benutzer- und Anzeigename gesetzt sind. */
export function isProfileComplete(p: Pick<Profile, 'displayName' | 'username'>): boolean {
  return !!p.username && p.displayName.trim().length > 0;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface ProfileService {
  fetch(userId: string): Promise<Profile>;
  update(userId: string, input: { username: string; displayName: string }): Promise<Profile>;
  uploadAvatar(userId: string, file: Blob): Promise<Profile>;
  /** Kurzlebige URL zum Anzeigen eines Profilbilds (Bucket ist privat). */
  avatarUrl(path: string): Promise<string | null>;
}

export function createSupabaseProfileService(client: SupabaseClient): ProfileService {
  const select = (userId: string) => client.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single<ProfileRow>();
  return {
    fetch: (userId) => guard(async () => profileFromRow(unwrap(await select(userId)))),
    update: (userId, { username, displayName }) =>
      guard(async () => {
        const row = unwrap(
          await client
            .from('profiles')
            .update({ username: username.trim().toLowerCase(), display_name: displayName.trim() })
            .eq('id', userId)
            .select(PROFILE_COLUMNS)
            .single<ProfileRow>(),
        );
        return profileFromRow(row);
      }),
    uploadAvatar: (userId, file) =>
      guard(async () => {
        if (!AVATAR_TYPES.includes(file.type)) throw new AppError('Bitte ein JPG-, PNG- oder WebP-Bild wählen.', 'validation');
        if (file.size > AVATAR_MAX_BYTES) throw new AppError('Das Bild darf höchstens 2 MB groß sein.', 'validation');
        const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
        // Neuer Dateiname je Upload, damit kein Zwischenspeicher das alte Bild zeigt.
        const path = `${userId}/avatar-${Date.now()}.${ext}`;
        unwrap(await client.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false }));
        const previous = unwrap(await select(userId)).avatar_url;
        const row = unwrap(
          await client.from('profiles').update({ avatar_url: path }).eq('id', userId).select(PROFILE_COLUMNS).single<ProfileRow>(),
        );
        if (previous && previous !== path) await client.storage.from('avatars').remove([previous]);
        return profileFromRow(row);
      }),
    avatarUrl: (path) =>
      guard(async () => {
        const { data, error } = await client.storage.from('avatars').createSignedUrl(path, 60 * 60);
        return error ? null : data.signedUrl;
      }),
  };
}
