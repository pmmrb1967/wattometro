// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Potência › one day of the house: the apparent power against the contracted
 * power, with the night's baseload, the peak and the off-peak hours (the
 * landing page's illustration, with real data). Dragging across the chart
 * shows that stretch closer, down to each second. From the per-second
 * values, so only with a Shelly and for the last days.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays } from '../domain/consumption';
import { NO_VALUE, powerDay, slicesMax, type PowerDay } from '../domain/power-day';
import type { Tariff } from '../domain/tariff';
import { meterPeriod } from '../domain/time-cycles';
import { t } from '../i18n/pt-PT';
import {
  formatLisbonTime,
  formatLocalDate,
  HOUR,
  lisbonOffset,
  lisbonToday,
  MINUTE,
  QUARTER_HOUR,
  type EpochSeconds,
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
/** The closest view: 5 minutes, about two pixels a second. */
const MIN_VIEW_S = 5 * MINUTE;
/** Steps of the clock times on the axis. */
const TIME_STEPS = [
  MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
];

type Loaded = { day: LocalDate; result: PowerDay | 'error' };

/** HH:MM:SS; Lisbon's offsets are whole minutes, so the seconds are the epoch's. */
function withSeconds(ts: EpochSeconds): string {
  return `${formatLisbonTime(ts)}:${String(ts % MINUTE).padStart(2, '0')}`;
}

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
  const svg = useRef<SVGSVGElement>(null);
  const PLOT_W = W - LEFT - 8;
  // The seconds of the day on show, [from, to); the whole day at first.
  const [view, setView] = useState<[number, number]>([0, data.length]);
  const [drag, setDrag] = useState<[number, number] | null>(null);
  const [v0, v1] = view;
  const span = v1 - v0;
  const zoomed = span < data.length;

  const contracted = tariff?.powerVa ?? null;
  const top = Math.max(contracted ?? 0, data.peak?.va ?? 0, 1000) * 1.08;
  const x = (second: number) => LEFT + ((second - v0) / span) * PLOT_W;
  // Square root: the baseload, a few percent of the peak, still has a height.
  const y = (va: number) => BOTTOM - Math.sqrt(Math.max(va, 0) / top) * (BOTTOM - TOP);

  // One point per pixel at most, each the highest second of its slice.
  const { line, area } = useMemo(() => {
    const count = Math.max(1, Math.min(Math.round(PLOT_W), span));
    const slices = slicesMax(data.va, v0, v1, count);
    const px = (index: number) => (LEFT + ((index + 0.5) / count) * PLOT_W).toFixed(1);
    const py = (va: number) =>
      (BOTTOM - Math.sqrt(Math.max(va, 0) / top) * (BOTTOM - TOP)).toFixed(1);
    const lines: string[] = [];
    const areas: string[] = [];
    let run: string[] = [];
    let first = 0;
    let last = 0;
    const close = () => {
      if (run.length === 0) return;
      const path = run.join('');
      lines.push(path);
      areas.push(`${path}L${px(last)},${BOTTOM}L${px(first)},${BOTTOM}Z`);
      run = [];
    };
    slices.forEach((va, index) => {
      if (va === null) {
        close();
        return;
      }
      if (run.length === 0) first = index;
      last = index;
      run.push(`${run.length ? 'L' : 'M'}${px(index)},${py(va)}`);
    });
    close();
    return { line: lines.join(''), area: areas.join('') };
  }, [data, v0, v1, span, top, PLOT_W]);

  // Off-peak hours, with a tariff that has them, as seconds of the day.
  const offPeak = useMemo(() => {
    if (!tariff || tariff.option === 'simple') return [];
    const ranges: [number, number][] = [];
    for (let second = 0; second < data.length; second += QUARTER_HOUR) {
      if (meterPeriod(data.start + second, tariff.cycle, tariff.periodsMap) !== 'empty') continue;
      const last = ranges.at(-1);
      if (last && last[1] === second) last[1] = second + QUARTER_HOUR;
      else ranges.push([second, second + QUARTER_HOUR]);
    }
    return ranges;
  }, [data, tariff]);

  // Clock times on the axis, at the finest step that leaves room for them.
  const marks = useMemo(() => {
    const room = Math.max(2, Math.floor(PLOT_W / 70));
    const step = TIME_STEPS.find((size) => span / size <= room) ?? 6 * HOUR;
    const list: number[] = [];
    for (let second = v0 - (v0 % MINUTE); second < v1; second += MINUTE) {
      const ts = data.start + second;
      if (second >= v0 && (ts + lisbonOffset(ts)) % step === 0) list.push(second);
    }
    return list;
  }, [data, v0, v1, span, PLOT_W]);

  // The highest second on show: the day's peak with the whole day.
  const peak = useMemo(() => {
    if (!zoomed) return data.peak;
    let best: PowerDay['peak'] = null;
    for (let second = v0; second < v1; second++) {
      const va = data.va[second] ?? NO_VALUE;
      if (va !== NO_VALUE && (!best || va > best.va)) best = { ts: data.start + second, va };
    }
    return best;
  }, [data, v0, v1, zoomed]);

  const ticks = TICKS_VA.filter(
    (va) => va < top && (contracted === null || Math.abs(y(va) - y(contracted)) > 12),
  ).filter((va, index, list) => index === 0 || y(list[index - 1]!) - y(va) > 18);
  // Today: up to now, not over the hours still to come.
  const lastSecond = Math.min(v1, data.va.findLastIndex((va) => va !== NO_VALUE) + 1);
  const peakSecond = peak ? peak.ts - data.start : null;
  const peakRight = peakSecond !== null && x(peakSecond) > LEFT + PLOT_W * 0.6;

  /** The second of the day under a pointer. */
  const secondAt = (clientX: number) => {
    const box = svg.current!.getBoundingClientRect();
    const px = ((clientX - box.left) * W) / box.width;
    return Math.round(v0 + Math.min(1, Math.max(0, (px - LEFT) / PLOT_W)) * span);
  };
  const finish = () => {
    if (drag) {
      const from = Math.min(...drag);
      const to = Math.max(...drag);
      // A tap is not a choice; a short drag shows at least MIN_VIEW_S around it.
      if (Math.abs(x(to) - x(from)) >= 8) {
        const size = Math.max(to - from, MIN_VIEW_S);
        const start = Math.round(
          Math.min(Math.max(0, (from + to) / 2 - size / 2), data.length - size),
        );
        setView([start, start + size]);
      }
    }
    setDrag(null);
  };

  return (
    <div ref={ref}>
      <div className="power-day-view">
        <span className="hint">
          {zoomed
            ? texts.range(formatLisbonTime(data.start + v0), formatLisbonTime(data.start + v1))
            : texts.zoomHint}
        </span>
        {zoomed && (
          <button type="button" className="secondary" onClick={() => setView([0, data.length])}>
            {texts.wholeDay}
          </button>
        )}
      </div>
      <svg
        ref={svg}
        className="power-day-chart"
        viewBox={`0 0 ${W} 228`}
        role="img"
        aria-label={texts.label}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const second = secondAt(event.clientX);
          setDrag([second, second]);
        }}
        onPointerMove={(event) => {
          if (drag) setDrag([drag[0], secondAt(event.clientX)]);
        }}
        onPointerUp={finish}
        onPointerCancel={() => setDrag(null)}
      >
        {offPeak
          .filter(([from, to]) => to > v0 && from < v1)
          .map(([from, to]) => (
            <rect
              key={from}
              className="day-offpeak"
              x={x(Math.max(from, v0))}
              y={TOP}
              width={x(Math.min(to, v1)) - x(Math.max(from, v0))}
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

        {data.baseloadW !== null && lastSecond > v0 && (
          <>
            <rect
              className="day-base"
              x={LEFT}
              y={y(data.baseloadW)}
              width={x(lastSecond) - LEFT}
              height={BOTTOM - y(data.baseloadW)}
            />
            <text className="day-note day-note-base" x={LEFT + 4} y={BOTTOM - 4}>
              {texts.base(formatPower(data.baseloadW))}
            </text>
          </>
        )}

        <path className="day-area" d={area} />
        <path className="power-day-line" d={line} />

        {peak && peakSecond !== null && (
          <>
            <circle className="day-peak" cx={x(peakSecond + 0.5)} cy={y(peak.va)} r={4} />
            <text
              className="day-note day-note-strong"
              x={x(peakSecond + 0.5) + (peakRight ? -8 : 8)}
              y={y(peak.va) + 3}
              textAnchor={peakRight ? 'end' : 'start'}
            >
              {texts.peak(
                formatKva(peak.va),
                span <= HOUR ? withSeconds(peak.ts) : formatLisbonTime(peak.ts),
              )}
            </text>
          </>
        )}

        {drag && (
          <rect
            className="power-day-pick"
            x={Math.min(x(drag[0]), x(drag[1]))}
            y={TOP}
            width={Math.abs(x(drag[1]) - x(drag[0]))}
            height={BOTTOM - TOP}
          />
        )}

        <line className="day-axis" x1={LEFT} x2={LEFT + PLOT_W} y1={BOTTOM} y2={BOTTOM} />
        {marks.map((second) => (
          <text
            key={second}
            className="day-hour"
            x={x(second)}
            y={BOTTOM + 14}
            textAnchor={x(second) < LEFT + 16 ? 'start' : 'middle'}
          >
            {formatLisbonTime(data.start + second)}
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
          {/* A new day starts on the whole day. */}
          <Chart key={day} data={data} tariff={tariff} />
          <p className="hint">{texts.caption}</p>
        </>
      )}
    </section>
  );
}
