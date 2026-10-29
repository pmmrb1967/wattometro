// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tarifários → "Carro elétrico": what charging at home would cost with this
 * house's real year, at night or at any hour, and the cheapest offer with the
 * car (src/domain/electric-car.ts). The figures stay on the screen.
 */
import { useMemo, useState } from 'react';
import type { AnnualUsage } from '../domain/compare';
import { carCost } from '../domain/electric-car';
import type { Offer } from '../domain/erse';
import type { TariffInput } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import { lisbonToday } from '../lib/time';
import { formatKva, formatKwh, parsePtTenths } from '../lib/units';
import { optionLabel } from './offer-label';

const texts = t.tariffs.car;

export function CarCharging({
  usage,
  tariff,
  offers,
}: {
  usage: AnnualUsage;
  tariff: TariffInput;
  offers: readonly Offer[];
}) {
  const [km, setKm] = useState('');
  const [consumption, setConsumption] = useState('');
  const [charger, setCharger] = useState('');

  const kmPerYear = /^\s*\d{1,6}\s*$/.test(km) ? Number(km) : null;
  const tenths = consumption.trim() ? parsePtTenths(consumption) : null;
  const chargerTenths = charger.trim() ? parsePtTenths(charger) : null;
  const ready = kmPerYear !== null && kmPerYear > 0 && tenths !== null && tenths > 0;

  const cost = useMemo(
    () =>
      ready
        ? carCost(usage, tariff, { kmPerYear, tenthsKwhPer100Km: tenths }, offers, lisbonToday())
        : null,
    [ready, usage, tariff, kmPerYear, tenths, offers],
  );

  const per100 = (cents: number) =>
    formatCents(kmPerYear ? Math.round((cents * 100) / kmPerYear) : 0);
  const best = cost?.best;
  const saving = best && cost ? cost.currentWithCarCents - best.annualCents : 0;
  // Average hours a night: the year's energy over 365 nights, at the charger's power.
  const chargerW = chargerTenths !== null && chargerTenths > 0 ? chargerTenths * 100 : null;
  const hours =
    cost && chargerW !== null ? Math.round((cost.carWh * 10) / 365 / chargerW) / 10 : null;

  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <div className="car-inputs">
        <label>
          {texts.km}
          <input
            inputMode="numeric"
            autoComplete="off"
            value={km}
            onChange={(event) => setKm(event.target.value)}
            placeholder="12000"
          />
        </label>
        <label>
          {texts.consumption}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={consumption}
            onChange={(event) => setConsumption(event.target.value)}
            aria-invalid={consumption.trim() !== '' && tenths === null}
          />
          <span className={consumption.trim() !== '' && tenths === null ? 'error' : 'hint'}>
            {consumption.trim() !== '' && tenths === null ? texts.invalid : texts.consumptionHint}
          </span>
        </label>
        <label>
          {texts.charger}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={charger}
            onChange={(event) => setCharger(event.target.value)}
            aria-invalid={charger.trim() !== '' && chargerTenths === null}
          />
          <span className={charger.trim() !== '' && chargerTenths === null ? 'error' : 'hint'}>
            {charger.trim() !== '' && chargerTenths === null ? texts.invalid : texts.chargerHint}
          </span>
        </label>
      </div>

      {cost && (
        <div aria-live="polite">
          <p>
            {texts.perYear(
              formatKwh(cost.carWh, 0),
              Math.round((cost.carWh * 100) / Math.max(usage.totalWh, 1)),
            )}
          </p>
          <p>
            {tariff.option === 'simple'
              ? texts.sameAnyHour(formatCents(cost.emptyCents), per100(cost.emptyCents))
              : texts.emptyVsAnytime(
                  formatCents(cost.emptyCents),
                  per100(cost.emptyCents),
                  formatCents(cost.anytimeCents),
                )}
          </p>
          <p className={saving > 0 ? 'verdict success' : 'verdict'}>
            {best && saving > 0
              ? texts.best(
                  best.offer.name,
                  best.offer.supplier,
                  optionLabel(best),
                  formatCents(best.annualCents),
                  formatCents(saving),
                )
              : texts.keep}
          </p>
          {hours !== null && chargerTenths !== null && (
            <p>
              {texts.hours(
                hours.toLocaleString('pt-PT'),
                (chargerTenths / 10).toLocaleString('pt-PT'),
              )}
            </p>
          )}
          {chargerW !== null && chargerW >= tariff.powerVa && (
            <p className="notice-box">{texts.overPower(formatKva(tariff.powerVa))}</p>
          )}
          <p className="hint">{texts.losses}</p>
        </div>
      )}
    </section>
  );
}
