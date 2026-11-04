// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Onde vai o consumo (estimativa)", in Equipamentos, for a house measured
 * only by the E-Redes: each equipment's estimate (src/domain/equipment-estimate.ts)
 * set against the last 30 days measured, and the fridges' labels against the
 * baseload. A house with a Shelly sees what each appliance measured instead.
 */
import { useMemo } from 'react';
import { nightlyBaseload, recentBaseload } from '../domain/baseload';
import type { Equipment } from '../domain/equipment';
import { consumptionEstimate, labelAverageW, recentMeasured } from '../domain/equipment-estimate';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatKwh, formatPower } from '../lib/units';
import { useHouseholdEnergy } from './household-energy';

const texts = t.equipmentEstimate.card;

export function ConsumptionEstimateCard({ items }: { items: readonly Equipment[] }) {
  const energy = useHouseholdEnergy();
  const { quarters, tariff, houseShelly } = energy;
  const measured = useMemo(
    () => (quarters ? recentMeasured(quarters, tariff ?? null) : null),
    [quarters, tariff],
  );
  const base = useMemo(
    () => (quarters ? recentBaseload(nightlyBaseload(quarters)) : null),
    [quarters],
  );
  if (houseShelly !== null || quarters === null || tariff === undefined) return null;

  if (measured === null) {
    return (
      <section className="card">
        <h2>{texts.title}</h2>
        <p className="hint">{texts.noData}</p>
      </section>
    );
  }
  const result = consumptionEstimate(items, measured);
  const fridgeW = items
    .flatMap((item) => (item.estimate ? [labelAverageW(item.estimate)] : []))
    .filter((watts): watts is number => watts !== null)
    .reduce((sum, watts) => sum + watts, 0);

  return (
    <section className="card consumption-estimate">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro(measured.days, formatKwh(measured.measuredWh, 0))}</p>
      {result.rows.length === 0 ? (
        <p>{texts.empty}</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{texts.equipment}</th>
                  <th scope="col" className="number">
                    {texts.energy}
                  </th>
                  {measured.energyCents !== null && (
                    <th scope="col" className="number">
                      {texts.cost}
                    </th>
                  )}
                  <th scope="col" className="number">
                    {texts.share}
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="number">{formatKwh(row.wh)}</td>
                    {measured.energyCents !== null && (
                      <td className="number">{row.cents === null ? '' : formatCents(row.cents)}</td>
                    )}
                    <td className="number">{texts.pct(row.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {result.restWh >= 0
              ? texts.explained(
                  result.explainedPct,
                  formatKwh(measured.measuredWh, 0),
                  formatKwh(result.restWh, 0),
                )
              : texts.overshoot(formatKwh(-result.restWh, 0))}
          </p>
        </>
      )}
      {fridgeW > 0 && base !== null && (
        <p>{texts.fridgeAgainstBase(formatPower(fridgeW), formatPower(base.watts))}</p>
      )}
      {result.missing.length > 0 && (
        <p className="hint">{texts.missing(result.missing.join(', '))}</p>
      )}
      <p className="hint">{texts.caveat}</p>
    </section>
  );
}
