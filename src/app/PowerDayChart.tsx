// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Potência › one day of the house: the highest apparent power of each minute,
 * against the contracted power, with the night's baseload, the day's peak and
 * the off-peak hours (the landing page's illustration, with real data). From
 * the per-second values, so only with a Shelly and for the last days.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { powerDay, type PowerDay } from '../domain/power-day';
import type { Tariff } from '../domain/tariff';
import { meterPeriod } from '../domain/time-cycles';
import { t } from '../i18n/pt-PT';
import { addDays } from '../domain/consumption';
import {
  formatLisbonTime,
  formatLocalDate,
  lisbonParts,
  lisbonToday,
  MINUTE,
  type LocalDate,
} from '../lib/time';
import { formatKva, formatPower } from '../lib/units';
import { decodeSecondsRecords } from '../nilm/series';
import { loadDaySeconds } from './seconds-cache';
import { useSession } from './session';

const texts = t.power.day;
/** Days to choose from, today included (the per-second values are kept 90 days). */
const DAYS = 7;

/** Drawn at the card's width, so the labels keep their size on a phone. */
const DEFAULT_W = 640;
const LEFT = 40;
const TOP = 16;
const BOTTOM = 196;
const TICKS_VA = [1000, 2000, 4000, 6000, 8000, 10_000, 15_000, 20_000];

type Loaded = { day: LocalDate; result: PowerDay | 'error' };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_W);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Chart({ data, tariff }: { data: PowerDay; tariff: Tariff | null }) {
  const { ref, width: W } = useWidth();
  const PLOT_W = W - LEFT - 8;
  const contracted = tariff?.powerVa ?? null;
  const top = Math.max(contracted ?? 0, data.peak?.va ?? 0, 1000) * 1.08;
  const x = (minute: number) => LEFT + (minute / data.length) * PLOT_W;
  // Square root: the baseload, a few percent of the peak, still has a height.
  const y = (va: number) => BOTTOM - Math.sqrt(Math.max(va, 0) / top) * (BOTTOM - TOP);

  const { line, area } = useMemo(() => {
    const runs: string[] = [];
    const areas: string[] = [];
    let run: [number, number][] = [];
    const close = () => {
      if (run.length === 0) return;
      const path = run.map(
        ([i, va], n) => `${n ? 'L' : 'M'}${x(i).toFixed(1)},${y(va).toFixed(1)}`,
      );
      runs.push(path.join(''));
      areas.push(
        `${path.join('')}L${x(run.at(-1)![0]).toFixed(1)},${BOTTOM}L${x(run[0]![0]).toFixed(1)},${BOTTOM}Z`,
      );
      run = [];
    };
    data.maxVa.forEach((va, index) => {
      if (va === null) close();
      else run.push([index, va]);
    });
    close();
    return { line: runs.join(''), area: areas.join('') };
    // x and y follow from data and top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, top, W]);

  // Off-peak hours, with a tariff that has them.
  const offPeak = useMemo(() => {
    if (!tariff || tariff.option === 'simple') return [];
    const ranges: [number, number][] = [];
    for (let minute = 0; minute < data.length; minute += 15) {
      const empty =
        meterPeriod(data.start + minute * MINUTE, tariff.cycle, tariff.periodsMap) === 'empty';
      const last = ranges.at(-1);
      if (!empty) continue;
      if (last && last[1] === minute) last[1] = minute + 15;
      else ranges.push([minute, minute + 15]);
    }
    return ranges;
  }, [data, tariff]);

  const hours = useMemo(() => {
    const marks: { minute: number; hour: number }[] = [];
    for (let minute = 0; minute < data.length; minute += 60) {
      const { hour } = lisbonParts(data.start + minute * MINUTE);
      if (hour % 6 === 0) marks.push({ minute, hour });
    }
    return [...marks, { minute: data.length, hour: 24 }];
  }, [data]);

  const ticks = TICKS_VA.filter(
    (va) => va < top && (contracted === null || Math.abs(y(va) - y(contracted)) > 12),
  ).filter((va, index, list) => index === 0 || y(list[index - 1]!) - y(va) > 18);
  // Today: up to now, not over the hours still to come.
  const lastMinute = data.maxVa.findLastIndex((va) => va !== null);
  const peakMinute = data.peak ? (data.peak.ts - data.start) / MINUTE : null;
  const peakRight = peakMinute !== null && peakMinute > data.length * 0.6;

  return (
    <div ref={ref}>
      <svg className="power-day-chart" viewBox={`0 0 ${W} 228`} role="img" aria-label={texts.label}>
        {offPeak.map(([from, to]) => (
          <rect
            key={from}
            className="day-offpeak"
            x={x(from)}
            y={TOP}
            width={x(to) - x(from)}
            height={BOTTOM - TOP}
          />
        ))}

        {ticks.map((va) => (
          <g key={va}>
            <line className="day-grid" x1={LEFT} x2={LEFT + PLOT_W} y1={y(va)} y2={y(va)} />
            <text className="day-hour" x={LEFT - 4} y={y(va) + 3} textAnchor="end">
              {formatKva(va)}
            </text>
          </g>
        ))}

        {contracted !== null && (
          <>
            <line
              className="day-limit"
              x1={LEFT}
              x2={LEFT + PLOT_W}
              y1={y(contracted)}
              y2={y(contracted)}
            />
            <text className="day-note" x={LEFT + 4} y={y(contracted) - 4}>
              {texts.contracted(formatKva(contracted))}
            </text>
          </>
        )}

        {data.baseloadW !== null && (
          <>
            <rect
              className="day-base"
              x={LEFT}
              y={y(data.baseloadW)}
              width={x(lastMinute + 1) - LEFT}
              height={BOTTOM - y(data.baseloadW)}
            />
            <text className="day-note day-note-base" x={LEFT + 4} y={BOTTOM - 4}>
              {texts.base(formatPower(data.baseloadW))}
            </text>
          </>
        )}

        <path className="day-area" d={area} />
        <path className="power-day-line" d={line} />

        {data.peak && peakMinute !== null && (
          <>
            <circle className="day-peak" cx={x(peakMinute)} cy={y(data.peak.va)} r={4} />
            <text
              className="day-note day-note-strong"
              x={x(peakMinute) + (peakRight ? -8 : 8)}
              y={y(data.peak.va) + 3}
              textAnchor={peakRight ? 'end' : 'start'}
            >
              {texts.peak(formatKva(data.peak.va), formatLisbonTime(data.peak.ts))}
            </text>
          </>
        )}

        <line className="day-axis" x1={LEFT} x2={LEFT + PLOT_W} y1={BOTTOM} y2={BOTTOM} />
        {hours.map(({ minute, hour }) => (
          <text
            key={minute}
            className="day-hour"
            x={x(minute)}
            y={BOTTOM + 14}
            textAnchor={minute === 0 ? 'start' : minute === data.length ? 'end' : 'middle'}
          >
            {`${hour}h`}
          </text>
        ))}
        {offPeak.length > 0 && (
          <>
            <rect className="day-offpeak day-key" x={LEFT} y={218} width={10} height={8} />
            <text className="day-hour" x={LEFT + 14} y={225}>
              {texts.offPeak}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

export function PowerDayChart({ meter, tariff }: { meter: string; tariff: Tariff | null }) {
  const { me } = useSession();
  const [today] = useState(lisbonToday);
  const days = useMemo(
    () => Array.from({ length: DAYS }, (_, back) => addDays(today, -back)),
    [today],
  );
  const [day, setDay] = useState<LocalDate>(today);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let current = true;
    void loadDaySeconds(me.householdId, meter, day).then((outcome) => {
      if (!current) return;
      setLoaded({
        day,
        result: outcome.ok ? powerDay(decodeSecondsRecords(outcome.records), day) : 'error',
      });
    });
    return () => {
      current = false;
    };
  }, [me.householdId, meter, day]);

  const data = loaded?.day === day ? loaded.result : null;
  const empty = data !== null && data !== 'error' && data.peak === null;

  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <label>
        {texts.dayLabel}
        <select value={day} onChange={(event) => setDay(event.target.value)}>
          {days.map((item) => (
            <option key={item} value={item}>
              {item === today ? texts.today : formatLocalDate(item)}
            </option>
          ))}
        </select>
      </label>
      {data === null && <p className="hint">{t.loading}</p>}
      {data === 'error' && <p className="error">{texts.error}</p>}
      {empty && <p className="hint">{texts.none}</p>}
      {data !== null && data !== 'error' && !empty && (
        <>
          <Chart data={data} tariff={tariff} />
          <p className="hint">{texts.caption}</p>
        </>
      )}
    </section>
  );
}
