import { Users } from 'lucide-react';
import { ComingSoon, Page } from '../../components/ui';

export function GroupsPage() {
  return (
    <Page title="Gruppe">
      <ComingSoon icon={Users} title="Gruppen und Mitglieder" text="Gruppen, Rollen und Einladungscodes aus der bisherigen App." phase="Phase 3" />
    </Page>
  );
}
