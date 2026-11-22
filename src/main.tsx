// SPDX-License-Identifier: AGPL-3.0-or-later
import '@fontsource-variable/bricolage-grotesque';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { listenForInstall } from './app/install';
import { router } from './app/router';
import { applyTheme, readTheme } from './app/theme';
import './index.css';
import { startCloudReturn } from './local/cloud-return';

applyTheme(readTheme());
registerSW({ immediate: true });
// Before the browser fires beforeinstallprompt (install.ts).
listenForInstall();
// Back from the Microsoft sign-in: finished before the pages that left for it ask (cloud-return.ts).
startCloudReturn();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
