import { User } from 'lucide-react';
import { ComingSoon, Page } from '../../components/ui';

export function ProfilePage() {
  return (
    <Page title="Profil">
      <ComingSoon icon={User} title="Anmeldung und Profil" text="Anmelden mit dem bestehenden Konto, Profil und Profilbild." phase="Phase 2" />
    </Page>
  );
}
