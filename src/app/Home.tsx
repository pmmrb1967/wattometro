// SPDX-License-Identifier: AGPL-3.0-or-later
/** "Agora": the latest minute and today so far, per Shelly channel. Refreshes every minute. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SINGLE_PHASE } from '../domain/contracted-power';
import { electricityCost, energyByPeriod } from '../domain/electricity-cost';
import { OPTION_PERIODS, tariffOn, type Tariff } from '../domain/tariff';
import { PowerGauge, TodayEnergy, VoltageRuler } from '../components/Gauges';
import { InfoTip } from '../components/InfoTip';
import { weekdayOf } from '../domain/consumption';
import { typicalSoFar, type TypicalSoFar } from '../domain/typical-day';
import { VOLTAGE_LIMITS } from '../domain/voltage';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLisbonTime, lisbonDate, lisbonDayLength, startOfLisbonDay } from '../lib/time';
import { formatKwh, formatPower, formatVolts } from '../lib/units';
import { fetchNow, type Meter, type Now } from './api';
import { AnomalyCard } from './Anomalies';
import { BillForecastCard } from './BillForecast';
import { ActionValue, HomeActions } from './HomeActions';
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

/**
 * Today's cost and peak as boxes like "Onde podes poupar", in the left column:
 * for the household's only meter (with several, each card keeps its own).
 */
function TodayBoxes({ meter, tariff }: { meter: Meter; tariff: Tariff | null | undefined }) {
  const { today } = meter;
  let cost = null;
  if (tariff) {
    const energy = energyByPeriod(today.quarters, tariff);
    const total = electricityCost(energy, 1, tariff);
    const periods = OPTION_PERIODS[tariff.option];
    const parts = [
      `${t.now.costParts.energy} ${formatCents(total.energyCents)}`,
      `${t.now.costParts.power} ${formatCents(total.powerCents)}`,
      `${t.now.costParts.taxes} ${formatCents(total.taxesCents)}`,
    ];
    cost = (
      <div className="action">
        <span className="action-title has-info">
          {t.now.cost}
          <InfoTip text={t.now.costNote} inline />
        </span>
        <ActionValue value={formatCents(total.totalCents)} />
        <span className="action-hint">
          {parts.join(' · ')}
          {periods.length > 1 &&
            `. ${periods
              .map(
                (period) =>
                  `${t.settings.tariff.periods[period]} ${formatKwh(energy[period] ?? 0)}`,
              )
              .join(' · ')}`}
        </span>
      </div>
    );
  } else if (tariff === null) {
    cost = (
      <Link to="/definicoes#tarifario" className="action">
        <span className="action-title">{t.now.cost}</span>
        <span className="action-hint">{t.now.noTariff}</span>
      </Link>
    );
  }
  return (
    <section className="actions" aria-label={t.now.today}>
      {cost}
      <Link to="/potencia" className="action">
        <span className="action-title">{t.now.peak}</span>
        <ActionValue
          value={today.powerMaxW === null ? t.now.nothing : formatPower(today.powerMaxW)}
        />
        <span className="action-hint">{t.now.peakHint}</span>
      </Link>
    </section>
  );
}

