import { createContext, useContext, type ReactNode } from 'react';
import type { AuthService } from '../features/auth/authService';
import type { GroupsService } from '../features/groups/groupsService';
import type { ProfileService } from '../features/profile/profileService';
import type { ReviereService } from '../features/reviere/reviereService';

/** Alle Zugriffe auf das Backend, austauschbar für Tests (wie die Repositories in Flutter). */
export interface Services {
  auth: AuthService;
  profiles: ProfileService;
  groups: GroupsService;
  reviere: ReviereService;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(ServicesContext);
  if (!ctx) throw new Error('useServices außerhalb von ServicesProvider');
  return ctx;
}
