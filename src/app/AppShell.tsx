// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { t } from '../i18n/pt-PT';
import { fetchHealth, fetchMe, logout, type Me } from './api';
import { APP_COMMIT, LICENSE_URL, SOURCE_URL } from './build-info';
import { feedbackLink } from './feedback';
import { InstallSection } from '../components/InstallSection';
import { enterDemo, exitDemo, isDemo } from '../demo/mode';
import { DEMO_ME } from '../demo/server';
import { Login } from './Login';
import { NavIcon, type SectionId } from './NavIcon';
import type { SessionContext } from './session';

type ServerState = 'checking' | 'ok' | 'unavailable';

/** Checked again while the page is visible, so the status in the top bar stays true. */
const HEALTH_EVERY_MS = 120_000;

function useServerState(): ServerState {
  const [state, setState] = useState<ServerState>('checking');
  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      fetchHealth(controller.signal)
        .then((health) => setState(health.status === 'ok' ? 'ok' : 'unavailable'))
        .catch(() => {
          if (!controller.signal.aborted) setState('unavailable');
        });
    };
    check();
    const timer = window.setInterval(check, HEALTH_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return state;
}

const SECTIONS: { id: SectionId; path: string }[] = [
  { id: 'home', path: '/' },
  { id: 'power', path: '/potencia' },
  { id: 'quality', path: '/qualidade' },
  { id: 'settings', path: '/definicoes' },
];

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
  const signOut = useCallback(() => {
    if (isDemo()) {
      exitDemo();
      setMe(null);
      return;
    }
    void logout().then(() => setMe(null));
  }, [setMe]);
  const startDemo = () => {
    enterDemo();
    setMe(DEMO_ME);
  };
  const context: SessionContext | null = me ? { me, update: setMe, signOut } : null;

  return (
    <div className={context ? 'page has-tabbar' : 'page'}>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>{t.appName}</span>
        </NavLink>
        {/* Phones: a tab bar fixed at the bottom; wider screens: links in this bar. */}
        {context && (
          <nav className="nav" aria-label={t.appName}>
            {SECTIONS.map((section) => (
              <NavLink key={section.id} to={section.path} end className="nav-item">
                <NavIcon section={section.id} />
                <span>{t.nav[section.id]}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <p className={`server server-${server}`} role="status" title={t.server[server]}>
          <span className="dot" aria-hidden="true" />
          <span className="server-label">{t.server[server]}</span>
        </p>
        {context && (
          <div className="account">
            <span className="account-email">{context.me.email}</span>
            <button
              type="button"
              className="signout"
              onClick={signOut}
              aria-label={isDemo() ? t.demo.exit : t.signOutLabel}
              title={isDemo() ? t.demo.exit : t.signOutLabel}
            >
              {t.signOut}
            </button>
          </div>
        )}
      </header>
      {server === 'unavailable' && (
        <p className="server-banner" role="alert">
          {t.server.banner}
        </p>
      )}

      {context && isDemo() && (
        <div className="demo-banner" role="status">
          <span>{t.demo.banner}</span>
          <button type="button" className="signout" onClick={signOut}>
            {t.demo.exit}
          </button>
        </div>
      )}

      <main className="content">
        {me === undefined && <p className="hint">{t.loading}</p>}
        {me === null && (
          <>
            <p className="tagline">{t.tagline}</p>
            <Login onSignedIn={setMe} />
            <section className="card">
              <h2>{t.demo.title}</h2>
              <p className="hint">{t.demo.intro}</p>
              <button type="button" className="secondary" onClick={startDemo}>
                {t.demo.enter}
              </button>
            </section>
            <InstallSection />
          </>
        )}
        {context && <Outlet context={context} />}
      </main>

      <footer className="footer">
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
