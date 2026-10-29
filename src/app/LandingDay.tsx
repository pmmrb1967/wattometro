// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The landing page's illustration: one made-up day of a house, every 15
 * minutes, with what the app reads in it (the base load, the peak, the
 * contracted power and the off-peak hours). A drawing, not data: no numbers.
 */
import { t } from '../i18n/pt-PT';

const copy = t.landing.day;

/** Watts every 15 minutes, 00:00 to 23:45: night, breakfast, a wash, lunch, dinner. */
const DAY_W = [
  170, 165, 160, 170, 165, 160, 175, 165, 160, 170, 165, 160, 170, 165, 160, 175, 165, 160, 170,
  165, 160, 175, 165, 170, 260, 380, 1900, 620, 420, 330, 300, 280, 260, 250, 240, 230, 300, 360,
  2250, 2300, 420, 380, 360, 300, 260, 250, 240, 260, 420, 900, 1800, 1500, 700, 380, 300, 260, 240,
  230, 240, 250, 260, 280, 300, 320, 380, 520, 640, 700, 760, 820, 900, 1300, 2600, 3200, 5100,
  3400, 1700, 1100, 800, 700, 620, 560, 500, 480, 440, 400, 340, 280, 220, 200, 190, 180, 175, 170,
  165, 170,
];

const W = 320;
const LEFT = 8;
const PLOT_W = 304;
const TOP = 18;
const BOTTOM = 128;
const MAX_W = 7400;
const CONTRACTED_W = 6900;
const BASE_W = 170;

const x = (index: number) => LEFT + (index / (DAY_W.length - 1)) * PLOT_W;
// Square root: the base load, a few percent of the peak, still has a height.
const y = (watts: number) => BOTTOM - Math.sqrt(watts / MAX_W) * (BOTTOM - TOP);
const hourX = (hour: number) => LEFT + (hour / 24) * PLOT_W;

const line = DAY_W.map(
  (watts, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(watts).toFixed(1)}`,
).join('');
const area = `${line}L${x(DAY_W.length - 1)},${BOTTOM}L${LEFT},${BOTTOM}Z`;
const peakIndex = DAY_W.indexOf(Math.max(...DAY_W));

export function LandingDay() {
  return (
    <figure className="landing-day">
      <figcaption className="landing-day-title">{copy.title}</figcaption>
      <svg viewBox={`0 0 ${W} 160`} role="img" aria-label={copy.label}>
        {/* Off-peak (daily cycle): 22:00 to 08:00. */}
        <rect
          className="day-offpeak"
          x={LEFT}
          y={TOP}
          width={hourX(8) - LEFT}
          height={BOTTOM - TOP}
        />
        <rect
          className="day-offpeak"
          x={hourX(22)}
          y={TOP}
          width={LEFT + PLOT_W - hourX(22)}
          height={BOTTOM - TOP}
        />

        <line
          className="day-limit"
          x1={LEFT}
          x2={LEFT + PLOT_W}
          y1={y(CONTRACTED_W)}
          y2={y(CONTRACTED_W)}
        />
        <text className="day-note" x={LEFT + 4} y={y(CONTRACTED_W) - 4}>
          {copy.contracted}
        </text>

        <path className="day-area" d={area} />
        <path className="day-line" d={line} pathLength={1} />

        <rect
          className="day-base"
          x={LEFT}
          y={y(BASE_W)}
          width={PLOT_W}
          height={BOTTOM - y(BASE_W)}
        />
        <text className="day-note day-note-base" x={hourX(1)} y={BOTTOM - 4}>
          {copy.base}
        </text>

        <circle className="day-peak" cx={x(peakIndex)} cy={y(DAY_W[peakIndex]!)} r={4} />
        <text
          className="day-note day-note-strong"
          x={x(peakIndex) - 8}
          y={y(DAY_W[peakIndex]!) + 3}
          textAnchor="end"
        >
          {copy.peak}
        </text>

        <text className="day-note" x={x(38) + 6} y={y(2300) + 3}>
          {copy.wash}
        </text>

        <line className="day-axis" x1={LEFT} x2={LEFT + PLOT_W} y1={BOTTOM} y2={BOTTOM} />
        {[0, 6, 12, 18, 24].map((hour) => (
          <text
            key={hour}
            className="day-hour"
            x={hourX(hour)}
            y={BOTTOM + 14}
            textAnchor={hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'}
          >
            {`${hour}h`}
          </text>
        ))}
        <rect className="day-offpeak day-key" x={LEFT} y={150} width={10} height={8} />
        <text className="day-hour" x={LEFT + 14} y={157}>
          {copy.offPeak}
        </text>
      </svg>
      <p className="landing-day-caption">{copy.caption}</p>
    </figure>
  );
}
