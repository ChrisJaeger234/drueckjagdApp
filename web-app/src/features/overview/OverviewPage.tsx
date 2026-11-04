import { Link } from '@tanstack/react-router';
import { Card, Page } from '../../components/ui';
import { HuntList } from '../hunts/HuntList';
import { isOpenStatus } from '../hunts/huntModel';
import { useAllHunts } from '../hunts/useHunts';
import { isProfileComplete, profileLabel } from '../profile/profileService';
import { useProfile } from '../profile/useProfile';
import { InstallHint } from './InstallHint';

export function OverviewPage() {
  const { data: profile } = useProfile();
  const { data: hunts } = useAllHunts();
  const upcoming = (hunts ?? []).filter((h) => isOpenStatus(h.status));
  return (
    <Page title="Übersicht">
      <InstallHint />
      <Card>
        <h2 className="mb-1 font-semibold">{profile ? `Waidmannsheil, ${profileLabel(profile)}!` : 'Waidmannsheil!'}</h2>
        <p className="text-sm text-muted">Hier siehst du die nächsten Jagden aus all deinen Gruppen.</p>
      </Card>
      {profile && !isProfileComplete(profile) && (
        <Card className="border-signal/60">
          <h2 className="font-semibold">Profil vervollständigen</h2>
          <p className="mb-2 text-sm text-muted">Lege Anzeige- und Benutzernamen fest, damit dich die anderen erkennen.</p>
          <Link to="/profil" className="text-sm font-medium text-primary underline">
            Zum Profil
          </Link>
        </Card>
      )}
      <Card>
        <h2 className="mb-2 font-semibold">Nächste Jagden</h2>
        {hunts && upcoming.length === 0 ? (
          <p className="text-sm text-muted">
            Keine geplanten Jagden. Owner und Admins planen sie in der{' '}
            <Link to="/gruppe" className="font-medium text-primary">
              Gruppe
            </Link>
            .
          </p>
        ) : (
          <HuntList hunts={upcoming} showGroup label="Nächste Jagden" />
        )}
      </Card>
    </Page>
  );
}
