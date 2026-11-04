// Laufzeitkonfiguration der Web-App (Port von lib/app/config/app_config.dart).
// Werte kommen zur Build-Zeit aus VITE_-Umgebungsvariablen und stehen nie im Quellcode.

export interface AppConfig {
  supabaseUrl: string;
  supabaseKey: string;
  mapboxToken: string;
}

export interface ConfigEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_MAPBOX_ACCESS_TOKEN?: string;
}

export function configFromEnv(env: ConfigEnv): AppConfig {
  const publishable = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';
  return {
    supabaseUrl: env.VITE_SUPABASE_URL?.trim() ?? '',
    supabaseKey: publishable || (env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''),
    mapboxToken: env.VITE_MAPBOX_ACCESS_TOKEN?.trim() ?? '',
  };
}

/** Schlüssel mit Administratorrechten: neues `sb_secret_`-Format oder JWT mit `role: service_role`. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))) as unknown;
    return typeof payload === 'object' && payload !== null && (payload as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/** Alle Konfigurationsprobleme; leere Liste = gültig. */
export function validateConfig(config: AppConfig): string[] {
  const problems: string[] = [];
  if (!config.supabaseUrl) {
    problems.push('VITE_SUPABASE_URL ist nicht gesetzt.');
  } else {
    if (!isHttpUrl(config.supabaseUrl)) problems.push('VITE_SUPABASE_URL ist keine gültige http(s)-Adresse.');
  }
  if (!config.supabaseKey) {
    problems.push('VITE_SUPABASE_PUBLISHABLE_KEY bzw. VITE_SUPABASE_ANON_KEY ist nicht gesetzt.');
  } else if (isPrivilegedKey(config.supabaseKey)) {
    problems.push(
      'Der hinterlegte Schlüssel ist ein Secret- bzw. Service-Role-Key. Diese dürfen niemals in der App verwendet werden.',
    );
  }
  return problems;
}

export const appConfig = configFromEnv(import.meta.env as ConfigEnv);
export const configProblems = validateConfig(appConfig);
