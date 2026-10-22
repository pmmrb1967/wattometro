// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { t } from '../i18n/pt-PT';
import { fetchHealth, fetchMe, logout, type Me } from './api';
import { APP_COMMIT, LICENSE_URL, SOURCE_URL } from './build-info';
import { feedbackLink } from './feedback';
import { InstallSection } from '../components/InstallSection';
import { Login } from './Login';
import type { SessionContext } from './session';

type ServerState = 'checking' | 'ok' | 'unavailable';

function useServerState(): ServerState {
  const [state, setState] = useState<ServerState>('checking');
  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setState(health.status === 'ok' ? 'ok' : 'unavailable'))
      .catch(() => {
        if (!controller.signal.aborted) setState('unavailable');
      });
    return () => controller.abort();
  }, []);
  return state;
}

/** undefined while the session is being checked; checking also renews it (sliding expiry). */
function useMe(): [Me | null | undefined, (me: Me | null) => void] {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal)
      .then(setMe)
      .catch(() => {
        if (!controller.signal.aborted) setMe(null);
      });
    return () => controller.abort();
  }, []);
  return [me, setMe];
}

/** Brand, navigation, the login gate and the footer around every page. */
export function AppShell() {
  const server = useServerState();
  const { pathname } = useLocation();
  const [me, setMe] = useMe();

  // Stable, so pages can depend on it in effects.
  const signOut = useCallback(() => void logout().then(() => setMe(null)), [setMe]);
  const context: SessionContext | null = me ? { me, update: setMe, signOut } : null;

  return (
    <div className="page">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>{t.appName}</span>
        </NavLink>
        {context && (
          <nav className="nav">
            <NavLink to="/" end>
              {t.nav.home}
            </NavLink>
            <NavLink to="/qualidade">{t.nav.quality}</NavLink>
            <NavLink to="/definicoes">{t.nav.settings}</NavLink>
          </nav>
        )}
      </header>

      <main className="content">
        {me === undefined && <p className="hint">{t.loading}</p>}
        {me === null && (
          <>
            <p className="tagline">{t.tagline}</p>
            <Login onSignedIn={setMe} />
            <InstallSection />
          </>
        )}
        {context && <Outlet context={context} />}
      </main>

      <footer className="footer">
        <p className={`server server-${server}`} role="status">
          <span className="dot" aria-hidden="true" />
          {t.server[server]}
        </p>
        <p>{t.legal.copyright}</p>
        <p className="footer-links">
          <a href={feedbackLink(pathname)}>{t.feedback.footer}</a>
          <a href={LICENSE_URL} rel="noreferrer">
            {t.legal.license}
          </a>
          <a href={SOURCE_URL} rel="noreferrer">
            {t.legal.source}
          </a>
        </p>
        <p>{t.legal.version(APP_COMMIT)}</p>
      </footer>
    </div>
  );
}