function MeterCard({
  meter,
  now,
  tariff,
  only,
  typical,
}: {
  meter: Meter;
  now: number;
  /** Today so far on a usual day (the house's data); null without enough of it. */
  typical: TypicalSoFar | null;
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
        <div className={tariff ? 'reading with-gauge' : 'reading'}>
          <span className="reading-label has-info">
            {t.now.power}
            {tariff && <InfoTip text={t.gauges.powerInfo(SINGLE_PHASE.k)} inline />}
          </span>
          {tariff && (
            <PowerGauge
              powerW={latest.powerAvgW}
              peakW={today.powerMaxW}
              contractedVa={tariff.powerVa}
              k={SINGLE_PHASE.k}
            />
          )}
          <span className="reading-value">{formatPower(latest.powerAvgW)}</span>
          <span className="hint">{t.now.minuteAt(formatLisbonTime(latest.ts))}</span>
        </div>
      ) : (
        meter.lastSeenAt !== null && <p className="hint">{t.now.noReadings}</p>
      )}

      <div className="today-energy">
        <div className="today-head">
          <span className="reading-label">{t.now.today}</span>
          <span className="today-value">{formatKwh(today.energyWh, 2)}</span>
        </div>
        <TodayEnergy
          energyWh={today.energyWh}
          typicalWh={typical?.energyWh ?? null}
          quarters={today.quarters}
          dayStart={startOfLisbonDay(lisbonDate(now))}
          dayLength={lisbonDayLength(lisbonDate(now))}
        />
        <span className="hint">
          {typical
            ? t.now.vsUsual(
                Math.round(
                  ((today.energyWh - typical.energyWh) * 100) / Math.max(typical.energyWh, 1),
                ),
                typical.days,
                weekdayOf(lisbonDate(now)),
              )
            : t.now.todayMinutes(today.minutes)}
        </span>
      </div>

      <dl className="stats">
        {!only && tariff !== undefined && (
          <div>
            <dt>{t.now.cost}</dt>
            <TodayCost meter={meter} tariff={tariff} />
          </div>
        )}
        {!only && (
          <div>
            <dt>{t.now.peak}</dt>
            <dd>{today.powerMaxW === null ? t.now.nothing : formatPower(today.powerMaxW)}</dd>
            <dd className="hint">{t.now.peakHint}</dd>
          </div>
        )}
        <div className="stats-wide">
          <dt>{t.now.voltage}</dt>
          <dd>{latest ? formatVolts(latest.voltageAvgDv) : t.now.nothing}</dd>
          {latest && (
            <>
              <dd className="ruler-wrap">
                <VoltageRuler
                  avgDv={latest.voltageAvgDv}
                  minDv={latest.voltageMinDv}
                  maxDv={latest.voltageMaxDv}
                  lowDv={VOLTAGE_LIMITS.lowDv}
                  highDv={VOLTAGE_LIMITS.highDv}
                  nominalDv={VOLTAGE_LIMITS.nominalDv}
                />
              </dd>
              <dd className="hint">
                {t.now.voltageRange(
                  formatVolts(latest.voltageMinDv),
                  formatVolts(latest.voltageMaxDv),
                )}
              </dd>
            </>
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
    <p className="notice-box" role="alert">
      {t.now.databaseNear(mb(database.sizeBytes), mb(database.limitBytes))}
    </p>
  );
}

function RowsReadWarning({ database }: { database: Now['database'] }) {
  if (database.rowsReadToday < database.rowsReadLimit * WARN_ROWS_READ_SHARE) return null;
  return (
    <p className="notice-box" role="alert">
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
  const nowTs = now !== null && now !== 'unavailable' ? now.now : null;
  // The house's quarters: a usual day only means something for the house's only meter.
  const typical = useMemo(
    () => (energy.quarters && nowTs !== null ? typicalSoFar(energy.quarters, nowTs) : null),
    [energy.quarters, nowTs],
  );

  // Not shown when the tariffs could not be read; "set one up" when there is none.
  const todayTariff =
    tariffs === undefined || tariffs === null || nowTs === null
      ? undefined
      : tariffOn(tariffs, lisbonDate(nowTs));

  return (
    <>
      <h1>{me.householdName}</h1>

      <div className="home-columns">
        <div className="home-column home-meters">
          {now === null && <p className="hint">{t.loading}</p>}
          {now === 'unavailable' && <p className="error">{t.errors.unavailable}</p>}
          {now !== null && now !== 'unavailable' && (
            <>
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
                    typical={now.meters.length === 1 ? typical : null}
                    tariff={todayTariff}
                  />
                ))
              )}
            </>
          )}

          <AnomalyCard energy={energy} />
        </div>
        <div className="home-column home-boxes">
          {now !== null && now !== 'unavailable' && (
            <>
              <DatabaseWarning database={now.database} />
              <RowsReadWarning database={now.database} />
            </>
          )}
          <HomeActions energy={energy} />
          <BillForecastCard energy={energy} />
          {now !== null && now !== 'unavailable' && now.meters.length === 1 && (
            <TodayBoxes meter={now.meters[0]!} tariff={todayTariff} />
          )}
        </div>
      </div>
    </>
  );
}
