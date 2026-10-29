// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Instalar um Shelly" (Settings → Devices): a sheet to print for the
 * electrician and, once the script sends, a check of each Shelly's last
 * minute (src/domain/install-check.ts). Sources in docs/shelly.md.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { checkInstall, type InstallCheck } from '../domain/install-check';
import { VOLTAGE_LIMITS } from '../domain/voltage';
import { t } from '../i18n/pt-PT';
import { formatLisbonTime } from '../lib/time';
import { formatPower, formatVolts } from '../lib/units';
import { fetchNow, type Meter, type Now } from './api';
import { INSTRUCTIONS_URL } from './Devices';
import { useSession } from './session';

const texts = t.shellySetup;
const REFRESH_MS = 30_000;

function message(check: InstallCheck, meter: Meter): string {
  const latest = meter.latest;
  const power = latest ? formatPower(latest.powerAvgW) : '';
  const volts = latest ? formatVolts(latest.voltageAvgDv) : '';
  switch (check.finding) {
    case 'never':
    case 'stale':
      return texts.findings[check.finding];
    case 'low':
    case 'high':
      return texts.findings[check.finding](volts);
    case 'reversed':
    case 'idle':
      return texts.findings[check.finding](power);
    default:
      return texts.checks[check.id].ok;
  }
}

function MeterCheck({ meter, now }: { meter: Meter; now: number }) {
  const checks = checkInstall(
    { now, lastSeenAt: meter.lastSeenAt, latest: meter.latest },
    VOLTAGE_LIMITS,
  );
  return (
    <li className="install-meter">
      <h3>{texts.meter(meter.deviceName, meter.channel)}</h3>
      {meter.latest && (
        <p className="hint">
          {texts.lastMinute(
            formatPower(meter.latest.powerAvgW),
            formatVolts(meter.latest.voltageAvgDv),
            formatLisbonTime(meter.latest.ts),
          )}
        </p>
      )}
      <ul className="install-checks">
        {checks.map((check) => (
          <li key={check.id} className={`install-check is-${check.state}`}>
            <strong>{texts.state[check.state]}</strong> {message(check, meter)}
          </li>
        ))}
      </ul>
    </li>
  );
}

function useNow(): Now | null | 'unavailable' {
  const { signOut } = useSession();
  const [now, setNow] = useState<Now | null | 'unavailable'>(null);
  useEffect(() => {
    let active = true;
    const load = () =>
      void fetchNow().then((outcome) => {
        if (!active) return;
        if (outcome.ok) setNow(outcome.now);
        else if (outcome.reason === 'unauthenticated') signOut();
        else setNow((previous) => (previous === null ? 'unavailable' : previous));
      });
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [signOut]);
  return now;
}

export function ShellySetup() {
  const now = useNow();
  return (
    <>
      <Link to="/definicoes#dados" className="back-link no-print">
        ← {texts.back}
      </Link>
      <h1>{texts.title}</h1>
      <p className="hint no-print">{texts.intro}</p>

      <section className="card">
        <h2>{texts.sheetTitle}</h2>
        <dl className="install-sheet">
          {texts.sheet.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>{texts.afterTitle}</h3>
        <p>
          {texts.after}{' '}
          <a href={INSTRUCTIONS_URL} target="_blank" rel="noreferrer">
            {texts.instructions}
          </a>
        </p>
        <button type="button" className="secondary no-print" onClick={() => window.print()}>
          {texts.print}
        </button>
      </section>

      <section className="card no-print">
        <h2>{texts.checkTitle}</h2>
        <p className="hint">{texts.checkIntro}</p>
        {now === null && <p className="hint">{t.loading}</p>}
        {now === 'unavailable' && <p className="error">{t.errors.unavailable}</p>}
        {now !== null && now !== 'unavailable' && (
          <>
            {now.meters.length === 0 ? (
              <p>
                <Link to="/definicoes#dados">{texts.noDevices}</Link>
              </p>
            ) : (
              <ul className="install-meters">
                {now.meters.map((meter) => (
                  <MeterCheck
                    key={`${meter.deviceId}:${meter.channel}`}
                    meter={meter}
                    now={now.now}
                  />
                ))}
              </ul>
            )}
          </>
        )}
        <h3>{texts.testTitle}</h3>
        <p>{texts.test}</p>
        <p className="hint">{texts.later}</p>
      </section>
    </>
  );
}
