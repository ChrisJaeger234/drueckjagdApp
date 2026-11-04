import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { createAppRouter } from './app/router';
import { SetupPage } from './app/SetupPage';
import { createSupabaseAuthService } from './features/auth/authService';
import { createSupabaseGroupsService } from './features/groups/groupsService';
import { createSupabaseHuntsService } from './features/hunts/huntsService';
import { createSupabaseProfileService } from './features/profile/profileService';
import { createSupabaseReviereService } from './features/reviere/reviereService';
import { supabase } from './lib/supabase';
import './styles/index.css';

registerSW({ immediate: true });

// BASE_URL ist "/" lokal und "/drueckjagdApp/app/" auf GitHub Pages.
const base = import.meta.env.BASE_URL;
const appUrl = new URL(base, window.location.origin).toString();
const root = createRoot(document.getElementById('root')!);

if (!supabase) {
  root.render(<SetupPage />);
} else {
  const services = {
    auth: createSupabaseAuthService(supabase, appUrl),
    profiles: createSupabaseProfileService(supabase),
    groups: createSupabaseGroupsService(supabase),
    reviere: createSupabaseReviereService(supabase),
    hunts: createSupabaseHuntsService(supabase),
  };
  const router = createAppRouter({ basepath: base.replace(/\/$/, '') || '/' });
  root.render(
    <StrictMode>
      <App router={router} services={services} persist />
    </StrictMode>,
  );
}
