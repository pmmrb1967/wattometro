// SPDX-License-Identifier: AGPL-3.0-or-later
/** "Agora": the latest minute and today so far, per Shelly channel. Refreshes every minute. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { electricityCost, energyByPeriod } from '../domain/electricity-cost';
import { OPTION_PERIODS, tariffOn, type Tariff } from '../domain/tariff';
import { InfoTip } from '../components/InfoTip';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLisbonTime, lisbonDate } from '../lib/time';
import { formatKwh, formatPower, formatVolts } from '../lib/units';
import { fetchNow, type Meter, type Now } from './api';
import { AnomalyCard } from './Anomalies';
import { BillForecastCard } from './BillForecast';
import { HomeActions } from './HomeActions';
import { useHouseholdEnergy } from './household-energy';
import { useSession } from './session';

const REFRESH_MS = 60_000;
/** The script sends every minute: three without news means something is wrong. */
const STALE_SECONDS = 180;
const WARN_DATABASE_SHARE = 0.8;
/** Share of D1's daily rows read from which Home warns (a bad query uses it up in hours). */
const WARN_ROWS_READ_SHARE = 0.5;

/** Today's cost so far: energy by period, the day's fixed term and taxes, with VAT. */
function TodayCost({ meter, tariff }: { meter: Meter; tariff: Tariff | null }) {
  if (!tariff) {
    return (
      <dd className="hint">
        <Link to="/definicoes#tarifario">{t.now.noTariff}</Link>
      </dd>
    );
  }
  const energy = energyByPeriod(meter.today.quarters, tariff);
  const cost = electricityCost(energy, 1, tariff);
  const periods = OPTION_PERIODS[tariff.option];
  return (
    <>
      <dd className="has-info">
        {formatCents(cost.totalCents)}
        <InfoTip text={t.now.costNote} inline />
      </dd>
      <dd className="hint">
        <ul className="cost-parts">
          {(
            [
              [t.now.costParts.energy, cost.energyCents],
              [t.now.costParts.power, cost.powerCents],
              [t.now.costParts.taxes, cost.taxesCents],
            ] as const
          ).map(([label, cents]) => (
            <li key={label}>
              <span>{label}:</span>
              <span>{formatCents(cents)}</span>
            </li>
          ))}
        </ul>
      </dd>
      {periods.length > 1 && (
        <dd className="hint">
          {periods
            .map(
              (period) => `${t.settings.tariff.periods[period]} ${formatKwh(energy[period] ?? 0)}`,
            )
            .join(' · ')}
        </dd>
      )}
    </>
  );
}

function MeterCard({
  meter,
  now,
  tariff,
  only,
}: {
  meter: Meter;
  now: number;
  /** The household's only meter: its name would repeat the page's title, so only for screen readers. */
  only: boolean;
  /** undefined while loading. */
  tariff: Tariff | null | undefined;
}) {
  const { latest, today } = meter;
  const silentFor = meter.lastSeenAt === null ? null : now - meter.lastSeenAt;
  return (
    <section className="card meter">
      <h2 className={only ? 'visually-hidden' : undefined}>
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
        {tariff !== undefined && (
          <div>
            <dt>{t.now.cost}</dt>
            <TodayCost meter={meter} tariff={tariff} />
          </div>
        )}
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

function RowsReadWarning({ database }: { database: Now['database'] }) {
  if (database.rowsReadToday < database.rowsReadLimit * WARN_ROWS_READ_SHARE) return null;
  return (
    <p className="error" role="alert">
      {t.now.rowsReadNear(Math.floor((database.rowsReadToday * 100) / database.rowsReadLimit))}
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
  const energy = useHouseholdEnergy();
  // Null when they cannot be read (the cost is then hidden); undefined while loading.
  const tariffs = energy.tariffs ?? (energy.tariffsFailed ? null : undefined);

  return (
    <>
      <h1>{me.householdName}</h1>

      <HomeActions energy={energy} />
      <BillForecastCard energy={energy} />

      {now === null && <p className="hint">{t.loading}</p>}
      {now === 'unavailable' && <p className="error">{t.errors.unavailable}</p>}
      {now !== null && now !== 'unavailable' && (
        <>
          <DatabaseWarning database={now.database} />
          <RowsReadWarning database={now.database} />
          {now.meters.length === 0 ? (
            <section className="card">
              <p>{t.now.noDevices}</p>
              <Link to="/definicoes#dados">{t.now.addDevice}</Link>
            </section>
          ) : (
            now.meters.map((meter) => (
              <MeterCard
                key={`${meter.deviceId}:${meter.channel}`}
                meter={meter}
                now={now.now}
                only={now.meters.length === 1}
                tariff={
                  // Not shown when the tariffs could not be read; "set one up" when there is none.
                  tariffs === undefined || tariffs === null
                    ? undefined
                    : tariffOn(tariffs, lisbonDate(now.now))
                }
              />
            ))
          )}
        </>
      )}

      <AnomalyCard energy={energy} />
    </>
  );
}
