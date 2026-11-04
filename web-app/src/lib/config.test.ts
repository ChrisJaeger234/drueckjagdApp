import { describe, expect, it } from 'vitest';
import { configFromEnv, isPrivilegedKey, validateConfig } from './config';

// Gleiche Fälle wie test/unit/app_config_test.dart der Flutter-App.
const jwt = (payload: object) => {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'HS256' })}.${enc(payload)}.signature`;
};

describe('validateConfig', () => {
  it('gültige Konfiguration hat keine Probleme', () => {
    expect(validateConfig({ supabaseUrl: 'https://abc.supabase.co', supabaseKey: 'sb_publishable_123', mapboxToken: '' })).toEqual([]);
  });

  it('meldet fehlende Werte', () => {
    expect(validateConfig(configFromEnv({}))).toHaveLength(2);
  });

  it('lehnt eine ungültige URL ab', () => {
    const problems = validateConfig({ supabaseUrl: 'abc.supabase.co', supabaseKey: 'sb_publishable_123', mapboxToken: '' });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('VITE_SUPABASE_URL');
  });

  it('lehnt einen Secret-Key (neues Format) ab', () => {
    const problems = validateConfig({ supabaseUrl: 'https://abc.supabase.co', supabaseKey: 'sb_secret_abc', mapboxToken: '' });
    expect(problems[0]).toContain('Service-Role');
  });

  it('erkennt Service-Role-JWT und akzeptiert anon-JWT', () => {
    expect(isPrivilegedKey(jwt({ role: 'service_role' }))).toBe(true);
    expect(isPrivilegedKey(jwt({ role: 'anon' }))).toBe(false);
    expect(isPrivilegedKey('kein.gültiger.jwt')).toBe(false);
  });

  it('bevorzugt den Publishable-Key vor dem anon-Key', () => {
    const config = configFromEnv({ VITE_SUPABASE_URL: ' https://x.supabase.co ', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1', VITE_SUPABASE_ANON_KEY: 'anon' });
    expect(config).toMatchObject({ supabaseUrl: 'https://x.supabase.co', supabaseKey: 'sb_publishable_1' });
  });
});
