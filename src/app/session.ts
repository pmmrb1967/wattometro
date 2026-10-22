// SPDX-License-Identifier: AGPL-3.0-or-later
/** The signed-in user, shared by the pages inside AppShell (react-router outlet context). */
import { useOutletContext } from 'react-router';
import { t } from '../i18n/pt-PT';
import type { Failure, Me } from './api';

export interface SessionContext {
  me: Me;
  /** Replaces the user's data (e.g. after renaming the household). */
  update: (me: Me) => void;
  /** Shows the login again (logout, or a session that ended meanwhile). */
  signOut: () => void;
}

export const useSession = () => useOutletContext<SessionContext>();

/** Message for a failed request; null when the session ended (the caller signs out). */
export function failureText(failure: Failure, invalid: string): string | null {
  switch (failure.reason) {
    case 'invalid':
      return invalid;
    case 'locked':
      return t.errors.locked(Math.ceil(failure.retryAfter / 60));
    case 'unavailable':
      return t.errors.unavailable;
    case 'unauthenticated':
      return null;
    case 'demo':
      return t.demo.readOnly;
  }
}
