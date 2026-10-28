// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Definições › Servidor", for administrators only (ADMIN_EMAILS, docs/admin.md):
 * D1's daily rows read and written against the free plan, its size, the Cron,
 * the Shelly's minutes today, the accounts and the visits per page. Totals only.
 */
import { useEffect, useState } from 'react';
import { t } from '../i18n/pt-PT';
import { formatDuration } from '../lib/time';
import { fetchAdminStats, type AdminStats } from './api';
import { useSession } from './session';

const texts = t.settings.admin;
const NUMBER = new Intl.NumberFormat('pt-PT');
const MB = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
/** Later than this the Cron is late (it runs every 5 minutes). */
const CRON_LATE_SECONDS = 20 * 60;

const share = (used: number, limit: number) => (limit > 0 ? MB.format((used * 100) / limit) : '0');
const ofLimit = (used: number, limit: number) =>
  texts.ofLimit(NUMBER.format(used), NUMBER.format(limit), share(used, limit));
const megabytes = (bytes: number) => `${MB.format(bytes / 1_000_000)} MB`;
const ago = (now: number, at: number) => formatDuration(Math.max(now - at, 0));

function Panel({ stats }: { stats: AdminStats }) {
  const { now, limits, days, cron } = stats;
  const today = days.at(-1);
  const utcToday = new Date(now * 1000).toISOString().slice(0, 10);
  const todayUsage = today?.day === utcToday ? today : { rowsRead: 0, rowsWritten: 0 };
  const late = cron.rolledUpUntil !== null && now - cron.rolledUpUntil > CRON_LATE_SECONDS;
  return (
    <>
      <dl className="stats">
        <div>
          <dt>{texts.rowsRead}</dt>
          <dd>{ofLimit(todayUsage.rowsRead, limits.rowsRead)}</dd>
        </div>
        <div>
          <dt>{texts.rowsWritten}</dt>
          <dd>{ofLimit(todayUsage.rowsWritten, limits.rowsWritten)}</dd>
        </div>
        <div>
          <dt>{texts.database}</dt>
          <dd>
            {stats.databaseBytes === null
              ? texts.databaseUnknown
              : texts.ofLimit(
                  megabytes(stats.databaseBytes),
                  megabytes(limits.databaseBytes),
                  share(stats.databaseBytes, limits.databaseBytes),
                )}
          </dd>
        </div>
      </dl>
      <p className="hint">{texts.resets}</p>

      <h3>{texts.lastDays}</h3>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{texts.columns.day}</th>
              <th>{texts.columns.read}</th>
              <th>{texts.columns.written}</th>
            </tr>
          </thead>
          <tbody>
            {[...days].reverse().map((day) => (
              <tr key={day.day}>
                <td>{day.day}</td>
                <td>{ofLimit(day.rowsRead, limits.rowsRead)}</td>
                <td>{ofLimit(day.rowsWritten, limits.rowsWritten)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{texts.cron}</h3>
      <p className={late ? 'error' : undefined}>
        {cron.rolledUpUntil === null
          ? texts.rolledUpNever
          : texts.rolledUp(ago(now, cron.rolledUpUntil))}{' '}
        {late && texts.late}
      </p>
      <p className="hint">
        {cron.purgedAt === null ? texts.purgedNever : texts.purged(ago(now, cron.purgedAt))}
      </p>

      <h3>{texts.shelly}</h3>
      {stats.devices.length === 0 && <p className="hint">{texts.noDevices}</p>}
      {stats.devices.map((device, index) => (
        <div key={index}>
          <p>
            {texts.shellyLine(
              index + 1,
              device.model ?? texts.unknown,
              device.scriptVersion ?? texts.unknown,
            )}
          </p>
          <p className="hint">
            {device.lastSeenAt === null
              ? texts.neverSeen
              : texts.lastSeen(ago(now, device.lastSeenAt))}{' '}
            {device.expectedToday > 0 &&
              texts.minutesToday(
                device.minutesToday,
                device.expectedToday,
                Math.min(100, Math.round((device.minutesToday * 100) / device.expectedToday)),
              )}
          </p>
        </div>
      ))}

      <h3>{texts.accounts}</h3>
      <p>
        {texts.accountsLine(
          stats.accounts.users,
          stats.accounts.households,
          stats.accounts.pushDevices,
        )}
      </p>

      <h3>{texts.visits(stats.visits.days)}</h3>
      {stats.visits.pages.length === 0 ? (
        <p className="hint">{texts.noVisits}</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{texts.visitColumns.page}</th>
                <th>{texts.visitColumns.today}</th>
                <th>{texts.visitColumns.total}</th>
              </tr>
            </thead>
            <tbody>
              {stats.visits.pages.map((visit) => (
                <tr key={visit.page}>
                  <td>{texts.pages[visit.page] ?? visit.page}</td>
                  <td>{NUMBER.format(visit.today)}</td>
                  <td>{NUMBER.format(visit.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint">{texts.visitsNote}</p>
    </>
  );
}

export function AdminSection() {
  const { signOut } = useSession();
  const [stats, setStats] = useState<AdminStats | null | 'failed'>(null);

  useEffect(() => {
    let active = true;
    void fetchAdminStats().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setStats(outcome.stats);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStats('failed');
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {stats === null && <p className="hint">{texts.loading}</p>}
      {stats === 'failed' && <p className="error">{texts.failed}</p>}
      {stats && stats !== 'failed' && <Panel stats={stats} />}
    </section>
  );
}
