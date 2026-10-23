// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Small SVG charts drawn by hand (a few dozen bars or cells: no chart library).
 * Colours come from CSS classes, so they follow the light and dark themes.
 */
import type { BillingPeriod } from '../domain/tariff';

const WIDTH = 320;
const PLOT = 140;
const AXIS = 16;
const TOP = 14;

export interface Bar {
  key: string;
  /** Tooltip: what the bar is and how much. */
  title: string;
  segments: { period: BillingPeriod; value: number }[];
  /** Muted: a bar without (complete) data. */
  partial?: boolean;
}

/** Stacked bars from zero, with axis labels under some of them. */
export function BarChart({
  bars,
  ticks,
  maxLabel,
  label,
}: {
  bars: readonly Bar[];
  /** Index of the bar and its label. */
  ticks: readonly { index: number; label: string }[];
  /** The value at the top of the scale, formatted. */
  maxLabel: (max: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const totals = bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0));
  const max = Math.max(...totals, 1);
  const step = WIDTH / Math.max(bars.length, 1);
  const gap = bars.length > 40 ? 0.15 : 0.25;
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${WIDTH} ${TOP + PLOT + AXIS}`}
      role="img"
      aria-label={label}
    >
      <line className="chart-grid" x1={0} x2={WIDTH} y1={TOP} y2={TOP} />
      <text className="chart-text" x={0} y={TOP - 4}>
        {maxLabel(max)}
      </text>
      <line className="chart-axis" x1={0} x2={WIDTH} y1={TOP + PLOT} y2={TOP + PLOT} />
      {bars.map((bar, index) => {
        let y = TOP + PLOT;
        return (
          <g key={bar.key} className={bar.partial ? 'chart-partial' : undefined}>
            <title>{bar.title}</title>
            {/* Full-height hit area, so short bars still show their tooltip. */}
            <rect className="chart-hit" x={index * step} y={TOP} width={step} height={PLOT} />
            {bar.segments.map((segment) => {
              const height = (segment.value * PLOT) / max;
              y -= height;
              return (
                <rect
                  key={segment.period}
                  className={`period-${segment.period}`}
                  x={index * step + (step * gap) / 2}
                  y={y}
                  width={step * (1 - gap)}
                  height={height}
                />
              );
            })}
          </g>
        );
      })}
      {ticks.map((tick) => (
        <text
          key={tick.index}
          className="chart-text"
          x={Math.max(tick.index * step + step / 2, 0)}
          y={TOP + PLOT + AXIS - 3}
          // The first label starts at the edge, so it is not cut.
          textAnchor={tick.index * step < 12 ? 'start' : 'middle'}
        >
          {tick.label}
        </text>
      ))}
    </svg>
  );
}

const CELL = 12;
const ROW_LABEL = 28;

/** Rows × 24 hours, darker for more; empty where there is no data. */
export function HourHeatmap({
  rows,
  values,
  title,
  label,
}: {
  rows: readonly string[];
  values: readonly (readonly (number | null)[])[];
  title: (row: number, hour: number, value: number | null) => string;
  label: string;
}) {
  const max = Math.max(1, ...values.flat().map((value) => value ?? 0));
  const height = rows.length * CELL + AXIS;
  return (
    <svg
      className="chart heatmap"
      viewBox={`0 0 ${ROW_LABEL + 24 * CELL} ${height}`}
      role="img"
      aria-label={label}
    >
      {rows.map((row, rowIndex) => (
        <g key={row}>
          <text className="chart-text" x={0} y={rowIndex * CELL + CELL - 3}>
            {row}
          </text>
          {Array.from({ length: 24 }, (_, hour) => {
            const value = values[rowIndex]?.[hour] ?? null;
            return (
              <rect
                key={hour}
                className={value === null ? 'heat-empty' : 'heat-cell'}
                x={ROW_LABEL + hour * CELL + 0.5}
                y={rowIndex * CELL + 0.5}
                width={CELL - 1}
                height={CELL - 1}
                rx={2}
                fillOpacity={value === null ? undefined : 0.08 + (0.92 * value) / max}
              >
                <title>{title(rowIndex, hour, value)}</title>
              </rect>
            );
          })}
        </g>
      ))}
      {[0, 6, 12, 18].map((hour) => (
        <text key={hour} className="chart-text" x={ROW_LABEL + hour * CELL} y={height - 3}>
          {`${hour} h`}
        </text>
      ))}
    </svg>
  );
}
