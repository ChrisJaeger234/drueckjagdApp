import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { CircleAlert, Eye, EyeOff } from 'lucide-react';

export function Field({
  label,
  error,
  hint,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && visible ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-h-11 w-full rounded-xl border bg-surface px-3 text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 ${
            error ? 'border-danger' : 'border-line'
          } ${isPassword ? 'pr-11' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted"
          >
            {visible ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-light/40 px-3 py-2 text-sm text-danger">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-xl bg-moss-light/40 px-3 py-2 text-sm text-forest dark:text-moss-light">
      {children}
    </p>
  );
}
