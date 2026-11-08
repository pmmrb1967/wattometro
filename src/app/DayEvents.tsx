// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": what the Shelly's per-second values show on a day (Phase 8.1):
 * the power steps (src/nilm/events.ts) and the on/off cycles they pair into
 * (src/nilm/cycles.ts), grouped by power, and the appliances they are
 * (src/nilm/appliances.ts), the dearest first, each with what it cost that
 * day: a group without a name has "Dar nome", a named one "Mudar o nome" (and
 * "Esquecer este aparelho"). Only with a Shelly, for the last days.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { HowItWorks } from '../components/HowItWorks';
import { InfoTip } from '../components/InfoTip';
import { t } from '../i18n/pt-PT';
import { addDays } from '../domain/consumption';
import {
  formatDuration,
  formatLisbonTime,
  formatLocalDate,
  lisbonToday,
  type LocalDate,
} from '../lib/time';
import { formatKwh, formatPower } from '../lib/units';
import {
  confusable,
  describeGroup,
  fitsAppliance,
  groupAppliance,
  nameAppliance,
  type ApplianceDescriptor,
} from '../nilm/appliances';
import { tariffOn, type TariffInput } from '../domain/tariff';
import { GROUP_ORDERS, parseGroupOrder, sortGroups, type GroupOrder } from '../nilm/group-order';
import { formatCents } from '../lib/money';
import {
  analyseDay,
  fridgeCostCents,
  groupCostCents,
  nameDay,
  type DayAnalysis,
} from '../nilm/day';
import type { Fridge } from '../nilm/fridge';
import { decodeSecondsRecords } from '../nilm/series';
import { buildGroup, splitByAppliance, type CycleGroup } from '../nilm/summary';
import type { Appliance } from '../nilm/appliances';
import { groupLoadKind } from '../nilm/load-kind';
import { addAppliance, forgetAppliance, useAppliances } from './appliances-store';
import { nameKey } from '../domain/equipment';
import { suggestEquipment } from '../domain/equipment-suggest';
import { programmeUses } from '../domain/equipment-programmes';
import { programmeText } from './programme-text';
import { useEquipment } from './equipment-store';
import type { HouseholdEnergy } from './household-energy';
import { loadDaySeconds } from './seconds-cache';
import { failureText, useSession } from './session';

const texts = t.dayEvents;

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt') === b.trim().toLocaleLowerCase('pt');
/** As far back as the per-second values are usually kept (and the cache keeps). */
const DAYS = 7;

type Loaded = { day: LocalDate; records: ArrayBuffer } | { day: LocalDate; error: true };

/** A day's cost; under a cent (it rounds to 0) as "< 0,01 €" rather than "0,00 €". */
function formatDayCost(cents: number): string {
  return cents === 0 ? texts.underACentAmount : formatCents(cents);
}

function groupPower(group: CycleGroup): string {
  return group.statesW.length > 1
    ? group.statesW.map((watts) => formatPower(watts)).join(' → ')
    : group.pulsing
      ? texts.pulsing(formatPower(group.powerW))
      : group.heats !== null
        ? texts.programme(formatPower(group.powerW), group.heats)
        : formatPower(group.powerW);
}

/** The fridge known by its pauses: too small for the groups below, and only ever an estimate. */
function FridgeLine({
  fridge,
  analysis,
  tariff,
}: {
  fridge: Fridge;
  analysis: DayAnalysis;
  tariff: TariffInput | null;
}) {
  const costCents = tariff ? fridgeCostCents(fridge, analysis, tariff) : null;
  return (
    <p className="hint">
      {fridge.onPct === null || fridge.energyWh === null
        ? texts.fridgeUnmeasured(fridge.pauses.length, formatPower(fridge.powerW))
        : texts.fridge(
            fridge.pauses.length,
            formatPower(fridge.powerW),
            fridge.onPct,
            formatKwh(fridge.energyWh, 2),
            costCents === null ? null : formatDayCost(costCents),
          )}
    </p>
  );
}

/** Below this, groups sit near the detector's floor (MIN_STEP_W) and the house's own noise. */
const RELIABLE_W = 60;

const ORDER_KEY = 'wattometro.dayEvents.order';

/** The order last chosen on this browser. */
function loadOrder(): GroupOrder {
  try {
    return parseGroupOrder(localStorage.getItem(ORDER_KEY));
  } catch {
    return parseGroupOrder(null);
  }
}

