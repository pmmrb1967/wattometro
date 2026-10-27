// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { t } from '../i18n/pt-PT';
import { formatLisbonTime } from '../lib/time';
import { fetchHealth, fetchMe, logout, type Me } from './api';
import { APP_COMMIT, LICENSE_URL, SOURCE_URL } from './build-info';
import { feedbackLink } from './feedback';
import { InstallSection } from '../components/InstallSection';
import { enterDemo, exitDemo, isDemo } from '../demo/mode';
import { DEMO_ME } from '../demo/server';
import { Login } from './Login';
import { clearWeatherCache } from '../weather/weather';
import { clearEnergyCache } from './energy-cache';
import { clearSecondsCache } from './seconds-cache';
import { NavIcon, type SectionId } from './NavIcon';
import type { SessionContext } from './session';
import { useHashScroll } from './use-hash-scroll';

type ServerState = 'checking' | 'ok' | 'unavailable' | 'limit';

/** Per-device choice: side menu reduced to its icons (wide screens only). As in Faturómetro. */
const NAV_COLLAPSED_KEY = 'wattometro.nav.collapsed';

function savedCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Checked again while the page is visible, so the status in the top bar stays true. */
const HEALTH_EVERY_MS = 120_000;

/** The server's state, and when D1's daily limit resets if that is what stops it. */
function useServerState(): [ServerState, number | null] {
  const [state, setState] = useState<ServerState>('checking');
  const [resetsAt, setResetsAt] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      fetchHealth(controller.signal)
        .then((health) => {
          setState(health.status === 'ok' ? 'ok' : health.limit ? 'limit' : 'unavailable');
          setResetsAt(health.limit?.resetsAt ?? null);
        })
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
  return [state, resetsAt];
}

const SECTIONS: { id: SectionId; path: string }[] = [
  { id: 'home', path: '/' },
  { id: 'consumption', path: '/consumo' },
  { id: 'power', path: '/potencia' },
  { id: 'tariffs', path: '/tarifarios' },
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

function pageClass(signedIn: boolean, collapsed: boolean): string {
  if (!signedIn) return 'page';
  return collapsed ? 'page has-nav is-nav-collapsed' : 'page has-nav';
}

/** Brand, navigation, the login gate and the footer around every page. */
export function AppShell() {
  const [server, resetsAt] = useServerState();
  const { pathname } = useLocation();
  useHashScroll();
  const [me, setMe] = useMe();

  // Stable, so pages can depend on it in effects.
  const signOut = useCallback(() => {
    // The consumption and the weather (it reveals the locality) kept in this browser go with the session.
    void clearEnergyCache();
    void clearSecondsCache();
    void clearWeatherCache();
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
  const [collapsed, setCollapsed] = useState(savedCollapsed);
  const toggleNav = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Not remembered on this device; the choice still applies now.
    }
  };
  const context: SessionContext | null = me ? { me, update: setMe, signOut } : null;

  return (
    <div className={pageClass(context !== null, collapsed)}>
      <header className="topbar">
        <NavLink to="/" className="brand">
          <img src="/icon.svg" alt="" width={36} height={36} />
          <span>{t.appName}</span>
        </NavLink>
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
      {server === 'limit' && (
        <p className="server-banner" role="alert">
          {t.server.limitBanner(resetsAt === null ? null : formatLisbonTime(resetsAt))}
        </p>
      )}

      {context && isDemo() && (
        <div className="demo-banner" role="status">
          <span>{t.demo.banner}</span>
          <button type="button" className="demo-exit" onClick={signOut}>
            {t.demo.exit}
          </button>
        </div>
      )}

      <div className="body">
        {/* Phones: a tab bar fixed at the bottom; wider screens: a menu at the side. */}
        {context && (
          <nav className="nav" aria-label={t.appName}>
            <button
              type="button"
              className="nav-toggle"
              onClick={toggleNav}
              aria-expanded={!collapsed}
              {...(collapsed ? { title: t.navToggle.expand } : {})}
            >
              <svg
                className="nav-icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
              <span>{collapsed ? t.navToggle.expand : t.navToggle.collapse}</span>
            </button>
            {SECTIONS.map((section) => (
              <NavLink
                key={section.id}
                to={section.path}
                // "/consumo" stays highlighted on "/consumo/relatorio"; "/" only on itself.
                end={section.path === '/'}
                className="nav-item"
                {...(collapsed ? { title: t.nav[section.id] } : {})}
              >
                <NavIcon section={section.id} />
                <span>{t.nav[section.id]}</span>
              </NavLink>
            ))}
          </nav>
        )}
        <div className="main">
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
      </div>
    </div>
  );
}
