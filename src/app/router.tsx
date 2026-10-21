// SPDX-License-Identifier: AGPL-3.0-or-later
import { createBrowserRouter } from 'react-router';
import { Home } from './Home';

export const router = createBrowserRouter([{ path: '*', element: <Home /> }]);
