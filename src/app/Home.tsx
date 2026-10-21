// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { t } from '../i18n/pt-PT';
import { fetchHealth, fetchMe, logout, type Me } from './api';
import { APP_COMMIT, SOURCE_URL } from './build-info';
import { Login } from './Login';

type ServerState = 'checking' | 'ok' | 'unavailable';
/** undefined while the session is being checked. */
type Session = Me | null | undefined;

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

function useSession(): [Session, (session: Me | null) => void] {
  const [session, setSession] = useState<Session>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal)
      .then(setSession)
      .catch(() => {
        if (!controller.signal.aborted) setSession(null);
      });
    return () => controller.abort();
  }, []);
  return [session, setSession];
}

function Overview({ me, onSignedOut }: { me: Me; onSignedOut: () => void }) {
  return (
    <>
      <p className="account">
        {t.home.signedInAs(me.email)} ·{' '}
        <button type="button" className="link" onClick={() => void logout().then(onSignedOut)}>
          {t.home.logout}
        </button>
      </p>
      <p className="badge">{t.home.status}</p>
      <p>{t.home.intro}</p>

      <h2>{t.home.comingTitle}</h2>
      <ul className="coming">
        {t.home.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

export function Home() {
  const server = useServerState();
  const [session, setSession] = useSession();
  return (
    <div className="page">
      <main className="home">
        <header className="brand">
          <img src="/icon.svg" alt="" width={72} height={72} />
          <div>
            <h1>{t.appName}</h1>
            <p className="tagline">{t.tagline}</p>
          </div>
        </header>

        {session === undefined && <p className="hint">{t.loading}</p>}
        {session === null && <Login onSignedIn={setSession} />}
        {session && <Overview me={session} onSignedOut={() => setSession(null)} />}

        <p className={`server server-${server}`} role="status">
          <span className="dot" aria-hidden="true" />
          {t.server[server]}
        </p>
      </main>

      <footer className="footer">
        {t.footer.license} <a href={SOURCE_URL}>{t.footer.source}</a> ·{' '}
        {t.footer.version(APP_COMMIT)}
      </footer>
    </div>
  );
}
