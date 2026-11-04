import { AppError } from '../lib/errors';
import type { AppUser, AuthEvent, AuthService, SignUpResult } from '../features/auth/authService';
import type { Profile, ProfileService } from '../features/profile/profileService';

/** In-Memory-Auth für Tests (wie FakeAuthRepository in der Flutter-App). */
export class FakeAuth implements AuthService {
  user: AppUser | null;
  passwords = new Map<string, string>();
  confirmationRequired = false;
  unconfirmed = new Set<string>();
  calls: string[] = [];
  private listeners = new Set<(u: AppUser | null, e: AuthEvent) => void>();

  constructor(user: AppUser | null = null) {
    this.user = user;
  }

  private emit(event: AuthEvent) {
    this.listeners.forEach((l) => l(this.user, event));
  }

  async currentUser() {
    return this.user;
  }
  onChange(listener: (u: AppUser | null, e: AuthEvent) => void) {
    this.listeners.add(listener);
    queueMicrotask(() => listener(this.user, 'initial'));
    return () => this.listeners.delete(listener);
  }
  async signUp({ email, password }: { email: string; password: string }): Promise<SignUpResult> {
    this.calls.push(`signUp:${email}`);
    if (this.passwords.has(email)) throw new AppError('Für diese E-Mail-Adresse existiert bereits ein Konto.', 'emailAlreadyRegistered');
    this.passwords.set(email, password);
    if (this.confirmationRequired) {
      this.unconfirmed.add(email);
      return 'confirmationRequired';
    }
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('signedIn');
    return 'signedIn';
  }
  async signIn({ email, password }: { email: string; password: string }) {
    this.calls.push(`signIn:${email}`);
    if (this.passwords.get(email) !== password) throw new AppError('E-Mail-Adresse oder Passwort ist falsch.', 'invalidCredentials');
    if (this.unconfirmed.has(email)) {
      throw new AppError('Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der Bestätigungs-Mail.', 'emailNotConfirmed');
    }
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('signedIn');
  }
  async signOut() {
    this.calls.push('signOut');
    this.user = null;
    this.emit('signedOut');
  }
  async resendConfirmation(email: string) {
    this.calls.push(`resend:${email}`);
  }
  async requestPasswordReset(email: string) {
    this.calls.push(`reset:${email}`);
  }
  async updatePassword(password: string) {
    this.calls.push('updatePassword');
    if (this.user?.email) this.passwords.set(this.user.email, password);
  }
  /** Simuliert das Öffnen des Links aus der Passwort-Mail. */
  openRecoveryLink(email: string) {
    this.user = { id: `u-${email}`, email, emailConfirmed: true };
    this.emit('passwordRecovery');
  }
}

export class FakeProfiles implements ProfileService {
  profiles = new Map<string, Profile>();
  takenUsernames = new Set<string>();

  seed(id: string, data: Partial<Profile> = {}) {
    this.profiles.set(id, { id, username: null, displayName: '', avatarPath: null, createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z', ...data });
  }
  async fetch(userId: string) {
    const p = this.profiles.get(userId);
    if (!p) {
      this.seed(userId);
      return this.profiles.get(userId)!;
    }
    return p;
  }
  async update(userId: string, { username, displayName }: { username: string; displayName: string }) {
    if (this.takenUsernames.has(username)) throw new AppError('Dieser Benutzername ist bereits vergeben.', 'conflict');
    const next = { ...(await this.fetch(userId)), username, displayName };
    this.profiles.set(userId, next);
    return next;
  }
  async uploadAvatar(userId: string) {
    const next = { ...(await this.fetch(userId)), avatarPath: `${userId}/avatar.jpg` };
    this.profiles.set(userId, next);
    return next;
  }
  async avatarUrl() {
    return null;
  }
}
