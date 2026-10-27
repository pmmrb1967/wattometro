// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": the named appliances over the last whole days (Phase 8.4), with
 * what each cost and a month like these days. Only with a Shelly and at least
 * one named appliance.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLocalDate, lisbonToday } from '../lib/time';
import { formatKwh } from '../lib/units';
import type { RecentAppliances as Recent } from '../nilm/recent';
import { useAppliances } from './appliances-store';
import type { HouseholdEnergy } from './household-energy';
import { loadRecentAppliances } from './recent-appliances';
import { useSession } from './session';

const texts = t.recentAppliances;

type Loaded = { key: string; recent: Recent | null };

export function RecentAppliances({ energy }: { energy: HouseholdEnergy }) {
  const { me } = useSession();
  const meter = energy.houseShelly;
  const [today] = useState(lisbonToday);
  const known = useAppliances(me.householdId);
  const appliances = known.kind === 'ready' ? known.appliances : null;
  const tariffs = energy.tariffs;
  const waiting = tariffs === null && !energy.tariffsFailed;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = JSON.stringify([meter, today, energy.shellyFrom, tariffs, appliances]);

  useEffect(() => {
    if (!meter || !appliances || appliances.length === 0 || waiting) return;
    let current = true;
    void loadRecentAppliances({
      householdId: me.householdId,
      meter,
      today,
      shellyFrom: energy.shellyFrom,
      tariffs,
      appliances,
    }).then((recent) => {
      if (current) setLoaded({ key, recent });
    });
    return () => {
      current = false;
    };
  }, [key, me.householdId, meter, today, energy.shellyFrom, tariffs, appliances, waiting]);

  if (!meter || !appliances || appliances.length === 0) return null;
  const recent = loaded?.key === key ? loaded.recent : undefined;
  const first = recent?.days[0];
  const last = recent?.days.at(-1);

  return (
    <section className="card form" id="aparelhos">
      <h2>{texts.title}</h2>
      {recent === undefined && <p className="hint">{texts.working}</p>}
      {recent === null && <p className="error">{texts.error}</p>}
      {recent && (!first || !last) && <p>{texts.noDays}</p>}
      {recent && first && last && (
        <>
          <p className="lead">
            {texts.intro(recent.days.length, formatLocalDate(first), formatLocalDate(last))}
          </p>
          {recent.appliances.length === 0 ? (
            <p>{texts.none}</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{texts.appliance}</th>
                    <th>{texts.uses}</th>
                    <th>{texts.energy}</th>
                    <th>{texts.cost}</th>
                    <th>{texts.perMonth}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.appliances.map((item) => (
                    <tr key={item.label}>
                      <td>
                        <strong>{item.label}</strong>
                      </td>
                      <td>{item.uses}</td>
                      <td>{formatKwh(item.energyWh, 2)}</td>
                      <td>{item.costCents === null ? '—' : formatCents(item.costCents)}</td>
                      <td>{item.perMonthCents === null ? '—' : formatCents(item.perMonthCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ul className="hint caveats">
            <li>{texts.how}</li>
            <li>{texts.onlyNamed}</li>
            {recent.appliances.some((item) => item.costCents === null) && (
              <li>
                <Link to="/tarifarios">{t.dayEvents.noTariff}</Link>
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
