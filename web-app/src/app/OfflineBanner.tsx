import { useMutationState } from '@tanstack/react-query';
import { CloudUpload, WifiOff } from 'lucide-react';
import { REPORT_MUTATION_KEY } from '../lib/offline';
import { useOnline } from '../lib/useOnline';

const bar = 'flex items-center gap-2 px-4 py-2 pt-[calc(env(safe-area-inset-top)+8px)] text-sm font-medium text-white';

export function OfflineBanner() {
  const online = useOnline();
  const waiting = useMutationState({ filters: { mutationKey: REPORT_MUTATION_KEY, status: 'pending' } }).length;
  const queue = waiting === 1 ? '1 Meldung wartet' : `${waiting} Meldungen warten`;
  if (!online) {
    return (
      <div role="status" className={`${bar} bg-signal`}>
        <WifiOff aria-hidden className="size-4 shrink-0" />
        {waiting > 0 ? `Kein Netz. ${queue} und wird automatisch gesendet.` : 'Kein Netz. Die App läuft offline mit den zuletzt geladenen Daten weiter.'}
      </div>
    );
  }
  if (waiting === 0) return null;
  return (
    <div role="status" className={`${bar} bg-forest`}>
      <CloudUpload aria-hidden className="size-4 shrink-0" />
      {waiting === 1 ? '1 Meldung wird gesendet …' : `${waiting} Meldungen werden gesendet …`}
    </div>
  );
}
