import type { ReactNode } from 'react';
import { OfflineBanner } from '../../app/OfflineBanner';

/** Rahmen für Anmelde- und Registrierungsseiten (ohne Hauptnavigation). */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <OfflineBanner />
      <div className="mx-auto flex w-full max-w-md flex-col px-4 pb-10 pt-[calc(env(safe-area-inset-top)+40px)]">
        <div className="mb-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="size-12 rounded-xl" />
          <div>
            <p className="text-sm font-medium text-muted">Drückjagd</p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        {subtitle && <p className="mb-4 text-sm text-muted">{subtitle}</p>}
        <div className="rounded-2xl border border-line bg-surface p-5">{children}</div>
      </div>
    </div>
  );
}
