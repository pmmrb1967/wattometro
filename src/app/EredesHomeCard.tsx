// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Home without a Shelly: the last day imported from E-Redes (energy and its
 * cost), how to import newer days and what a Shelly would add; with nothing
 * at all, the two ways to start.
 */
import { useMemo } from 'react';
import { Link } from 'react-router';
import { electricityCost, energyByPeriod } from '../domain/electricity-cost';
import { expectedQuarters } from '../domain/eredes-coverage';
import { tariffOn } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { formatLocalDate, lisbonDate } from '../lib/time';
import { formatKwh } from '../lib/units';
import type { HouseholdEnergy } from './household-energy';

const texts = t.home.eredes;

export function EredesHomeCard({ energy }: { energy: HouseholdEnergy }) {
  const quarters = energy.meter === 'eredes' ? energy.quarters : null;
  const last = useMemo(() => {
    const final = quarters?.at(-1);
    if (!final) return null;
    const day = lisbonDate(final.ts);
    const ofDay = quarters!.filter((quarter) => lisbonDate(quarter.ts) === day);
    return { day, quarters: ofDay, energyWh: ofDay.reduce((sum, q) => sum + q.energyWh, 0) };
  }, [quarters]);

  if (energy.error) return <p className="error">{energy.error}</p>;
  // Loading: the card waits rather than offer to start over.
  if (energy.meters === null || (energy.meter === 'eredes' && quarters === null)) {
    return <section className="card hint">{t.loading}</section>;
  }

  if (!last) {
    return (
      <section className="card">
        <p>{texts.empty}</p>
        <ul className="eredes-start">
          <li>
            <Link to="/definicoes#dados">{texts.importFile}</Link>
          </li>
          <li>
            <Link to="/definicoes#dados">{texts.orShelly}</Link>
          </li>
        </ul>
      </section>
    );
  }

  const tariff = energy.tariffs ? tariffOn(energy.tariffs, last.day) : null;
  const cost = tariff
    ? electricityCost(energyByPeriod(last.quarters, tariff), 1, tariff).totalCents
    : null;
  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <span className="reading-label">{texts.lastDay}</span>
      <p className="eredes-day">
        <span className="reading-value">{formatKwh(last.energyWh, 2)}</span>{' '}
        <span className="hint">{texts.on(formatLocalDate(last.day))}</span>
      </p>
      {cost !== null && <p>{texts.cost(formatCents(cost))}</p>}
      {last.quarters.length < expectedQuarters(last.day) && (
        <p className="hint">{texts.partial(last.quarters.length)}</p>
      )}
      <p>
        <Link to="/definicoes#dados">{texts.importNewer}</Link>
      </p>
      <p className="hint">
        {texts.shellyAdds} <Link to="/definicoes#dados">{texts.addShelly}</Link>
      </p>
    </section>
  );
}