function saveOrder(order: GroupOrder): void {
  try {
    localStorage.setItem(ORDER_KEY, order);
  } catch {
    // Not kept on this device; the order still applies while the page is open.
  }
}

/**
 * "Dar nome": names a group; the name then applies to every cycle that fits, on
 * any day. On a group already named (`current`), corrects it: the new name gets
 * this group's descriptor, and each cycle goes to the closest appliance.
 * With more than one cycle, only the ones ticked are this appliance: the
 * descriptor is theirs (the durations they span), and the others stay apart
 * when their durations differ; when they do not, it says so.
 */
function NameGroup({
  group,
  current,
  onDone,
}: {
  group: CycleGroup;
  current: Appliance | null;
  onDone: () => void;
}) {
  const { me, signOut } = useSession();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(
    () => new Set(group.cycles.map((cycle) => cycle.start)),
  );
  const register = useEquipment(me.householdId);
  const known = useAppliances(me.householdId);
  const listId = useId();
  const powerW230 = describeGroup(group).powerW;
  const suggestions = suggestEquipment(powerW230, register.kind === 'ready' ? register.items : []);
  const typed = suggestions.find(({ item }) => nameKey(item.name) === nameKey(label));

  async function save() {
    setBusy(true);
    const picked = group.cycles.filter((cycle) => chosen.has(cycle.start));
    const left = group.cycles.filter((cycle) => !chosen.has(cycle.start));
    const descriptor = describeGroup(picked.length === group.count ? group : buildGroup(picked));
    const correcting = current !== null && !sameName(current.label, label);
    // What will be stored: another programme widens an appliance of the same name.
    const plan = correcting
      ? null
      : nameAppliance(label.trim(), descriptor, known.kind === 'ready' ? known.appliances : []);
    const stored: ApplianceDescriptor =
      plan?.kind === 'widen'
        ? {
            ...plan.appliance,
            minDurationS: plan.durations.minS,
            maxDurationS: plan.durations.maxS,
          }
        : descriptor;
    const outcome = await addAppliance(label.trim(), descriptor, { separate: correcting });
    setBusy(false);
    if (outcome.ok) {
      const notes: string[] = [];
      const leftFit = left.filter((cycle) => fitsAppliance(cycle, stored)).length;
      if (leftFit > 0) notes.push(texts.leftOutFit(leftFit, label.trim()));
      if (current && correcting && confusable(current, descriptor)) {
        notes.push(texts.confusable(label.trim(), current.label));
      }
      return notes.length > 0 ? setWarnings(notes) : onDone();
    }
    const text = failureText(outcome, texts.tooMany);
    if (text === null) return signOut();
    setError(text);
  }

  async function forget() {
    if (!current) return;
    setBusy(true);
    const outcome = await forgetAppliance(current.id);
    setBusy(false);
    if (outcome.ok) return onDone();
    const text = failureText(outcome, t.knownAppliances.failed);
    if (text === null) return signOut();
    setError(text);
  }

  if (warnings) {
    return (
      <div className="name-group">
        {warnings.map((warning) => (
          <p key={warning} className="warning">
            {warning}
          </p>
        ))}
        <div className="actions">
          <button type="button" className="secondary" onClick={onDone}>
            {texts.close}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="name-group"
      onSubmit={(event) => {
        event.preventDefault();
        if (label.trim() !== '' && chosen.size > 0) void save();
      }}
    >
      <label>
        {current
          ? texts.notThisLabel(current.label, groupPower(group))
          : texts.whatIsItLabel(groupPower(group))}
        <input
          value={label}
          maxLength={60}
          autoFocus
          placeholder={t.calibrate.appliancePlaceholder}
          list={suggestions.length > 0 ? listId : undefined}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      {suggestions.length > 0 && (
        <>
          <datalist id={listId}>
            {suggestions.map(({ item }) => (
              <option key={item.id} value={item.name} />
            ))}
          </datalist>
          <p className="hint">{texts.fromRegister}</p>
        </>
      )}
      {typed && !typed.fits && typed.item.ratedPowerW !== null && (
        <p className="warning">
          {texts.plateWarning(
            typed.item.name,
            formatPower(typed.item.ratedPowerW),
            formatPower(powerW230),
          )}
        </p>
      )}
      {group.count > 1 && (
        <fieldset className="name-cycles">
          <legend>{texts.whichTimes}</legend>
          <p className="hint">{texts.whichTimesHint}</p>
          {group.cycles.map((cycle) => (
            <label key={cycle.start} className="checkbox">
              <input
                type="checkbox"
                checked={chosen.has(cycle.start)}
                onChange={(event) => {
                  const next = new Set(chosen);
                  if (event.target.checked) next.add(cycle.start);
                  else next.delete(cycle.start);
                  setChosen(next);
                }}
              />
              <span>
                {texts.once(formatLisbonTime(cycle.start), formatDuration(cycle.durationS))}
                {` · ${formatKwh(cycle.energyWh, 2)}`}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          type="submit"
          className="primary"
          disabled={busy || label.trim() === '' || chosen.size === 0}
        >
          {texts.name}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onDone}>
          {texts.cancel}
        </button>
      </div>
      {current && (
        <div className="forget-appliance">
          <p className="hint">{texts.forgetHint}</p>
          <button
            type="button"
            className="secondary danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t.knownAppliances.confirmForget(current.label))) void forget();
            }}
          >
            {texts.forget}
          </button>
        </div>
      )}
    </form>
  );
}

export function DayEvents({ energy }: { energy: HouseholdEnergy }) {
  const { me } = useSession();
  const meter = energy.houseShelly;
  const [today] = useState(lisbonToday);
  const days = useMemo(() => {
    const list: LocalDate[] = [];
    for (let back = 0; back < DAYS; back++) {
      const day = addDays(today, -back);
      if (energy.shellyFrom && day < energy.shellyFrom) break;
      list.push(day);
    }
    return list;
  }, [today, energy.shellyFrom]);
  // Today by default: what just happened is what one comes to look at.
  const [day, setDay] = useState<LocalDate>(() => days[0] ?? today);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const known = useAppliances(me.householdId);
  // The group being named: its first cycle's start.
  const [naming, setNaming] = useState<number | null>(null);
  const [order, setOrder] = useState<GroupOrder>(loadOrder);

  function chooseOrder(next: GroupOrder) {
    setOrder(next);
    saveOrder(next);
  }

  useEffect(() => {
    if (!meter) return;
    let current = true;
    void loadDaySeconds(me.householdId, meter, day).then((outcome) => {
      if (!current) return;
      setLoaded(outcome.ok ? { day, records: outcome.records } : { day, error: true });
    });
    return () => {
      current = false;
    };
  }, [me.householdId, meter, day]);

  const result = useMemo(() => {
    if (!loaded || 'error' in loaded) return null;
    return analyseDay(decodeSecondsRecords(loaded.records), loaded.day);
  }, [loaded]);

  const appliances = known.kind === 'ready' ? known.appliances : null;
  const equipment = useEquipment(me.householdId);
  const register = equipment.kind === 'ready' ? equipment.items : [];
  const tariff = loaded && energy.tariffs ? tariffOn(energy.tariffs, loaded.day) : null;
  const named = useMemo(
    () => (result && appliances ? nameDay(result, appliances, tariff) : null),
    [result, appliances, tariff],
  );

  const groups = useMemo(() => {
    if (!result) return [];
    // Two appliances of the same power (told apart by their durations): a line each.
    const split = named ? splitByAppliance(result.groups, named.byCycle) : result.groups;
    return sortGroups(
      split.map((group) => ({
        group,
        costCents: tariff ? groupCostCents(group, result, tariff) : null,
      })),
      order,
    );
  }, [result, named, tariff, order]);

  if (!meter || days.length === 0) return null;
  const pending = !loaded || loaded.day !== day;

  return (
    <section className="card form" id="ao-segundo">
      <h2>{texts.title}</h2>
      <p className="lead">{texts.intro}</p>
      <p>
        <Link to="/consumo/calibrar">{t.calibrate.open}</Link>
      </p>
      <div className="day-controls">
        <label>
          {texts.day}
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {days.map((item) => (
              <option key={item} value={item}>
                {item === today ? texts.today : formatLocalDate(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {texts.orderBy}
          <select
            value={order}
            onChange={(event) => chooseOrder(parseGroupOrder(event.target.value))}
          >
            {GROUP_ORDERS.map((item) => (
              <option key={item} value={item}>
                {texts.orders[item]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pending && <p className="hint">{t.loading}</p>}
      {!pending && loaded && 'error' in loaded && <p className="error">{texts.error}</p>}
      {!pending && result && result.minutes === 0 && <p>{texts.none}</p>}
      {!pending && result && result.minutes > 0 && (
        <>
          <p>{texts.summary(result.minutes, result.events.length, result.cycles.length)}</p>
          {result.fridge && <FridgeLine fridge={result.fridge} analysis={result} tariff={tariff} />}
          {named && named.totals.length > 0 && (
            <div className="named-appliances">
              <h3>{texts.named}</h3>
              <ul>
                {named.totals.map((total) => (
                  <li key={total.appliance.id}>
                    <strong>{total.appliance.label}</strong>
                    <span>
                      {texts.namedRow(
                        total.cycles,
                        formatKwh(total.energyWh, 2),
                        total.costCents === null ? null : formatDayCost(total.costCents),
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {named.explainedPct !== null && (
                <p className="hint">
                  {texts.explained(named.explainedPct, formatKwh(result.energyWh, 2))}
                </p>
              )}
              {tariff ? (
                <p className="hint">{texts.costNote}</p>
              ) : (
                energy.tariffs !== null && (
                  <p className="hint">
                    <Link to="/tarifarios">{texts.noTariff}</Link>
                  </p>
                )
              )}
            </div>
          )}
          {groups.length > 0 && (
            <ol className="offers appliance-groups">
              {groups.map(({ group, costCents }) => {
                const first = group.cycles[0]!.start;
                const appliance = named ? groupAppliance(group, named.byCycle) : null;
                const kind = groupLoadKind(group);
                // Its equipment's manual: the likely programme of each whole programme.
                const manual = appliance
                  ? register.find((item) => nameKey(item.name) === nameKey(appliance.label))
                      ?.programmes
                  : undefined;
                const uses = manual && manual.length > 0 ? programmeUses(group.cycles, manual) : [];
                const when =
                  group.count === 1
                    ? texts.once(formatLisbonTime(first), formatDuration(group.durationS))
                    : texts.times(group.count, formatDuration(group.durationS));
                return (
                  // By its first cycle only: naming splits a group, and the part with that cycle keeps the form.
                  <li key={first} className="offer">
                    <div className="offer-head">
                      <div>
                        <strong>{appliance ? appliance.label : groupPower(group)}</strong>
                        <span className="hint">
                          {[
                            appliance && groupPower(group),
                            kind && texts.loadKinds[kind],
                            Math.abs(group.powerW) < RELIABLE_W && texts.unreliable,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                      <p className="compare-amount has-info">
                        {costCents === null
                          ? formatKwh(group.energyWh, 2)
                          : formatDayCost(costCents)}
                        <span>{texts.inTheDay}</span>
                        {costCents === 0 && (
                          <InfoTip text={texts.underACent(formatKwh(group.energyWh, 2))} inline />
                        )}
                      </p>
                    </div>
                    <p className="offer-price-line">
                      {when}
                      {costCents !== null && ` · ${formatKwh(group.energyWh, 2)}`}
                      {appliance &&
                        appliance.minDurationS !== null &&
                        appliance.maxDurationS !== null &&
                        ` · ${texts.range(
                          formatDuration(appliance.minDurationS),
                          formatDuration(appliance.maxDurationS),
                        )}`}
                    </p>
                    {uses.map((use) => (
                      <p key={use.start} className="hint programme-line">
                        {group.count > 1 && `${formatLisbonTime(use.start)}: `}
                        {programmeText(use)}
                      </p>
                    ))}
                    {group.count > 1 && (
                      <details className="adjust group-cycles">
                        <summary>{texts.showEach(group.count)}</summary>
                        <ol>
                          {group.cycles.map((cycle) => (
                            <li key={cycle.start}>
                              {texts.once(
                                formatLisbonTime(cycle.start),
                                formatDuration(cycle.durationS),
                              )}
                              {` · ${formatKwh(cycle.energyWh, 2)}`}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                    {named && naming !== first && (
                      <button
                        type="button"
                        className="secondary group-name"
                        onClick={() => setNaming(first)}
                      >
                        {appliance ? texts.rename : texts.nameIt}
                      </button>
                    )}
                    {naming === first && (
                      <NameGroup group={group} current={appliance} onDone={() => setNaming(null)} />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <HowItWorks>
            <ul className="hint caveats">
              <li>{texts.how}</li>
              <li>{texts.limits}</li>
              <li>{texts.unreliableNote}</li>
              <li>{texts.loadKindNote}</li>
            </ul>
          </HowItWorks>
        </>
      )}
    </section>
  );
}
