// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Início": what the analysis pages conclude, in euros, each a link to its
 * page. The same functions and defaults as the pages (and the AI's tools), so
 * the amounts are theirs: Potência (10 % margin, single phase), Tarifários
 * (every offer, the last 365 days), the baseload of Consumo.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { baseloadCost, nightlyBaseload, recentBaseload } from '../domain/baseload';
import { annualUsage, compareOffers } from '../domain/compare';
import { dynamicAdjust, profileEffect } from '../domain/indexed';
import type { OmieFile } from '../domain/omie';
import {
  annualFixedCents,
  DEFAULT_MARGIN_PCT,
  offerFixedPerDay,
  recommendTier,
  SINGLE_PHASE,
} from '../domain/contracted-power';
import type { Offer } from '../domain/erse';
import type { Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents, type Cents } from '../lib/money';
import { lisbonToday } from '../lib/time';
import { formatKva, formatPower } from '../lib/units';
import { loadPower } from './ai-context';
import { fetchOffers, fetchOmie } from './api';
import { lastYear, type HouseholdEnergy } from './household-energy';

const texts = t.home.actions;

interface PowerAction {
  recommendedVa: number;
  savingCents: Cents | null;
}

/** The recommended tier (Shelly only) and the yearly saving on the power term. */
async function powerAction(tariff: Tariff, offers: readonly Offer[] | null) {
  const facts = await loadPower(Math.floor(Date.now() / 1000));
  if (!facts || facts.kind !== 'shelly') return null;
  const { recommendedVa } = await recommendTier({
    peak: facts.peak,
    marginPct: DEFAULT_MARGIN_PCT,
    curve: SINGLE_PHASE,
    fetchPeaks: facts.fetchPeaks,
  });
  if (recommendedVa === null) return null;
  let savingCents: Cents | null = null;
  if (recommendedVa < tariff.powerVa && offers) {
    const match = offerFixedPerDay(offers, tariff, recommendedVa);
    if (match) {
      savingCents =
        annualFixedCents(tariff, tariff.powerVa, tariff.fixedPerDay) -
        annualFixedCents(tariff, recommendedVa, match.fixedPerDay);
    }
  }
  return { recommendedVa, savingCents };
}

function Action({
  to,
  title,
  value,
  hint,
}: {
  to: string;
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <Link to={to} className="action">
      <span className="action-title">{title}</span>
      <span className="action-value">{value}</span>
      <span className="action-hint">{hint}</span>
    </Link>
  );
}

export function HomeActions({ energy }: { energy: HouseholdEnergy }) {
  const { tariff, window, quarters: all } = energy;
  const quarters = useMemo(() => (all ? lastYear(all, window) : null), [all, window]);
  const [offers, setOffers] = useState<Offer[] | null | undefined>(undefined);
  const [power, setPower] = useState<PowerAction | null | undefined>(undefined);
  const [omie, setOmie] = useState<OmieFile | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void fetchOffers().then((file) => {
      if (active) setOffers(file ? file.offers : null);
    });
    void fetchOmie().then((file) => {
      if (active) setOmie(file);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tariff || offers === undefined) return;
    let active = true;
    void powerAction(tariff, offers)
      .catch(() => null)
      .then((result) => {
        if (active) setPower(result);
      });
    return () => {
      active = false;
    };
  }, [tariff, offers]);

  const best = useMemo(() => {
    // Waits for the OMIE prices too, so the amount is the one "Tarifários" shows.
    if (!quarters || !tariff || !offers || omie === undefined) return null;
    const usage = annualUsage(quarters, tariff.periodsMap);
    if (!usage) return null;
    const adjust = dynamicAdjust(omie ? profileEffect(quarters, omie, tariff.periodsMap) : null);
    return (
      compareOffers({ usage, current: tariff, offers, today: lisbonToday(), adjust }).results[0] ??
      null
    );
  }, [quarters, tariff, offers, omie]);

  const baseload = useMemo(() => {
    if (!quarters || !tariff) return null;
    const recent = recentBaseload(nightlyBaseload(quarters));
    const cost = recent ? baseloadCost(recent.watts, quarters, tariff) : null;
    return recent && cost ? { watts: recent.watts, cents: cost.annualCents } : null;
  }, [quarters, tariff]);

  if (tariff === null) {
    return (
      <section className="card">
        <h2>{texts.title}</h2>
        <p>
          {texts.noTariff} <Link to="/definicoes#tarifario">{texts.toSettings}</Link>
        </p>
      </section>
    );
  }
  if (!tariff || (!power && !best && !baseload)) return null;

  return (
    <section className="actions" aria-label={texts.title}>
      {power &&
        (power.recommendedVa < tariff.powerVa ? (
          <Action
            to="/potencia"
            title={texts.powerLower(formatKva(power.recommendedVa))}
            value={power.savingCents === null ? '—' : texts.perYear(formatCents(power.savingCents))}
            hint={texts.powerHint(formatKva(tariff.powerVa))}
          />
        ) : (
          <Action
            to="/potencia"
            title={texts.powerRight}
            value={formatKva(tariff.powerVa)}
            hint={texts.powerRightHint}
          />
        ))}
      {best &&
        (best.savingCents > 0 ? (
          <Action
            to="/tarifarios"
            title={texts.tariffBetter(best.offer.supplier)}
            value={texts.perYear(formatCents(best.savingCents))}
            hint={texts.tariffHint}
          />
        ) : (
          <Action
            to="/tarifarios"
            title={texts.tariffBest}
            value={texts.ok}
            hint={texts.tariffBestHint}
          />
        ))}
      {baseload && (
        <Action
          to="/consumo#consumo-base"
          title={texts.baseload(formatPower(baseload.watts))}
          value={texts.costPerYear(formatCents(baseload.cents))}
          hint={texts.baseloadHint}
        />
      )}
    </section>
  );
}
