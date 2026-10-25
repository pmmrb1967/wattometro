// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Small SVG charts drawn by hand (a few dozen bars or cells: no chart library).
 * Colours come from CSS classes, so they follow the light and dark themes.
 */
import type { BillingPeriod } from '../domain/tariff';

const WIDTH = 320;
const PLOT = 140;
const AXIS = 16;
const TOP = 22;
/** Room for the value labels left of the plot. */
const LEFT = 26;
const PLOT_WIDTH = WIDTH - LEFT;

/** A value axis from zero: round values (the last one is the top) and the unit. */
export interface Axis {
  ticks: readonly { value: number; label: string }[];
  unit: string;
}

/** Hairline grid at each value, labels on the left, and what the values are above them. */
function ValueAxis({ axis, caption }: { axis: Axis; caption: string }) {
  const top = axis.ticks.at(-1)?.value ?? 1;
  return (
    <>
      <text className="chart-text" x={0} y={TOP - 5}>
        {caption}
      </text>
      {axis.ticks.map((tick) => {
        const y = TOP + PLOT - (tick.value * PLOT) / top;
        return (
          <g key={tick.value}>
            <line
              className={tick.value === 0 ? 'chart-axis' : 'chart-grid'}
              x1={LEFT}
              x2={WIDTH}
              y1={y}
              y2={y}
            />
            <text className="chart-text" x={LEFT - 4} y={y + 3} textAnchor="end">
              {tick.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

/** Labels under the slots (hours, days); the first starts at the plot's edge, so it is not cut. */
function SlotTicks({
  ticks,
  step,
}: {
  ticks: readonly { index: number; label: string }[];
  step: number;
}) {
  return ticks.map((tick) => {
    const atEdge = tick.index * step < 12;
    return (
      <text
        key={tick.index}
        className="chart-text"
        x={LEFT + tick.index * step + (atEdge ? 0 : step / 2)}
        y={TOP + PLOT + AXIS - 3}
        textAnchor={atEdge ? 'start' : 'middle'}
      >
        {tick.label}
      </text>
    );
  });
}

export interface Bar {
  key: string;
  /** Tooltip: what the bar is and how much. */
  title: string;
  segments: { period: BillingPeriod; value: number }[];
  /** Muted: a bar without (complete) data. */
  partial?: boolean;
}

/** Stacked bars from zero, on a value axis, with labels under some of them. */
export function BarChart({
  bars,
  ticks,
  axis,
  caption,
  label,
}: {
  bars: readonly Bar[];
  /** Index of the bar and its label. */
  ticks: readonly { index: number; label: string }[];
  /** The value axis for the largest bar (src/app/chart-axis.ts). */
  axis: (max: number) => Axis;
  /** What the values are (e.g. "kWh por dia"), above the axis. */
  caption: (unit: string) => string;
  /** What the chart shows, for screen readers. */
  label: string;
}) {
  const totals = bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0));
  const scale = axis(Math.max(...totals, 0));
  const top = scale.ticks.at(-1)?.value ?? 1;
  const step = PLOT_WIDTH / Math.max(bars.length, 1);
  const gap = bars.length > 40 ? 0.15 : 0.25;
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${WIDTH} ${TOP + PLOT + AXIS}`}
      role="img"
      aria-label={label}
    >
      <ValueAxis axis={scale} caption={caption(scale.unit)} />
      {bars.map((bar, index) => {
        let y = TOP + PLOT;
        const x = LEFT + index * step;
        return (
          <g key={bar.key} className={bar.partial ? 'chart-partial' : undefined}>
            <title>{bar.title}</title>
            {/* Full-height hit area, so short bars still show their tooltip. */}
            <rect className="chart-hit" x={x} y={TOP} width={step} height={PLOT} />
            {bar.segments.map((segment) => {
              const height = (segment.value * PLOT) / top;
              y -= height;
              return (
                <rect
                  key={segment.period}
                  className={`period-${segment.period}`}
                  x={x + (step * gap) / 2}
                  y={y}
                  width={step * (1 - gap)}
                  height={height}
                />
              );
            })}
          </g>
        );
      })}
      <SlotTicks ticks={ticks} step={step} />
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

export interface Series {
  name: string;
  /** CSS class with the series colour (fill and stroke). */
  className: string;
  /** One value per slot; null where the series has no data. */
  values: readonly (number | null)[];
}

/**
 * Two or more series over the same slots: lines (many slots, e.g. the quarters
 * of a day; broken where a value is missing) or bars side by side (a week, a month).
 */
export function SeriesChart({
  slots,
  series,
  kind,
  ticks,
  axis,
  caption,
  label,
}: {
  /** Tooltip of each slot (all series' values). */
  slots: readonly { key: string; title: string }[];
  series: readonly Series[];
  kind: 'lines' | 'bars';
  ticks: readonly { index: number; label: string }[];
  axis: (max: number) => Axis;
  caption: (unit: string) => string;
  label: string;
}) {
  const scale = axis(
    Math.max(0, ...series.flatMap((item) => item.values.map((value) => value ?? 0))),
  );
  const top = scale.ticks.at(-1)?.value ?? 1;
  const step = PLOT_WIDTH / Math.max(slots.length, 1);
  const y = (value: number) => TOP + PLOT - (value * PLOT) / top;
  const gap = 0.25;
  const barWidth = (step * (1 - gap)) / Math.max(series.length, 1);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${WIDTH} ${TOP + PLOT + AXIS}`}
      role="img"
      aria-label={label}
    >
      <ValueAxis axis={scale} caption={caption(scale.unit)} />
      {series.map((item, seriesIndex) =>
        kind === 'lines' ? (
          <path
            key={item.name}
            className={`chart-line ${item.className}`}
            d={item.values
              .map((value, index) => {
                if (value === null) return '';
                const previous = index > 0 ? item.values[index - 1] : null;
                const command = previous === null || previous === undefined ? 'M' : 'L';
                const x = LEFT + index * step + step / 2;
                return `${command}${x.toFixed(1)},${y(value).toFixed(1)}`;
              })
              .join('')}
          />
        ) : (
          <g key={item.name} className={item.className}>
            {item.values.map((value, index) =>
              value === null ? null : (
                <rect
                  key={index}
                  x={LEFT + index * step + (step * gap) / 2 + seriesIndex * barWidth}
                  y={y(value)}
                  width={barWidth}
                  height={TOP + PLOT - y(value)}
                />
              ),
            )}
          </g>
        ),
      )}
      {slots.map((slot, index) => (
        <rect
          key={slot.key}
          className="chart-hit"
          x={LEFT + index * step}
          y={TOP}
          width={step}
          height={PLOT}
        >
          <title>{slot.title}</title>
        </rect>
      ))}
      <SlotTicks ticks={ticks} step={step} />
    </svg>
  );
}
