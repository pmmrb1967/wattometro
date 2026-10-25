// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter, Navigate } from 'react-router';
import { AppShell } from './AppShell';
import { Calibrate } from './Calibrate';
import { WithChat } from './ChatDock';
import { Consumption } from './Consumption';
import { Home } from './Home';
import { Power } from './Power';
import { Tariffs } from './Tariffs';
import { Quality } from './Quality';
import { Report } from './Report';
import { Settings } from './Settings';

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      {
        // The chat (ChatDock) on every page; "/perguntar" opens it.
        element: <WithChat />,
        children: [
          { index: true, element: <Home /> },
          { path: 'consumo', element: <Consumption /> },
          { path: 'consumo/relatorio', element: <Report /> },
          { path: 'consumo/calibrar', element: <Calibrate /> },
          { path: 'potencia', element: <Power /> },
          { path: 'tarifarios', element: <Tariffs /> },
          { path: 'qualidade', element: <Quality /> },
          { path: 'perguntar', element: <Navigate to="/" replace /> },
          { path: 'definicoes', element: <Settings /> },
          { path: '*', element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
