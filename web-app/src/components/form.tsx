import React, { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
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

export function TextArea({ label, error, hint, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-xl border bg-surface px-3 py-2 text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 ${error ? 'border-danger' : 'border-line'}`}
        {...props}
      />
      {error ? <p className="text-sm text-danger">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]" />
    </label>
  );
}

/** Auswahl aus wenigen Optionen als Knopfleiste. */
export function Choice<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-xl border px-3 text-sm ${o.value === value ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
