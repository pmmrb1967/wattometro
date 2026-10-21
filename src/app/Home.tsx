// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from 'react';
import { t } from '../i18n/pt-PT';
import { fetchHealth } from './api';
import { APP_COMMIT, SOURCE_URL } from './build-info';

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

export function Home() {
  const server = useServerState();
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

        <p className="badge">{t.home.status}</p>
        <p>{t.home.intro}</p>

        <h2>{t.home.comingTitle}</h2>
        <ul className="coming">
          {t.home.coming.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

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
