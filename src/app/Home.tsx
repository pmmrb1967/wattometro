// SPDX-License-Identifier: AGPL-3.0-or-later
/** "Agora": the latest minute and today so far, per Shelly channel. Refreshes every minute. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { formatLisbonTime } from '../lib/time';
import { formatKwh, formatPower, formatVolts } from '../lib/units';
import { fetchNow, type Meter, type Now } from './api';
import { useSession } from './session';

const REFRESH_MS = 60_000;
/** The script sends every minute: three without news means something is wrong. */
const STALE_SECONDS = 180;
const WARN_DATABASE_SHARE = 0.8;

function MeterCard({ meter, now }: { meter: Meter; now: number }) {
  const { latest, today } = meter;
  const silentFor = meter.lastSeenAt === null ? null : now - meter.lastSeenAt;
  return (
    <section className="card meter">
      <h2>
        {meter.deviceName}
        {meter.channel > 0 && <span className="hint"> · {t.now.channel(meter.channel)}</span>}
      </h2>

      {meter.lastSeenAt === null ? (
        <p className="error">{t.now.neverSeen}</p>
      ) : (
        silentFor !== null &&
        silentFor > STALE_SECONDS && (
          <p className="error">{t.now.stale(Math.floor(silentFor / 60))}</p>
        )
      )}

      {latest ? (
        <div className="reading">
          <span className="reading-label">{t.now.power}</span>
          <span className="reading-value">{formatPower(latest.powerAvgW)}</span>
          <span className="hint">{t.now.minuteAt(formatLisbonTime(latest.ts))}</span>
        </div>
      ) : (
        meter.lastSeenAt !== null && <p className="hint">{t.now.noReadings}</p>
      )}

      <dl className="stats">
        <div>
          <dt>{t.now.today}</dt>
          <dd>{formatKwh(today.energyWh, 2)}</dd>
          <dd className="hint">{t.now.todayMinutes(today.minutes)}</dd>
        </div>
        <div>
          <dt>{t.now.peak}</dt>
          <dd>{today.powerMaxW === null ? t.now.nothing : formatPower(today.powerMaxW)}</dd>
          <dd className="hint">{t.now.peakHint}</dd>
        </div>
        <div>
          <dt>{t.now.voltage}</dt>
          <dd>{latest ? formatVolts(latest.voltageAvgDv) : t.now.nothing}</dd>
          {latest && (
            <dd className="hint">
              {t.now.voltageRange(
                formatVolts(latest.voltageMinDv),
                formatVolts(latest.voltageMaxDv),
              )}
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}

function DatabaseWarning({ database }: { database: Now['database'] }) {
  if (database.sizeBytes === null) return null;
  if (database.sizeBytes < database.limitBytes * WARN_DATABASE_SHARE) return null;
  const mb = (bytes: number) => Math.round(bytes / 1_000_000);
  return (
    <p className="error" role="alert">
      {t.now.databaseNear(mb(database.sizeBytes), mb(database.limitBytes))}
    </p>
  );
}

function useNow(): Now | null | 'unavailable' {
  const { signOut } = useSession();
  const [now, setNow] = useState<Now | null | 'unavailable'>(null);

  const apply = useCallback(
    (outcome: Awaited<ReturnType<typeof fetchNow>>) => {
      if (outcome.ok) setNow(outcome.now);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setNow((previous) => (previous === null ? 'unavailable' : previous));
    },
    [signOut],
  );

  useEffect(() => {
    const load = () => void fetchNow().then(apply);
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [apply]);

  return now;
}

export function Home() {
  const { me } = useSession();
  const now = useNow();

  return (
    <>
      <h1>{me.householdName}</h1>

      {now === null && <p className="hint">{t.loading}</p>}
      {now === 'unavailable' && <p className="error">{t.errors.unavailable}</p>}
      {now !== null && now !== 'unavailable' && (
        <>
          <DatabaseWarning database={now.database} />
          {now.meters.length === 0 ? (
            <section className="card">
              <p>{t.now.noDevices}</p>
              <Link to="/definicoes">{t.now.addDevice}</Link>
            </section>
          ) : (
            now.meters.map((meter) => (
              <MeterCard key={`${meter.deviceId}:${meter.channel}`} meter={meter} now={now.now} />
            ))
          )}
        </>
      )}

      <h2>{t.home.comingTitle}</h2>
      <ul className="coming">
        {t.home.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
