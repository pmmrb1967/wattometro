// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": what the Shelly's per-second values show on a day (Phase 8.1):
 * the power steps (src/nilm/events.ts) and the on/off cycles they pair into
 * (src/nilm/cycles.ts), grouped by power, and the appliances they are
 * (src/nilm/appliances.ts), the dearest first, each with what it cost that
 * day: a group without a name has "Dar nome", a named one "Mudar o nome". Only
 * with a Shelly, for the last days.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { confusable, describeGroup, groupAppliance } from '../nilm/appliances';
import { tariffOn } from '../domain/tariff';
import { formatCents } from '../lib/money';
import { analyseDay, groupCostCents, nameDay } from '../nilm/day';
import { decodeSecondsRecords } from '../nilm/series';
import type { CycleGroup } from '../nilm/summary';
import type { Appliance } from '../nilm/appliances';
import { groupLoadKind } from '../nilm/load-kind';
import { addAppliance, useAppliances } from './appliances-store';
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

/** Below this, groups sit near the detector's floor (MIN_STEP_W) and the house's own noise. */
const RELIABLE_W = 60;

/**
 * "Dar nome": names a group; the name then applies to every cycle that fits, on
 * any day. On a group already named (`current`), corrects it: the new name gets
 * this group's descriptor, and each cycle goes to the closest appliance.
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
  const { signOut } = useSession();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const descriptor = describeGroup(group);
    const correcting = current !== null && !sameName(current.label, label);
    const outcome = await addAppliance(label.trim(), descriptor, { separate: correcting });
    setBusy(false);
    if (outcome.ok) {
      if (current && !sameName(current.label, label) && confusable(current, descriptor)) {
        return setWarning(texts.confusable(label.trim(), current.label));
      }
      return onDone();
    }
    const text = failureText(outcome, texts.tooMany);
    if (text === null) return signOut();
    setError(text);
  }

  if (warning) {
    return (
      <div className="name-group">
        <p className="warning">{warning}</p>
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
        if (label.trim() !== '') void save();
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
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy || label.trim() === ''}>
          {texts.name}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={onDone}>
          {texts.cancel}
        </button>
      </div>
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
  // Yesterday by default: a whole day.
  const [day, setDay] = useState<LocalDate>(() => days[1] ?? days[0] ?? today);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const known = useAppliances(me.householdId);
  // The group being named: its first cycle's start.
  const [naming, setNaming] = useState<number | null>(null);

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
  const tariff = loaded && energy.tariffs ? tariffOn(energy.tariffs, loaded.day) : null;
  const named = useMemo(
    () => (result && appliances ? nameDay(result, appliances, tariff) : null),
    [result, appliances, tariff],
  );

  // The dearest first (the most energy without a tariff).
  const groups = useMemo(() => {
    if (!result) return [];
    return result.groups
      .map((group) => ({
        group,
        costCents: tariff ? groupCostCents(group, result, tariff) : null,
      }))
      .sort(
        (a, b) => (b.costCents ?? 0) - (a.costCents ?? 0) || b.group.energyWh - a.group.energyWh,
      );
  }, [result, tariff]);

  if (!meter || days.length === 0) return null;
  const pending = !loaded || loaded.day !== day;

  return (
    <section className="card form" id="ao-segundo">
      <h2>{texts.title}</h2>
      <p className="lead">{texts.intro}</p>
      <p>
        <Link to="/consumo/calibrar">{t.calibrate.open}</Link>
      </p>
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
      {pending && <p className="hint">{t.loading}</p>}
      {!pending && loaded && 'error' in loaded && <p className="error">{texts.error}</p>}
      {!pending && result && result.minutes === 0 && <p>{texts.none}</p>}
      {!pending && result && result.minutes > 0 && (
        <>
          <p>{texts.summary(result.minutes, result.events.length, result.cycles.length)}</p>
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
                const when =
                  group.count === 1
                    ? texts.once(formatLisbonTime(first), formatDuration(group.durationS))
                    : texts.times(group.count, formatDuration(group.durationS));
                return (
                  <li key={`${group.powerW}-${first}`} className="offer">
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
