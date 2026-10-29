// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tarifários → "Painéis solares": PVGIS's production for the panels the user
 * describes (asked through the Worker, only on "Calcular": docs/pvgis.md) set
 * against the house's quarter hours of the last 365 days (src/domain/solar.ts),
 * and what a battery the user describes would add.
 */
import { useMemo, useState } from 'react';
import type { Offer } from '../domain/erse';
import { solarSaving, type Battery, type SolarYear } from '../domain/solar';
import type { TariffInput } from '../domain/tariff';
import { isDemo } from '../demo/mode';
import { t } from '../i18n/pt-PT';
import { formatCents, parsePtAmount, parsePtPrice } from '../lib/money';
import { lisbonToday, type EpochSeconds } from '../lib/time';
import { formatKwh, parsePtTenths, type Wh } from '../lib/units';
import { fetchSolarYear } from './api';
import { optionLabel } from './offer-label';
import { failureText, useSession } from './session';

const texts = t.tariffs.solar;
const batteryTexts = texts.battery;
const ASPECTS = ['-90', '-45', '0', '45', '90'] as const;

const wholeIn = (text: string, min: number, max: number) => {
  if (!/^\s*\d{1,3}\s*$/.test(text)) return null;
  const value = Number(text);
  return value >= min && value <= max ? value : null;
};

type Fetched = { key: string; year: SolarYear };

