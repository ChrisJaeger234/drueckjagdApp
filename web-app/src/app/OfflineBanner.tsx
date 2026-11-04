import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-signal px-4 py-2 pt-[calc(env(safe-area-inset-top)+8px)] text-sm font-medium text-white">
      <WifiOff aria-hidden className="size-4" />
      Kein Netz. Die App läuft offline weiter.
    </div>
  );
}
