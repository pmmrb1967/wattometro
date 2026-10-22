// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Home } from './Home';
import { Power } from './Power';
import { Tariffs } from './Tariffs';
import { Quality } from './Quality';
import { Settings } from './Settings';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'potencia', element: <Power /> },
      { path: 'tarifarios', element: <Tariffs /> },
      { path: 'qualidade', element: <Quality /> },
      { path: 'definicoes', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