export function SolarPanels({
  quarters,
  tariff,
  offers,
}: {
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[];
  tariff: TariffInput;
  offers: readonly Offer[];
}) {
  const { signOut } = useSession();
  const [kwp, setKwp] = useState('');
  const [angle, setAngle] = useState('');
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>('0');
  const [loss, setLoss] = useState('14');
  const [price, setPrice] = useState('');
  const [install, setInstall] = useState('');
  const [capacity, setCapacity] = useState('');
  const [efficiency, setEfficiency] = useState('');
  const [power, setPower] = useState('');
  const [batteryCost, setBatteryCost] = useState('');
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenthsKwp = parsePtTenths(kwp);
  const angleDeg = wholeIn(angle, 0, 90);
  const lossPct = wholeIn(loss, 0, 50);
  const surplusMicro = price.trim() ? parsePtPrice(price) : null;
  const installCents = install.trim() ? parsePtAmount(install) : null;
  const tenthsKwh = parsePtTenths(capacity);
  const efficiencyPct = wholeIn(efficiency, 1, 100);
  const tenthsKw = power.trim() ? parsePtTenths(power) : null;
  const batteryCents = batteryCost.trim() ? parsePtAmount(batteryCost) : null;
  const batteryValid =
    tenthsKwh !== null &&
    tenthsKwh > 0 &&
    efficiencyPct !== null &&
    (power.trim() === '' || (tenthsKw !== null && tenthsKw > 0));
  const battery = useMemo<Battery | null>(
    () =>
      batteryValid && tenthsKwh !== null && efficiencyPct !== null
        ? { tenthsKwh, efficiencyPct, tenthsKw }
        : null,
    [batteryValid, tenthsKwh, efficiencyPct, tenthsKw],
  );
  const valid = tenthsKwp !== null && tenthsKwp > 0 && angleDeg !== null && lossPct !== null;
  const key = JSON.stringify([angleDeg, aspect, lossPct]);
  const year = fetched?.key === key ? fetched.year : null;

  const result = useMemo(
    () =>
      year && tenthsKwp
        ? solarSaving({
            quarters,
            year,
            tenthsKwp,
            current: tariff,
            offers,
            today: lisbonToday(),
            surplusMicro,
            installCents,
            battery,
            batteryCents,
          })
        : null,
    [year, tenthsKwp, quarters, tariff, offers, surplusMicro, installCents, battery, batteryCents],
  );

  async function calculate() {
    if (!valid || angleDeg === null || lossPct === null) return;
    setBusy(true);
    setError(null);
    const outcome = await fetchSolarYear({
      angle: angleDeg,
      aspect: Number(aspect),
      loss: lossPct,
    });
    setBusy(false);
    if (outcome.ok) return setFetched({ key, year: outcome.year });
    if (outcome.reason === 'noLocation') return setError(texts.noLocation);
    const text = failureText(outcome, texts.failed);
    if (text === null) return signOut();
    setError(text);
  }

  const pct = (part: Wh, whole: Wh) => Math.round((part * 100) / Math.max(whole, 1));
  const best = result?.best;
  const withBattery = result?.battery ?? null;
  const bestSaving = best && result ? result.currentWithSolarCents - best.annualCents : 0;

  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <div className="car-inputs">
        <label>
          {texts.kwp}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={kwp}
            onChange={(event) => setKwp(event.target.value)}
          />
          <span className="hint">{texts.kwpHint}</span>
        </label>
        <label>
          {texts.angle}
          <input
            inputMode="numeric"
            autoComplete="off"
            value={angle}
            onChange={(event) => setAngle(event.target.value)}
          />
          <span className="hint">{texts.angleHint}</span>
        </label>
        <label>
          {texts.aspect}
          <select
            value={aspect}
            onChange={(event) => setAspect(event.target.value as (typeof ASPECTS)[number])}
          >
            {ASPECTS.map((value) => (
              <option key={value} value={value}>
                {texts.aspects[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {texts.loss}
          <input
            inputMode="numeric"
            autoComplete="off"
            value={loss}
            onChange={(event) => setLoss(event.target.value)}
          />
          <span className="hint">{texts.lossHint}</span>
        </label>
        <label>
          {texts.surplusPrice}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            aria-invalid={price.trim() !== '' && surplusMicro === null}
          />
          <span className="hint">{texts.surplusPriceHint}</span>
        </label>
        <label>
          {texts.install}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={install}
            onChange={(event) => setInstall(event.target.value)}
            aria-invalid={install.trim() !== '' && installCents === null}
          />
          <span className="hint">{texts.installHint}</span>
        </label>
      </div>
      <h3>{batteryTexts.title}</h3>
      <p className="hint">{batteryTexts.intro}</p>
      <div className="car-inputs">
        <label>
          {batteryTexts.capacity}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
          <span className="hint">{batteryTexts.capacityHint}</span>
        </label>
        <label>
          {batteryTexts.efficiency}
          <input
            inputMode="numeric"
            autoComplete="off"
            value={efficiency}
            onChange={(event) => setEfficiency(event.target.value)}
          />
          <span className="hint">{batteryTexts.efficiencyHint}</span>
        </label>
        <label>
          {batteryTexts.power}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={power}
            onChange={(event) => setPower(event.target.value)}
          />
          <span className="hint">{batteryTexts.powerHint}</span>
        </label>
        <label>
          {batteryTexts.cost}
          <input
            inputMode="decimal"
            autoComplete="off"
            value={batteryCost}
            onChange={(event) => setBatteryCost(event.target.value)}
            aria-invalid={batteryCost.trim() !== '' && batteryCents === null}
          />
        </label>
      </div>
      {capacity.trim() !== '' && efficiency.trim() !== '' && !batteryValid && (
        <p className="error">{batteryTexts.invalid}</p>
      )}
      {kwp.trim() !== '' && angle.trim() !== '' && !valid && (
        <p className="error">{texts.invalid}</p>
      )}
      <p className="hint">{isDemo() ? texts.demo : texts.privacy}</p>
      <button
        type="button"
        disabled={!valid || busy || year !== null}
        onClick={() => void calculate()}
      >
        {busy ? texts.calculating : texts.calculate}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div aria-live="polite">
          <p>
            {texts.production(
              formatKwh(result.productionWh, 0),
              formatKwh(result.selfWh, 0),
              pct(result.selfWh, result.productionWh),
            )}{' '}
            {texts.covered(pct(result.selfWh, result.usage.totalWh + result.selfWh))}
          </p>
          <p className="verdict success">{texts.saving(formatCents(result.savingCents))}</p>
          <p>
            {result.surplusCents === null
              ? texts.surplus(formatKwh(result.surplusWh, 0))
              : texts.surplusValue(
                  formatKwh(result.surplusWh, 0),
                  formatCents(result.surplusCents),
                )}
          </p>
          {installCents !== null &&
            installCents > 0 &&
            (result.paybackYears !== null ? (
              <p>{texts.payback(result.paybackYears.toLocaleString('pt-PT'))}</p>
            ) : (
              <p>{texts.noPayback}</p>
            ))}
          {withBattery && (
            <>
              <p>
                {batteryTexts.used(
                  formatKwh(withBattery.selfWh, 0),
                  pct(withBattery.selfWh, result.productionWh),
                  formatKwh(withBattery.batteryWh, 0),
                )}
              </p>
              <p className="verdict success">
                {batteryTexts.saving(formatCents(withBattery.savingCents))}
              </p>
              <p>
                {withBattery.surplusCents === null
                  ? batteryTexts.surplus(formatKwh(withBattery.surplusWh, 0))
                  : batteryTexts.surplusValue(
                      formatKwh(withBattery.surplusWh, 0),
                      formatCents(withBattery.surplusCents),
                    )}
              </p>
              {batteryCents !== null &&
                batteryCents > 0 &&
                (withBattery.paybackYears !== null ? (
                  <p>{batteryTexts.payback(withBattery.paybackYears.toLocaleString('pt-PT'))}</p>
                ) : (
                  <p>{batteryTexts.noPayback}</p>
                ))}
            </>
          )}
          <p>
            {best && bestSaving > 0
              ? (withBattery ? texts.bestWithBattery : texts.best)(
                  best.offer.name,
                  best.offer.supplier,
                  optionLabel(best),
                  formatCents(best.annualCents),
                  formatCents(bestSaving),
                )
              : withBattery
                ? texts.keepWithBattery
                : texts.keep}
          </p>
          {result.usage.extrapolated && (
            <p className="notice-box">{texts.partYear(result.usage.days)}</p>
          )}
          <p className="hint">{texts.limits}</p>
          {withBattery && <p className="hint">{batteryTexts.limits}</p>}
        </div>
      )}
    </section>
  );
}
