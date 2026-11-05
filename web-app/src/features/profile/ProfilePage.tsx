import { useNavigate } from '@tanstack/react-router';
import { Camera, KeyRound, LogOut } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Button, Card, Page } from '../../components/ui';
import { Field, FormError, FormSuccess } from '../../components/form';
import { mapError } from '../../lib/errors';
import * as V from '../../lib/validators';
import { useAuth, useUser } from '../auth/AuthContext';
import { useSubmit } from '../auth/useSubmit';
import { OfflinePacksCard } from '../offlineMaps/OfflinePacksCard';
import { PushCard } from '../push/PushCard';
import { useServices } from '../../app/services';
import { Avatar } from './Avatar';
import { isProfileComplete, profileLabel, type Profile } from './profileService';
import { resizeAvatar } from './resizeImage';
import { useProfile, useUpdateProfile, useUploadAvatar } from './useProfile';

export function ProfilePage() {
  const { data: profile, isPending, error } = useProfile();
  return (
    <Page title="Profil">
      {isPending ? (
        <Card>
          <p className="text-sm text-muted">Profil wird geladen …</p>
        </Card>
      ) : error ? (
        <Card>
          <FormError message={mapError(error).message} />
        </Card>
      ) : (
        <ProfileContent profile={profile} />
      )}
      <PushCard />
      <OfflinePacksCard />
      <SignOutCard />
    </Page>
  );
}

function ProfileContent({ profile }: { profile: Profile }) {
  const user = useUser();
  const upload = useUploadAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(!isProfileComplete(profile));

  async function onFile(file: File | undefined) {
    if (!file) return;
    const blob = await resizeAvatar(file).catch(() => file);
    upload.mutate(blob);
  }

  return (
    <>
      <Card className="flex items-center gap-4">
        <div className="relative">
          <Avatar path={profile.avatarPath} name={profileLabel(profile)} size={72} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Profilbild ändern"
            className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border border-line bg-surface text-text"
          >
            <Camera aria-hidden className="size-4" />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{profileLabel(profile)}</p>
          {profile.username && <p className="truncate text-sm text-muted">@{profile.username}</p>}
          <p className="truncate text-sm text-muted">{user.email}</p>
          {upload.isPending && <p className="text-sm text-muted">Bild wird hochgeladen …</p>}
        </div>
      </Card>
      {upload.error && <FormError message={mapError(upload.error).message} />}
      {!isProfileComplete(profile) && (
        <Card className="border-signal/60">
          <h2 className="font-semibold">Profil vervollständigen</h2>
          <p className="text-sm text-muted">Mit Benutzer- und Anzeigenamen erkennen dich die anderen in Gruppe und Jagd.</p>
        </Card>
      )}
      {editing ? <ProfileForm profile={profile} onDone={() => setEditing(false)} /> : (
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Profil bearbeiten
        </Button>
      )}
    </>
  );
}

function ProfileForm({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const update = useUpdateProfile();
  const [username, setUsername] = useState(profile.username ?? '');
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const errors = { username: V.username(username), displayName: V.displayName(displayName) };

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setSaved(false);
    if (errors.username || errors.displayName) return;
    update.mutate(
      { username, displayName },
      {
        onSuccess: (p) => {
          setSaved(true);
          if (isProfileComplete(p)) onDone();
        },
      },
    );
  }

  return (
    <Card>
      <form noValidate onSubmit={submit} className="grid gap-4">
        <h2 className="font-semibold">Profil bearbeiten</h2>
        <Field label="Anzeigename" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} error={touched ? errors.displayName : undefined} hint="So sehen dich die anderen, z. B. „Max Jäger“." />
        <Field
          label="Benutzername"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          error={touched ? errors.username : undefined}
          hint="3–24 Zeichen, Kleinbuchstaben, Ziffern und Unterstrich."
        />
        <FormError message={update.error ? mapError(update.error).message : null} />
        {saved && <FormSuccess>Gespeichert.</FormSuccess>}
        <div className="flex gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Speichern …' : 'Speichern'}
          </Button>
          {isProfileComplete(profile) && (
            <Button variant="secondary" onClick={onDone}>
              Abbrechen
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

function SignOutCard() {
  const { service } = useAuth();
  const { push } = useServices();
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit();
  return (
    <div className="grid gap-2">
      <FormError message={error?.message} />
      <Button variant="secondary" onClick={() => void navigate({ to: '/passwort-neu' })}>
        <KeyRound aria-hidden className="size-4" /> Passwort ändern
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => run(async () => {
          // Vorher, solange die Anmeldung noch gilt: Abo des Geräts in der Datenbank löschen.
          await push.disable();
          await service.signOut();
        })}>
        <LogOut aria-hidden className="size-4" /> Abmelden
      </Button>
    </div>
  );
}
