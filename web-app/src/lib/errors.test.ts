import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { AppError, guard, mapError } from './errors';

// Gleiche Fälle wie test/unit/error_mapper_test.dart der Flutter-App.
const pg = (message: string, code: string) => ({ message, code, details: null, hint: null });

describe('mapError', () => {
  it('erkennt falsche Zugangsdaten', () => {
    const e = mapError(new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'));
    expect(e.kind).toBe('invalidCredentials');
    expect(e.message).toContain('falsch');
  });

  it('erkennt eine unbestätigte E-Mail-Adresse', () => {
    expect(mapError(new AuthApiError('Email not confirmed', 400, 'email_not_confirmed')).kind).toBe('emailNotConfirmed');
  });

  it('erkennt ein bereits registriertes Konto', () => {
    expect(mapError(new AuthApiError('User already registered', 422, 'user_already_exists')).kind).toBe('emailAlreadyRegistered');
  });

  it('erkennt das Rate-Limit', () => {
    expect(mapError(new AuthApiError('Too many', 429, 'over_email_send_rate_limit')).kind).toBe('rateLimited');
  });

  it('meldet Netzwerkfehler von Auth und fetch', () => {
    expect(mapError(new AuthRetryableFetchError('Failed to fetch', 0)).kind).toBe('network');
    expect(mapError(new TypeError('Failed to fetch')).kind).toBe('network');
    expect(mapError(new TypeError('Load failed')).kind).toBe('network');
  });

  it('übersetzt Fehlerschlüssel der SQL-Funktionen', () => {
    expect(mapError(pg('not_authorized', 'P0001'))).toMatchObject({ kind: 'forbidden' });
    expect(mapError(pg('too_many_attempts', 'P0001'))).toMatchObject({ kind: 'rateLimited' });
    expect(mapError(pg('last_owner', 'P0001')).message).toContain('einzige Owner');
    expect(mapError(pg('invalid_boundary', 'P0001')).kind).toBe('validation');
  });

  it('erkennt doppelte Einträge', () => {
    expect(mapError(pg('duplicate key value violates unique constraint "profiles_username_key"', '23505')).message).toContain('Benutzername');
    expect(mapError(pg('duplicate key value violates unique constraint "hunt_stands_label_key"', '23505')).message).toContain('bereits einen Stand');
  });

  it('erkennt fehlende Rechte und abgelaufene Sitzungen', () => {
    expect(mapError(pg('permission denied', '42501')).kind).toBe('forbidden');
    expect(mapError(pg('JWT expired', 'PGRST301')).kind).toBe('unauthenticated');
  });

  it('reicht AppError unverändert durch', () => {
    const original = new AppError('x', 'conflict');
    expect(mapError(original)).toBe(original);
  });

  it('wandelt Fehler in guard um', async () => {
    await expect(guard(() => Promise.reject(new TypeError('Failed to fetch')))).rejects.toMatchObject({ kind: 'network' });
  });
});
