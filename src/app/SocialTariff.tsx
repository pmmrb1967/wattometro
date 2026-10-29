// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tarifários → "Tarifa social": who has the right to it (the answers stay in
 * this screen) and about what it would take off a year of this house's
 * consumption (src/domain/social-tariff.ts).
 */
import { useState } from 'react';
import type { Cost, EnergyByPeriod } from '../domain/electricity-cost';
import { YEAR_DAYS } from '../domain/compare';
import {
  BENEFITS,
  checkSocialTariff,
  hasSocialTariff,
  MAX_POWER_VA,
  SOCIAL_TARIFF_SOURCES,
  socialTariffSaving,
  type Benefit,
} from '../domain/social-tariff';
import type { TariffInput } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents, parsePtAmount } from '../lib/money';

const texts = t.tariffs.social;

function Sources() {
  return (
    <>
      <p className="hint">{texts.sources}</p>
      <ul className="hint">
        <li>
          <a href={SOCIAL_TARIFF_SOURCES.dgeg} target="_blank" rel="noreferrer">
            {texts.links.dgeg}
          </a>
        </li>
        <li>
          <a href={SOCIAL_TARIFF_SOURCES.erse} target="_blank" rel="noreferrer">
            {texts.links.erse}
          </a>
        </li>
      </ul>
    </>
  );
}

export function SocialTariff({
  tariff,
  cost,
  energy,
}: {
  tariff: TariffInput;
  cost: Cost;
  energy: EnergyByPeriod;
}) {
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [income, setIncome] = useState('');
  const [members, setMembers] = useState('0');

  if (hasSocialTariff(tariff)) {
    return (
      <section className="card form">
        <h2>{texts.title}</h2>
        <p>{texts.already}</p>
      </section>
    );
  }
  if (tariff.powerVa > MAX_POWER_VA) {
    return (
      <section className="card form">
        <h2>{texts.title}</h2>
        <p>{texts.powerTooHigh}</p>
        <Sources />
      </section>
    );
  }

  const incomeCents = income.trim() ? parsePtAmount(income) : undefined;
  const check = checkSocialTariff({
    benefits,
    ...(incomeCents !== undefined && incomeCents !== null && incomeCents >= 0
      ? { annualIncomeCents: incomeCents }
      : {}),
    membersWithoutIncome: Number(members) || 0,
  });
  const saving = socialTariffSaving(cost, energy, YEAR_DAYS, tariff);
  const toggle = (benefit: Benefit, on: boolean) =>
    setBenefits((current) =>
      on ? [...current, benefit] : current.filter((candidate) => candidate !== benefit),
    );

  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <fieldset className="social-benefits">
        <legend>{texts.benefitsLegend}</legend>
        {BENEFITS.map((benefit) => (
          <label key={benefit} className="checkbox">
            <input
              type="checkbox"
              checked={benefits.includes(benefit)}
              onChange={(event) => toggle(benefit, event.target.checked)}
            />
            {texts.benefits[benefit]}
          </label>
        ))}
      </fieldset>
      <label>
        {texts.income}
        <input
          inputMode="decimal"
          autoComplete="off"
          value={income}
          onChange={(event) => setIncome(event.target.value)}
          aria-invalid={incomeCents === null}
        />
        <span className={incomeCents === null ? 'error' : 'hint'}>
          {incomeCents === null ? texts.incomeError : texts.incomeHint}
        </span>
      </label>
      <label>
        {texts.members}
        <input
          type="number"
          min={0}
          max={10}
          value={members}
          onChange={(event) => setMembers(event.target.value)}
        />
        <span className="hint">{texts.membersHint}</span>
      </label>

      <p className={check.eligible ? 'verdict success' : 'verdict'} aria-live="polite">
        {check.eligible
          ? check.reason === 'income'
            ? texts.eligibleIncome(formatCents(check.incomeLimitCents))
            : texts.eligibleBenefit
          : texts.notEligible(formatCents(check.incomeLimitCents))}
      </p>
      <p>{texts.saving(formatCents(saving.totalCents))}</p>
      <p className="hint">
        {texts.savingParts(formatCents(saving.discountCents), formatCents(saving.iecCents))}{' '}
        {texts.estimate}
      </p>
      <p className="hint">{texts.conditions}</p>
      <p className="hint">{texts.how}</p>
      <Sources />
    </section>
  );
}
