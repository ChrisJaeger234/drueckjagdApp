import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { FormError, Toggle } from '../../components/form';
import { useServices } from '../../app/services';
import { useUser } from '../auth/AuthContext';
import { useSubmit } from '../auth/useSubmit';
import type { PushSettings } from './pushService';

/** Profil: Benachrichtigungen für dieses Gerät ein- und ausschalten. */
export function PushCard() {
  const { push } = useServices();
  const user = useUser();
  const client = useQueryClient();
  const key = ['push-status', user.id];
  const { data } = useQuery({ queryKey: key, queryFn: () => push.status(), networkMode: 'always' });
  const { busy, error, run } = useSubmit();

  const refresh = () => client.invalidateQueries({ queryKey: key });
  const enable = () => run(() => push.enable(data?.settings ?? { chat: true, reports: true })).then(refresh);
  const disable = () => run(() => push.disable()).then(refresh);
  const change = (next: PushSettings) => {
    client.setQueryData(key, { state: 'on', settings: next });
    void run(() => push.update(next)).then(refresh);
  };

  if (!data) return null;
  return (
    <Card className="grid gap-3">
      <h2 className="font-semibold">Benachrichtigungen</h2>
      {data.state === 'unsupported' && <p className="text-sm text-muted">Dieser Browser kann keine Benachrichtigungen empfangen.</p>}
      {data.state === 'needs-install' && (
        <p className="text-sm text-muted">
          Auf dem iPhone kommen Benachrichtigungen nur in der installierten App: in Safari auf „Teilen“ tippen, „Zum Home-Bildschirm“ wählen und die App dann von dort
          öffnen.
        </p>
      )}
      {data.state === 'denied' && (
        <p className="text-sm text-muted">Benachrichtigungen sind für diese App blockiert. Erlauben lässt sich das in den Einstellungen des Geräts bzw. Browsers.</p>
      )}
      {data.state === 'off' && (
        <>
          <p className="text-sm text-muted">Bei neuen Chatnachrichten und wenn Wild angeschossen gemeldet wird, auch wenn die App geschlossen ist.</p>
          <Button disabled={busy} onClick={() => void enable()}>
            <Bell aria-hidden className="size-4" /> Benachrichtigungen einschalten
          </Button>
        </>
      )}
      {data.state === 'on' && (
        <>
          <Toggle label="Neue Chatnachrichten" checked={data.settings.chat} onChange={(chat) => change({ ...data.settings, chat })} />
          <Toggle
            label="Nachsuche (angeschossen)"
            description="Geht an Jagdleitung, Ansteller, Hundeführer und Bergung der Jagd sowie an die Gruppenleitung."
            checked={data.settings.reports}
            onChange={(reports) => change({ ...data.settings, reports })}
          />
          <Button variant="secondary" disabled={busy} onClick={() => void disable()}>
            <BellOff aria-hidden className="size-4" /> Auf diesem Gerät ausschalten
          </Button>
        </>
      )}
      <FormError message={error?.message} />
    </Card>
  );
}
