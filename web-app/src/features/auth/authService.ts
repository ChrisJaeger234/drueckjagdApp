import type { SupabaseClient, User } from '@supabase/supabase-js';
import { check, guard, unwrap } from '../../lib/errors';

/** Minimale, vom Backend unabhängige Sicht auf den angemeldeten Benutzer. */
export interface AppUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
}

export type SignUpResult = 'signedIn' | 'confirmationRequired';
export type AuthEvent = 'initial' | 'signedIn' | 'signedOut' | 'passwordRecovery' | 'other';

/** Authentifizierung, unabhängig von Supabase (Port von AuthRepository in Flutter). */
export interface AuthService {
  currentUser(): Promise<AppUser | null>;
  /** Meldet jede Änderung; liefert eine Funktion zum Abmelden des Beobachters. */
  onChange(listener: (user: AppUser | null, event: AuthEvent) => void): () => void;
  signUp(input: { email: string; password: string; displayName?: string }): Promise<SignUpResult>;
  signIn(input: { email: string; password: string }): Promise<void>;
  signOut(): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
}

export function toAppUser(user: User | null | undefined): AppUser | null {
  return user ? { id: user.id, email: user.email ?? null, emailConfirmed: user.email_confirmed_at != null } : null;
}

/**
 * Supabase-Umsetzung. `appUrl` ist die Adresse der App (z. B. https://…/drueckjagdApp/app/);
 * dorthin führen die Links in Bestätigungs- und Passwort-Mails. Sie muss in Supabase unter
 * Authentication → URL Configuration → Redirect URLs eingetragen sein.
 */
export function createSupabaseAuthService(client: SupabaseClient, appUrl: string): AuthService {
  const auth = client.auth;
  return {
    currentUser: () =>
      guard(async () => {
        const { data } = await auth.getSession();
        return toAppUser(data.session?.user);
      }),
    onChange(listener) {
      const { data } = auth.onAuthStateChange((event, session) => {
        const mapped: AuthEvent =
          event === 'INITIAL_SESSION'
            ? 'initial'
            : event === 'SIGNED_IN'
              ? 'signedIn'
              : event === 'SIGNED_OUT'
                ? 'signedOut'
                : event === 'PASSWORD_RECOVERY'
                  ? 'passwordRecovery'
                  : 'other';
        listener(toAppUser(session?.user), mapped);
      });
      return () => data.subscription.unsubscribe();
    },
    signUp: ({ email, password, displayName }) =>
      guard(async () => {
        const data = unwrap(
          await auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: appUrl, data: displayName ? { display_name: displayName.trim() } : undefined },
          }),
        );
        return data.session ? 'signedIn' : 'confirmationRequired';
      }),
    signIn: ({ email, password }) =>
      guard(async () => {
        check(await auth.signInWithPassword({ email: email.trim(), password }));
      }),
    signOut: () =>
      guard(async () => {
        // "local": auch ohne Netz abmelden; der Server-Token läuft dann von selbst ab.
        check(await auth.signOut({ scope: 'local' }));
      }),
    resendConfirmation: (email) =>
      guard(async () => {
        check(await auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl } }));
      }),
    requestPasswordReset: (email) =>
      guard(async () => {
        check(await auth.resetPasswordForEmail(email.trim(), { redirectTo: `${appUrl}passwort-neu` }));
      }),
    updatePassword: (password) =>
      guard(async () => {
        check(await auth.updateUser({ password }));
      }),
  };
}
