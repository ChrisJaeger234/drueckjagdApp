import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { createAppRouter } from './app/router';
import './styles/index.css';

registerSW({ immediate: true });

// BASE_URL ist "/" lokal und "/drueckjagdApp/app/" auf GitHub Pages.
const router = createAppRouter({ basepath: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);
