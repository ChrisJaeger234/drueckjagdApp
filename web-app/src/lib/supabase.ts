import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { appConfig, configProblems } from './config';

// Einziger Supabase-Client der App. Ohne gültige Konfiguration gibt es bewusst keinen
// Client (keine Scheinverbindung), die Oberfläche zeigt dann einen Hinweis.
// Die Datenbanktypen erzeugt ab Phase 2 `supabase gen types typescript`.
export const supabase: SupabaseClient | null = configProblems.length
  ? null
  : createClient(appConfig.supabaseUrl, appConfig.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
