import { Link } from '@tanstack/react-router';
import { Card, Page } from '../../components/ui';
import { isProfileComplete, profileLabel } from '../profile/profileService';
import { useProfile } from '../profile/useProfile';
import { InstallHint } from './InstallHint';

export function OverviewPage() {
  const { data: profile } = useProfile();
  return (
    <Page title="Übersicht">
      <InstallHint />
      <Card>
        <h2 className="mb-1 font-semibold">{profile ? `Waidmannsheil, ${profileLabel(profile)}!` : 'Waidmannsheil!'}</h2>
        <p className="text-sm text-muted">
          Du bist mit deinem Konto angemeldet. Gruppen, Reviere und Jagden folgen in den nächsten Schritten und nutzen
          dieselben Daten wie die bisherige App.
        </p>
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
    </Page>
  );
}
