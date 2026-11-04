import { Map } from 'lucide-react';
import { ComingSoon, Page } from '../../components/ui';

export function MapPage() {
  return (
    <Page title="Karte">
      <ComingSoon icon={Map} title="Revierkarte" text="Karte und Luftbild mit Reviergrenzen, Einrichtungen, Ständen und Zonen, auch ohne Netz." phase="Phase 4" />
    </Page>
  );
}
