// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The card "Consumo base": what the household says stays on day and night, set
 * against the base measured (src/domain/always-on.ts). The watts are optional
 * and the user's; what is left is what the list does not explain.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  alwaysOnBalance,
  alwaysOnInputSchema,
  itemWatts,
  shareOfCost,
  yearWh,
  type AlwaysOnInput,
  type AlwaysOnItem,
} from '../domain/always-on';
import { baseloadCost } from '../domain/baseload';
import type { Tariff } from '../domain/tariff';
import { t } from '../i18n/pt-PT';
import { formatCents } from '../lib/money';
import type { EpochSeconds } from '../lib/time';
import { formatKwh, formatPower, type Watts, type Wh } from '../lib/units';
import { createAlwaysOn, deleteAlwaysOn, fetchAlwaysOn, updateAlwaysOn, type Failure } from './api';
import { failureText, useSession } from './session';

const texts = t.consumption.alwaysOn;

/** Runs a change and tells what went wrong; signs out when the session ended. */
function useAct() {
  const { signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(run: () => Promise<{ ok: true } | Failure>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const outcome = await run();
    setBusy(false);
    if (outcome.ok) return true;
    const text = failureText(outcome, texts.failed);
    if (text === null) signOut();
    else setError(text);
    return false;
  }
  return { busy, error, act };
}

function ItemForm({
  initial,
  submit,
  onCancel,
}: {
  initial?: AlwaysOnInput;
  submit: (input: AlwaysOnInput) => Promise<{ ok: true } | Failure>;
  onCancel?: () => void;
}) {
  const { busy, error, act } = useAct();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 1));
  const [power, setPower] = useState(initial?.powerW === null ? '' : String(initial?.powerW ?? ''));
  const [measured, setMeasured] = useState(initial?.measured ?? false);
  const parsed = alwaysOnInputSchema.safeParse({
    label,
    quantity: Number(quantity),
    powerW: power.trim() === '' ? null : Number(power),
    measured: power.trim() !== '' && measured,
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.success) return;
    if ((await act(() => submit(parsed.data))) && !initial) {
      setLabel('');
      setQuantity('1');
      setPower('');
      setMeasured(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={(event) => void onSubmit(event)}>
      <label>
        {texts.name}
        <input
          value={label}
          maxLength={60}
          placeholder={texts.namePlaceholder}
          disabled={busy}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <label className="narrow">
        {texts.quantity}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          value={quantity}
          disabled={busy}
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <label className="narrow">
        {texts.power}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={5000}
          value={power}
          disabled={busy}
          onChange={(event) => setPower(event.target.value)}
        />
      </label>
      {power.trim() !== '' && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={measured}
            disabled={busy}
            onChange={(event) => setMeasured(event.target.checked)}
          />
          {texts.measuredQuestion}
        </label>
      )}
      <button type="submit" className="primary" disabled={busy || !parsed.success}>
        {initial ? texts.save : texts.add}
      </button>
      {onCancel && (
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>
          {texts.cancel}
        </button>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function Row({
  item,
  costCents,
  onChanged,
  onRemoved,
}: {
  item: AlwaysOnItem;
  /** Its part of what the list costs in a year; null without a tariff or a power. */
  costCents: number | null;
  onChanged: (item: AlwaysOnItem) => void;
  onRemoved: () => void;
}) {
  const { busy, error, act } = useAct();
  const [editing, setEditing] = useState(false);
  const watts = itemWatts(item);

  if (editing) {
    return (
      <li>
        <div>
          <ItemForm
            initial={item}
            onCancel={() => setEditing(false)}
            submit={async (input) => {
              const outcome = await updateAlwaysOn(item.id, input);
              if (outcome.ok) {
                onChanged({ ...item, ...input });
                setEditing(false);
              }
              return outcome;
            }}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <div>
        <span>{item.quantity > 1 ? texts.many(item.quantity, item.label) : item.label}</span>
        <span className="hint">
          {watts === null || item.powerW === null
            ? texts.noPower
            : texts.described(
                item.quantity > 1
                  ? texts.times(item.quantity, formatPower(item.powerW), formatPower(watts))
                  : formatPower(watts),
                item.measured ? texts.measured : texts.estimated,
                formatKwh(yearWh(watts), 0),
                costCents === null ? null : formatCents(costCents),
              )}
        </span>
        {error && <span className="error">{error}</span>}
      </div>
      <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(true)}>
        {texts.edit}
      </button>
      <button
        type="button"
        className="secondary danger"
        disabled={busy}
        onClick={() => {
          if (!window.confirm(texts.confirmRemove(item.label))) return;
          void act(async () => {
            const outcome = await deleteAlwaysOn(item.id);
            if (outcome.ok) onRemoved();
            return outcome;
          });
        }}
      >
        {texts.remove}
      </button>
    </li>
  );
}

function BalanceLine({ items, baseW }: { items: readonly AlwaysOnItem[]; baseW: Watts }) {
  const { listedW, withoutPower, leftW } = alwaysOnBalance(items, baseW);
  return (
    <>
      <p>
        {texts.listed(formatPower(listedW), formatPower(baseW))}{' '}
        <strong>
          {leftW >= 0 ? texts.left(formatPower(leftW)) : texts.over(formatPower(-leftW))}
        </strong>
      </p>
      {withoutPower > 0 && <p className="hint">{texts.withoutPower(withoutPower)}</p>}
    </>
  );
}

export function AlwaysOn({
  baseW,
  quarters,
  tariff,
}: {
  baseW: Watts;
  quarters: readonly { ts: EpochSeconds; energyWh: Wh }[];
  tariff: Tariff | null;
}) {
  const { signOut } = useSession();
  const [items, setItems] = useState<AlwaysOnItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void fetchAlwaysOn().then((outcome) => {
      if (!current) return;
      if (outcome.ok) return setItems(outcome.items);
      const text = failureText(outcome, t.errors.unavailable);
      if (text === null) signOut();
      else setError(text);
    });
    return () => {
      current = false;
    };
  }, [signOut]);

  const listedW = alwaysOnBalance(items ?? [], baseW).listedW;
  // Once for the whole list: a year of quarter hours for each item would be slow.
  const listCents = useMemo(
    () => (tariff ? (baseloadCost(listedW, quarters, tariff)?.annualCents ?? null) : null),
    [listedW, quarters, tariff],
  );

  return (
    <details className="adjust" id="sempre-ligado">
      <summary>{texts.title}</summary>
      <p className="hint">{texts.intro}</p>
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="hint">{t.loading}</p>}
      {items && (
        <>
          {items.length > 0 && (
            <>
              <BalanceLine items={items} baseW={baseW} />
              <ul className="signature-list">
                {items.map((item) => {
                  const watts = itemWatts(item);
                  return (
                    <Row
                      key={item.id}
                      item={item}
                      costCents={
                        listCents === null || watts === null
                          ? null
                          : shareOfCost(listCents, watts, listedW)
                      }
                      onChanged={(next) =>
                        setItems((list) =>
                          (list ?? []).map((other) => (other.id === next.id ? next : other)),
                        )
                      }
                      onRemoved={() =>
                        setItems((list) => (list ?? []).filter((other) => other.id !== item.id))
                      }
                    />
                  );
                })}
              </ul>
            </>
          )}
          <ItemForm
            submit={async (input) => {
              const outcome = await createAlwaysOn(input);
              if (outcome.ok) setItems((list) => [...(list ?? []), outcome.item]);
              return outcome;
            }}
          />
          <p className="hint">{texts.partly}</p>
        </>
      )}
    </details>
  );
}
