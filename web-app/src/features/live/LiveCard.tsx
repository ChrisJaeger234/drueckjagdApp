import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useServices } from '../../app/services';
import { Toggle } from '../../components/form';
import { Badge, Button, Card } from '../../components/ui';
import { HUNT_ROLES, positionAge, roleColor, sharesPosition, type Hunt, type LivePosition, type Participant } from '../hunts/huntModel';
import { liveStore, useLiveSettings, useLiveStatus } from './liveStore';

/** Sekundentakt für „vor 2 Min.“, nur solange etwas angezeigt wird. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function LiveCard({
  hunt,
  me,
  people,
  positions,
  live,
}: {
  hunt: Hunt;
  me: Participant | null;
  people: Participant[];
  positions: LivePosition[];
  live: { canShare: boolean; canView: boolean };
}) {
  const settings = useLiveSettings();
  const status = useLiveStatus();
  const { hunts } = useServices();
  const sharingHere = settings?.huntId === hunt.id;
  const others = positions.filter((p) => p.userId !== me?.userId);
  const now = useNow(live.canView || sharingHere);
  const lastStop = status.kind === 'off' ? status.reason : undefined;

  if (hunt.status !== 'laufend') {
    if (me && sharesPosition(me.role) && hunt.status === 'geplant') {
      return (
        <Card>
          <h2 className="mb-1 font-semibold">Standort teilen</h2>
          <p className="text-sm text-muted">Sobald die Jagd läuft, kannst du als {HUNT_ROLES[me.role]} hier deinen Standort mit der Jagdleitung und den anderen Treibern teilen.</p>
        </Card>
      );
    }
    return null;
  }

  const stop = () => {
    liveStore.stop();
    void hunts.stopSharing(hunt.id).catch(() => undefined);
  };

  return (
    <Card className="grid gap-3">
      <div className="flex items-center gap-2">
        <Radio aria-hidden className="size-5 text-primary" />
        <h2 className="font-semibold">Live-Standorte</h2>
      </div>

      {live.canShare ? (
        sharingHere ? (
          <div className="grid gap-2">
            <p className="text-sm" data-testid="live-status">
              {status.kind === 'sharing'
                ? `Du teilst deinen Standort${status.accuracy ? ` (Genauigkeit etwa ${Math.round(status.accuracy)} m)` : ''}. ${status.lastSentAt ? `Zuletzt gesendet ${positionAge(new Date(status.lastSentAt).toISOString(), now).text}.` : ''}`
                : status.kind === 'error'
                  ? status.message
                  : 'Standort wird gesucht …'}
            </p>
            <Toggle
              label="Bildschirm anlassen"
              description="Ein Browser darf im Hintergrund kein GPS lesen. Mit gesperrtem Bildschirm pausiert das Teilen."
              checked={settings.keepAwake}
              onChange={(v) => liveStore.update({ keepAwake: v })}
            />
            <Button variant="secondary" onClick={stop}>
              Teilen beenden
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted">
              Als {HUNT_ROLES[me!.role]} kannst du deinen Standort teilen. Ihn sehen die Jagdleitung, Treiber, Hundeführer und Bergung, aber keine Schützen. Geteilt wird nur, solange die App offen und der Bildschirm an ist; mit dem Ende der Jagd wird er gelöscht.
            </p>
            {lastStop && <p className="text-sm text-danger">{lastStop}</p>}
            <Button onClick={() => liveStore.start({ huntId: hunt.id, huntTitle: hunt.title, keepAwake: true })}>
              <Radio aria-hidden className="size-4" /> Meinen Standort teilen
            </Button>
          </div>
        )
      ) : (
        <p className="text-sm text-muted">
          {me?.role === 'schuetze'
            ? 'Als Schütze teilst du keinen Standort und siehst nur deinen eigenen („Mein Standort“ an der Karte).'
            : 'Du teilst keinen Standort.'}
        </p>
      )}

      {live.canView && (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Geteilt ({others.length})</h3>
          {others.length === 0 ? (
            <p className="text-sm text-muted">Gerade teilt niemand sonst seinen Standort.</p>
          ) : (
            <ul className="grid gap-1" aria-label="Live-Standorte">
              {others.map((p) => {
                const person = people.find((x) => x.userId === p.userId);
                const age = positionAge(p.updatedAt, now);
                return (
                  <li key={p.userId} className="flex min-h-10 items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ background: age.stale ? '#9e9e9e' : person ? roleColor(person.role) : '#555' }} />
                    <span className="min-w-0 flex-1 truncate">{person?.name ?? 'Unbekannt'}</span>
                    {person && <Badge>{HUNT_ROLES[person.role]}</Badge>}
                    <span className={`text-sm ${age.stale ? 'text-danger' : 'text-muted'}`}>{age.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/** Live-Positionen als Kartenmarker; veraltete (über 2 Min.) grau. */
export function liveMarkers(positions: LivePosition[], people: Participant[], myId: string, now = Date.now()) {
  return positions
    .filter((p) => p.userId !== myId)
    .map((p) => {
      const person = people.find((x) => x.userId === p.userId);
      const age = positionAge(p.updatedAt, now);
      const name = person?.name ?? 'Unbekannt';
      const role = person ? HUNT_ROLES[person.role] : 'Teilnehmer';
      return {
        id: `live:${p.userId}`,
        lat: p.lat,
        lng: p.lng,
        label: `${name} (${age.text})`,
        color: age.stale ? '#9e9e9e' : person ? roleColor(person.role) : '#555555',
        ariaLabel: `${role} ${name}, ${age.text}`,
      };
    });
}
