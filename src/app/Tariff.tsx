// SPDX-License-Identifier: AGPL-3.0-or-later
/** Settings → Tariff: the household's contract, copied from an invoice, and its history. */
import { useEffect, useState, type FormEvent } from 'react';
import powerTiers from '../data/power-tiers.json';
import {
  CYCLES,
  OPTION_PERIODS,
  PERIODS_MAPS,
  TARIFF_OPTIONS,
  tariffInputSchema,
  tariffOn,
  type Tariff,
  type TariffInput,
  type TariffOption,
} from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { bpToPtInput, microToPtInput, parsePtPercent, parsePtPrice } from '../lib/money';
import { formatLocalDate, lisbonToday } from '../lib/time';
import { formatKva } from '../lib/units';
import { deleteTariff, fetchTariffs, saveTariff } from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.tariff;
const LOW_POWER_VA = 3450;

function PriceField({
  name,
  label,
  value,
  required = true,
}: {
  name: string;
  label: string;
  value: number | undefined;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        inputMode="decimal"
        autoComplete="off"
        defaultValue={value === undefined ? '' : microToPtInput(value)}
        placeholder="0,0000"
        required={required}
      />
    </label>
  );
}

/** Reads the form; a string is the label of the first invalid price. */
function readForm(form: FormData, option: TariffOption): TariffInput | string {
  const prices: Record<string, number> = {};
  const fields: [string, string][] = [
    ['fixedPerDay', texts.fixedPerDay],
    ...OPTION_PERIODS[option].map((period): [string, string] => [
      `energy-${period}`,
      texts.periods[period],
    ]),
    ['socialEnergyPerKwh', texts.socialEnergy],
    ['socialPowerPerDay', texts.socialPower],
    ['socialFinancingPerKwh', texts.socialFinancing],
    ['iecPerKwh', texts.iec],
    ['cavPerMonth', texts.cav],
    ['dgegPerMonth', texts.dgeg],
  ];
  for (const [name, label] of fields) {
    const text = String(form.get(name) ?? '').trim();
    const value = text === '' && !name.startsWith('energy-') ? 0 : parsePtPrice(text);
    if (value === null) return label;
    prices[name] = value;
  }
  const discountText = String(form.get('energyDiscount') ?? '').trim();
  const energyDiscountBp = discountText === '' ? 0 : parsePtPercent(discountText);
  if (energyDiscountBp === null) return texts.energyDiscount;
  const supplier = String(form.get('supplier') ?? '').trim();
  const parsed = tariffInputSchema.safeParse({
    validFrom: String(form.get('validFrom')),
    supplier: supplier === '' ? null : supplier,
    powerVa: Number(form.get('powerVa')),
    option,
    cycle: String(form.get('cycle') ?? 'daily'),
    periodsMap: String(form.get('periodsMap') ?? 'pre-2027'),
    fixedPerDay: prices.fixedPerDay,
    energy: Object.fromEntries(
      OPTION_PERIODS[option].map((period) => [period, prices[`energy-${period}`]]),
    ),
    iecPerKwh: prices.iecPerKwh,
    cavPerMonth: prices.cavPerMonth,
    dgegPerMonth: prices.dgegPerMonth,
    largeFamily: form.get('largeFamily') === 'on',
    energyDiscountBp,
    socialEnergyPerKwh: prices.socialEnergyPerKwh,
    socialPowerPerDay: prices.socialPowerPerDay,
    socialFinancingPerKwh: prices.socialFinancingPerKwh,
  });
  return parsed.success ? parsed.data : texts.invalid;
}

