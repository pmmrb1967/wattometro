// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Consumo": what the Shelly's per-second values show on a day (Phase 8.1):
 * the power steps (src/nilm/events.ts) and the on/off cycles they pair into
 * (src/nilm/cycles.ts), grouped by power. A way to check the detection; naming
 * the appliances is Phase 8.3. Only with a Shelly, for the last days.
 */
import { useEffect, useMemo, useState } from 'react';
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
import { pairCycles } from '../nilm/cycles';
import { detectEvents } from '../nilm/events';
import { mergePulses } from '../nilm/periodic';
import { decodeSecondsRecords, toSeries } from '../nilm/series';
import { groupCycles } from '../nilm/summary';
import type { HouseholdEnergy } from './household-energy';
import { loadDaySeconds } from './seconds-cache';
import { useSession } from './session';

const texts = t.dayEvents;
/** As far back as the per-second values are usually kept (and the cache keeps). */
const DAYS = 7;

type Loaded = { day: LocalDate; records: ArrayBuffer } | { day: LocalDate; error: true };

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
    return { minutes: minutes.length, events, cycles, groups: groupCycles(cycles) };
  }, [loaded]);

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
          {result.groups.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{texts.power}</th>
                    <th>{texts.times}</th>
                    <th>{texts.duration}</th>
                    <th>{texts.energy}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.groups.map((group) => (
                    <tr key={`${group.powerW}-${group.cycles[0]?.start}`}>
                      <td>
                        {group.statesW.length > 1
                          ? group.statesW.map((watts) => formatPower(watts)).join(' → ')
                          : group.pulsing
                            ? texts.pulsing(formatPower(group.powerW))
                            : formatPower(group.powerW)}
                      </td>
                      <td>
                        {group.count === 1
                          ? formatLisbonTime(group.cycles[0]!.start)
                          : texts.count(group.count)}
                      </td>
                      <td>{formatDuration(group.durationS)}</td>
                      <td>{formatKwh(group.energyWh, 2)}</td>
                    </tr>
                  ))}
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
