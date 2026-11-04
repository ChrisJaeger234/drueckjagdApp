import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Kopfzeile und Inhalt einer Seite, mit Abstand zur sicheren Zone auf dem iPhone. */
export function Page({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-[calc(env(safe-area-inset-top)+16px)] md:pt-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions}
      </header>
      <div className="grid gap-4">{children}</div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</section>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles = {
    primary: 'bg-primary text-on-primary border-primary',
    secondary: 'bg-surface text-text border-line',
    danger: 'bg-danger text-white border-danger',
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

/** Platzhalter für Bereiche, die in einer späteren Phase gebaut werden. */
export function ComingSoon({ icon: Icon, title, text, phase }: { icon: LucideIcon; title: string; text: string; phase: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon aria-hidden className="size-10 text-moss" />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted">{text}</p>
      <span className="mt-1 rounded-full bg-sand-light px-3 py-1 text-xs font-medium text-bark">{phase}</span>
    </Card>
  );
}

/** Zweistufige Bestätigung für Aktionen, die sich nicht rückgängig machen lassen. */
export function ConfirmButton({
  label,
  confirmText,
  confirmLabel = 'Ja, bestätigen',
  onConfirm,
  disabled,
  danger = true,
}: {
  label: ReactNode;
  confirmText: string;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button variant="secondary" disabled={disabled} onClick={() => setAsking(true)} className={danger ? 'text-danger!' : ''}>
        {label}
      </Button>
    );
  }
  return (
    <div role="alertdialog" aria-label={confirmText} className="grid gap-2 rounded-xl border border-danger/50 p-3">
      <p className="text-sm">{confirmText}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={disabled}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={() => setAsking(false)}>
          Abbrechen
        </Button>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'primary' | 'signal' }) {
  const styles = {
    neutral: 'bg-sand-light text-bark',
    primary: 'bg-forest text-white dark:bg-moss-light dark:text-forest-deep',
    signal: 'bg-signal/15 text-signal',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
