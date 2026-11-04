import { useMutationState } from '@tanstack/react-query';
import { CloudUpload, WifiOff } from 'lucide-react';
import { MESSAGE_MUTATION_KEY, REPORT_MUTATION_KEY } from '../lib/offline';
import { useOnline } from '../lib/useOnline';

const bar = 'flex items-center gap-2 px-4 py-2 pt-[calc(env(safe-area-inset-top)+8px)] text-sm font-medium text-white';

export function OfflineBanner() {
  const online = useOnline();
  const reports = useMutationState({ filters: { mutationKey: REPORT_MUTATION_KEY, status: 'pending' } }).length;
  const messages = useMutationState({ filters: { mutationKey: MESSAGE_MUTATION_KEY, status: 'pending' } }).length;
  const waiting = reports + messages;
  const queue = describe(reports, messages);
  if (!online) {
    return (
      <div role="status" className={`${bar} bg-signal`}>
        <WifiOff aria-hidden className="size-4 shrink-0" />
        {waiting > 0 ? `Kein Netz. ${queue} und ${waiting === 1 ? 'wird' : 'werden'} automatisch gesendet.` : 'Kein Netz. Die App läuft offline mit den zuletzt geladenen Daten weiter.'}
      </div>
    );
  }
  if (waiting === 0) return null;
  return (
    <div role="status" className={`${bar} bg-forest`}>
      <CloudUpload aria-hidden className="size-4 shrink-0" />
      {waiting === 1 ? `${queue.replace(' wartet', '')} wird gesendet …` : `${queue.replace(' warten', '')} werden gesendet …`}
    </div>
  );
}

/** „1 Meldung wartet“, „2 Nachrichten warten“, „1 Meldung und 2 Nachrichten warten“. */
function describe(reports: number, messages: number): string {
  const parts = [
    reports > 0 ? `${reports} ${reports === 1 ? 'Meldung' : 'Meldungen'}` : null,
    messages > 0 ? `${messages} ${messages === 1 ? 'Nachricht' : 'Nachrichten'}` : null,
  ].filter(Boolean);
  return `${parts.join(' und ')} ${reports + messages === 1 ? 'wartet' : 'warten'}`;
}
