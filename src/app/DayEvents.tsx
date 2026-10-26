// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": what the Shelly's per-second values show on a day (Phase 8.1):
 * the power steps (src/nilm/events.ts) and the on/off cycles they pair into
 * (src/nilm/cycles.ts), grouped by power, and the appliances they are
 * (src/nilm/appliances.ts): a group without a name has "O que é?". Only with a
 * Shelly, for the last days.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { addDays } from '../domain/consumption';
import {
  formatDuration,
  formatLisbonTime,
  formatLocalDate,
  lisbonToday,
  nextDate,
  startOfLisbonDay,
  type LocalDate,
} from '../lib/time';
import { formatKwh, formatPower } from '../lib/units';
import {
  applianceTotals,
  classify,
  describeGroup,
  groupAppliance,
  seriesEnergyWh,
} from '../nilm/appliances';
import { pairCycles } from '../nilm/cycles';
import { detectEvents } from '../nilm/events';
import { mergePulses } from '../nilm/periodic';
import { decodeSecondsRecords, toSeries } from '../nilm/series';
import { groupCycles, type CycleGroup } from '../nilm/summary';
import { addAppliance, useAppliances } from './appliances-store';
import type { HouseholdEnergy } from './household-energy';
import { loadDaySeconds } from './seconds-cache';
import { failureText, useSession } from './session';

const texts = t.dayEvents;
/** As far back as the per-second values are usually kept (and the cache keeps). */
const DAYS = 7;

type Loaded = { day: LocalDate; records: ArrayBuffer } | { day: LocalDate; error: true };

function groupPower(group: CycleGroup): string {
  return group.statesW.length > 1
    ? group.statesW.map((watts) => formatPower(watts)).join(' → ')
    : group.pulsing
      ? texts.pulsing(formatPower(group.powerW))
      : formatPower(group.powerW);
}

/** "O que é?": names a group; the name then applies to every cycle that fits, on any day. */
function NameGroup({ group, onDone }: { group: CycleGroup; onDone: () => void }) {
  const { signOut } = useSession();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    const outcome = await addAppliance(label.trim(), describeGroup(group));
    setBusy(false);
    if (outcome.ok) return onDone();
    const text = failureText(outcome, texts.tooMany);
    if (text === null) return signOut();
    setError(text);
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
        {texts.whatIsItLabel(groupPower(group))}
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
    const minutes = decodeSecondsRecords(loaded.records);
    const series = toSeries(
      minutes,
      startOfLisbonDay(loaded.day),
      startOfLisbonDay(nextDate(loaded.day)),
    );
    const events = detectEvents(series);
    const cycles = mergePulses(pairCycles(events));
    return {
      minutes: minutes.length,
      events,
      cycles,
      groups: groupCycles(cycles),
      energyWh: seriesEnergyWh(series),
    };
  }, [loaded]);

  const appliances = known.kind === 'ready' ? known.appliances : null;
  const named = useMemo(() => {
    if (!result || !appliances) return null;
    const byCycle = classify(result.cycles, appliances);
    return { byCycle, ...applianceTotals(result.cycles, byCycle, result.energyWh) };
  }, [result, appliances]);

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
                    <span>{texts.namedRow(total.cycles, formatKwh(total.energyWh, 2))}</span>
                  </li>
                ))}
              </ul>
              {named.explainedPct !== null && (
                <p className="hint">
                  {texts.explained(named.explainedPct, formatKwh(result.energyWh, 2))}
                </p>
              )}
            </div>
          )}
          {result.groups.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{texts.appliance}</th>
                    <th>{texts.power}</th>
                    <th>{texts.times}</th>
                    <th>{texts.duration}</th>
                    <th>{texts.energy}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((group) => {
                    const first = group.cycles[0]!.start;
                    const appliance = named ? groupAppliance(group, named.byCycle) : null;
                    return (
                      <Fragment key={`${group.powerW}-${first}`}>
                        <tr>
                          <td>
                            {appliance ? (
                              <strong>{appliance.label}</strong>
                            ) : named ? (
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => setNaming(naming === first ? null : first)}
                              >
                                {texts.whatIsIt}
                              </button>
                            ) : null}
                          </td>
                          <td>{groupPower(group)}</td>
                          <td>
                            {group.count === 1
                              ? formatLisbonTime(group.cycles[0]!.start)
                              : texts.count(group.count)}
                          </td>
                          <td>{formatDuration(group.durationS)}</td>
                          <td>{formatKwh(group.energyWh, 2)}</td>
                        </tr>
                        {naming === first && !appliance && (
                          <tr>
                            <td colSpan={5}>
                              <NameGroup group={group} onDone={() => setNaming(null)} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <ul className="hint caveats">
            <li>{texts.how}</li>
            <li>{texts.limits}</li>
          </ul>
        </>
      )}
    </section>
  );
}