function TariffForm({
  initial,
  onSaved,
}: {
  initial: Tariff | null;
  onSaved: (tariff: Tariff) => void;
}) {
  const { signOut } = useSession();
  const [option, setOption] = useState<TariffOption>(initial?.option ?? 'simple');
  const [powerVa, setPowerVa] = useState(initial?.powerVa ?? 6900);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = readForm(new FormData(event.currentTarget), option);
    if (typeof input === 'string') {
      setStatus({
        kind: 'error',
        text: input === texts.invalid ? input : texts.invalidField(input),
      });
      return;
    }
    setStatus({ kind: 'busy' });
    const outcome = await saveTariff(input);
    if (outcome.ok) {
      setStatus({ kind: 'done', text: texts.saved });
      onSaved(outcome.tariff);
      return;
    }
    const text = failureText(outcome, texts.invalid);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  return (
    <form className="form tariff-form" onSubmit={submit}>
      <h3>{texts.newTitle}</h3>
      <p className="hint">{texts.editHint}</p>
      <label>
        {texts.validFrom}
        <input
          name="validFrom"
          type="date"
          defaultValue={initial?.validFrom ?? lisbonToday()}
          required
        />
      </label>
      <label>
        {texts.supplier}
        <input name="supplier" defaultValue={initial?.supplier ?? ''} maxLength={60} />
      </label>
      <label>
        {texts.power}
        <select
          name="powerVa"
          value={powerVa}
          onChange={(event) => setPowerVa(Number(event.target.value))}
        >
          {powerTiers.tiersVa.map((va) => (
            <option key={va} value={va}>
              {formatKva(va)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {texts.option}
        <select
          name="option"
          value={option}
          onChange={(event) => setOption(event.target.value as TariffOption)}
        >
          {TARIFF_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {texts.options[value]}
            </option>
          ))}
        </select>
      </label>
      {option !== 'simple' && (
        <>
          <label>
            {texts.cycle}
            <select name="cycle" defaultValue={initial?.cycle ?? 'daily'}>
              {CYCLES.map((value) => (
                <option key={value} value={value}>
                  {texts.cycles[value]}
                </option>
              ))}
            </select>
            <span className="hint">{texts.cycleHint}</span>
          </label>
          <label>
            {texts.periodsMap}
            <select name="periodsMap" defaultValue={initial?.periodsMap ?? 'pre-2027'}>
              {PERIODS_MAPS.map((value) => (
                <option key={value} value={value}>
                  {texts.periodsMaps[value]}
                </option>
              ))}
            </select>
            <span className="hint">{texts.periodsMapHint}</span>
          </label>
        </>
      )}

      <PriceField name="fixedPerDay" label={texts.fixedPerDay} value={initial?.fixedPerDay} />
      <fieldset>
        <legend>{texts.energy}</legend>
        {OPTION_PERIODS[option].map((period) => (
          <PriceField
            key={period}
            name={`energy-${period}`}
            label={texts.periods[period]}
            value={initial?.energy[period]}
          />
        ))}
        <label>
          {texts.energyDiscount}
          <input
            name="energyDiscount"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={bpToPtInput(initial?.energyDiscountBp ?? 0)}
            placeholder="0"
          />
          <span className="hint">{texts.energyDiscountHint}</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>{texts.socialTitle}</legend>
        <p className="hint">{texts.socialHint}</p>
        <PriceField
          name="socialEnergyPerKwh"
          label={texts.socialEnergy}
          value={initial?.socialEnergyPerKwh ?? 0}
        />
        <PriceField
          name="socialPowerPerDay"
          label={texts.socialPower}
          value={initial?.socialPowerPerDay ?? 0}
        />
      </fieldset>

      <fieldset>
        <legend>{texts.taxesTitle}</legend>
        <p className="hint">{texts.taxesHint}</p>
        <PriceField
          name="socialFinancingPerKwh"
          label={texts.socialFinancing}
          value={initial?.socialFinancingPerKwh ?? 0}
        />
        <PriceField name="iecPerKwh" label={texts.iec} value={initial?.iecPerKwh ?? 0} />
        <PriceField name="cavPerMonth" label={texts.cav} value={initial?.cavPerMonth ?? 0} />
        <PriceField name="dgegPerMonth" label={texts.dgeg} value={initial?.dgegPerMonth ?? 0} />
      </fieldset>

      <label className="checkbox">
        <input name="largeFamily" type="checkbox" defaultChecked={initial?.largeFamily ?? false} />
        {texts.largeFamily}
      </label>
      {powerVa <= LOW_POWER_VA && <p className="hint">{texts.lowPowerNote}</p>}

      <StatusLine status={status} />
      <button type="submit" className="primary" disabled={status.kind === 'busy'}>
        {status.kind === 'busy' ? texts.saving : texts.save}
      </button>
    </form>
  );
}

function TariffItem({ tariff, onRemove }: { tariff: Tariff; onRemove: () => void }) {
  return (
    <li className="device">
      <div>
        <strong>{texts.current(formatLocalDate(tariff.validFrom))}</strong>
        <p className="hint">
          {texts.summary(texts.options[tariff.option], formatKva(tariff.powerVa))}
          {tariff.option !== 'simple' && ` · ${texts.cycles[tariff.cycle]}`}
          {tariff.supplier && ` · ${tariff.supplier}`}
        </p>
      </div>
      <button type="button" className="secondary" onClick={onRemove}>
        {texts.remove}
      </button>
    </li>
  );
}

export function TariffSection() {
  const { signOut } = useSession();
  const [tariffs, setTariffs] = useState<Tariff[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    let active = true;
    void fetchTariffs().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setTariffs(outcome.tariffs);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  async function remove(tariff: Tariff) {
    if (!window.confirm(texts.removeConfirm(formatLocalDate(tariff.validFrom)))) return;
    const outcome = await deleteTariff(tariff.id);
    if (outcome.ok) {
      setTariffs((list) => (list ?? []).filter((item) => item.id !== tariff.id));
      return;
    }
    const text = failureText(outcome, t.errors.unavailable);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  const saved = (tariff: Tariff) =>
    setTariffs((list) =>
      [...(list ?? []).filter((item) => item.validFrom !== tariff.validFrom), tariff].sort((a, b) =>
        a.validFrom.localeCompare(b.validFrom),
      ),
    );

  const current = tariffs ? tariffOn(tariffs, lisbonToday()) : null;
  const others = (tariffs ?? []).filter((tariff) => tariff !== current).reverse();

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <StatusLine status={status} />
      {tariffs === null ? (
        status.kind === 'idle' && <p className="hint">{t.loading}</p>
      ) : (
        <>
          {current ? (
            <ul className="devices">
              <TariffItem tariff={current} onRemove={() => void remove(current)} />
            </ul>
          ) : (
            <p>{texts.none}</p>
          )}
          {others.length > 0 && (
            <>
              <h3>{texts.history}</h3>
              <ul className="devices">
                {others.map((tariff) => (
                  <TariffItem
                    key={tariff.id}
                    tariff={tariff}
                    onRemove={() => void remove(tariff)}
                  />
                ))}
              </ul>
            </>
          )}
          {/* Filled once, when the list arrives; after saving it keeps what was typed. */}
          <TariffForm initial={current ?? tariffs.at(-1) ?? null} onSaved={saved} />
        </>
      )}
    </section>
  );
}
