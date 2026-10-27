// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": the named appliances over the last whole days (Phase 8.4), with
 * what each cost and a month like these days. Only with a Shelly and at least
 * one named appliance.
 */
import { Link } from 'react-router';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';
import type { HouseholdEnergy } from './household-energy';
import { useRecentAppliances } from './use-recent-appliances';

const texts = t.recentAppliances;

export function RecentAppliances({ energy }: { energy: HouseholdEnergy }) {
  const { active, recent } = useRecentAppliances(energy);
  if (!active) return null;
  const first = recent?.days[0];
  const last = recent?.days.at(-1);
  // A bi- or tri-hourly tariff: the machines could run in the empty period.
  const simple = energy.tariff?.option === 'simple';
  const shifts =
    !simple &&
    (recent?.appliances.some((item) => item.shiftable && item.savingCents !== null) ?? false);

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
                    {shifts && <th>{texts.inEmpty}</th>}
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
                      {shifts && (
                        <td className={item.perMonthSavingCents ? 'success' : undefined}>
                          {item.shiftable && item.perMonthSavingCents !== null
                            ? texts.savingPerMonth(formatCents(item.perMonthSavingCents))
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <HowItWorks>
            <ul className="hint caveats">
              <li>{texts.how}</li>
              {shifts && <li>{texts.shiftNote}</li>}
              {simple && recent.appliances.some((item) => item.shiftable) && (
                <li>
                  {texts.simpleNote} <Link to="/tarifarios">{texts.toTariffs}</Link>
                </li>
              )}
              <li>{texts.onlyNamed}</li>
              {recent.appliances.some((item) => item.costCents === null) && (
                <li>
                  <Link to="/tarifarios">{t.dayEvents.noTariff}</Link>
                </li>
              )}
            </ul>
          </HowItWorks>
        </>
      )}
    </section>
  );
}
