// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The "Início" card's instruments, hand-drawn in SVG: a dial for the power
 * against the contracted power and the meter's trip threshold
 * (docs/contracted-power.md), a ruler for the voltage against the legal band
 * (docs/voltage.md), and a bar for today's energy against a usual day.
 */
import { t } from '../i18n/pt-PT';
import { formatKva, formatKwh, formatPower, formatVolts } from '../lib/units';

const texts = t.gauges;

/** A point on the dial's half circle: fraction 0 on the left, 1 on the right. */
function polar(fraction: number, radius: number): [number, number] {
  const angle = Math.PI * (1 - Math.min(Math.max(fraction, 0), 1));
  return [100 + radius * Math.cos(angle), 100 - radius * Math.sin(angle)];
}

function arc(from: number, to: number, radius: number): string {
  const [x1, y1] = polar(from, radius);
  const [x2, y2] = polar(to, radius);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * The power of the last minute on a dial up to 1,5 × the contracted power:
 * within it, over it but tolerated (up to k ×), and where the meter cuts
 * after a while. A tick marks today's one-second peak.
 */
export function PowerGauge({
  powerW,
  peakW,
  contractedVa,
  k,
}: {
  powerW: number;
  peakW: number | null;
  contractedVa: number;
  k: number;
}) {
  const max = Math.max(contractedVa * 1.5, (peakW ?? 0) * 1.05, powerW * 1.05);
  const at = (value: number) => value / max;
  const tolerated = at(contractedVa * k);
  const zone =
    powerW > contractedVa * k ? 'trip' : powerW > contractedVa ? 'over' : ('within' as const);
  const [needleX, needleY] = polar(at(powerW), 62);
  const [peakX1, peakY1] = polar(at(peakW ?? 0), 66);
  const [peakX2, peakY2] = polar(at(peakW ?? 0), 90);
  const [labelX, labelY] = polar(at(contractedVa), 98);
  return (
    <svg
      className={`gauge gauge-${zone}`}
      viewBox="0 0 200 108"
      role="img"
      aria-label={texts.powerLabel(
        formatPower(powerW),
        formatKva(contractedVa),
        peakW === null ? null : formatPower(peakW),
      )}
    >
      <path className="gauge-track" d={arc(0, 1, 78)} />
      <path className="gauge-zone-over" d={arc(at(contractedVa), tolerated, 86)} />
      <path className="gauge-zone-trip" d={arc(tolerated, 1, 86)} />
      <path className="gauge-value" d={arc(0, at(powerW), 78)} />
      {peakW !== null && (
        <line className="gauge-peak" x1={peakX1} y1={peakY1} x2={peakX2} y2={peakY2} />
      )}
      <line className="gauge-needle" x1={100} y1={100} x2={needleX} y2={needleY} />
      <circle className="gauge-hub" cx={100} cy={100} r={5} />
      <text
        className="gauge-text"
        x={labelX}
        y={labelY}
        textAnchor={at(contractedVa) > 0.55 ? 'start' : 'middle'}
      >
        {formatKva(contractedVa)}
      </text>
    </svg>
  );
}

/**
 * The voltage on a ruler: the legal band (nominal ± bandPct) in the middle,
 * the last minute's lowest to highest as a bar, its mean as a dot.
 */
export function VoltageRuler({
  avgDv,
  minDv,
  maxDv,
  lowDv,
  highDv,
  nominalDv,
}: {
  avgDv: number;
  minDv: number;
  maxDv: number;
  lowDv: number;
  highDv: number;
  nominalDv: number;
}) {
  const from = Math.min(lowDv - 100, minDv);
  const to = Math.max(highDv + 100, maxDv);
  const x = (dv: number) => 4 + ((dv - from) / (to - from)) * 192;
  const outside = minDv < lowDv || maxDv > highDv;
  return (
    <svg
      className={outside ? 'ruler ruler-outside' : 'ruler'}
      viewBox="0 0 200 34"
      role="img"
      aria-label={texts.voltageLabel(formatVolts(avgDv), formatVolts(lowDv), formatVolts(highDv))}
    >
      <rect className="ruler-track" x={4} y={8} width={192} height={8} rx={4} />
      <rect className="ruler-band" x={x(lowDv)} y={8} width={x(highDv) - x(lowDv)} height={8} />
      <line className="ruler-tick" x1={x(nominalDv)} y1={5} x2={x(nominalDv)} y2={19} />
      <rect
        className="ruler-range"
        x={x(minDv) - 1}
        y={6}
        width={Math.max(x(maxDv) - x(minDv), 0) + 2}
        height={12}
        rx={3}
      />
      <circle className="ruler-value" cx={x(avgDv)} cy={12} r={5} />
      <text className="gauge-text ruler-text" x={x(lowDv)} y={31} textAnchor="middle">
        {formatVolts(lowDv)}
      </text>
      <text className="gauge-text ruler-text" x={x(nominalDv)} y={31} textAnchor="middle">
        {formatVolts(nominalDv)}
      </text>
      <text className="gauge-text ruler-text" x={x(highDv)} y={31} textAnchor="middle">
        {formatVolts(highDv)}
      </text>
    </svg>
  );
}

/**
 * Today's energy so far: its quarters as a small curve over the 24 hours, and,
 * with a usual day, a bar against it (the mark is the usual).
 */
export function TodayEnergy({
  energyWh,
  typicalWh,
  quarters,
  dayStart,
  dayLength,
}: {
  energyWh: number;
  typicalWh: number | null;
  quarters: readonly { ts: number; energyWh: number }[];
  dayStart: number;
  dayLength: number;
}) {
  const top = Math.max(...quarters.map((quarter) => quarter.energyWh), 1);
  const slots = dayLength / 900;
  const width = 200 / slots;
  const scale = typicalWh === null ? 0 : Math.max(energyWh, typicalWh) * 1.15;
  return (
    <>
      {typicalWh !== null && scale > 0 && (
        <svg
          className="today-bar"
          viewBox="0 0 200 14"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect className="today-track" x={0} y={2} width={200} height={10} rx={5} />
          <rect
            // Above only past the "as usual" margin of the text (t.now.vsUsual).
            className={energyWh * 100 >= typicalWh * 105 ? 'today-fill above' : 'today-fill'}
            x={0}
            y={2}
            width={(energyWh / scale) * 200}
            height={10}
            rx={5}
          />
          <line
            className="today-usual"
            x1={(typicalWh / scale) * 200}
            y1={0}
            x2={(typicalWh / scale) * 200}
            y2={14}
          />
        </svg>
      )}
      {quarters.length > 0 && (
        <svg
          className="today-curve"
          viewBox="0 0 200 32"
          preserveAspectRatio="none"
          role="img"
          aria-label={texts.curveLabel(formatKwh(energyWh, 2))}
        >
          <line className="today-axis" x1={0} y1={31.5} x2={200} y2={31.5} />
          {quarters.map((quarter) => (
            <rect
              key={quarter.ts}
              className="today-quarter"
              x={((quarter.ts - dayStart) / 900) * width}
              y={32 - (quarter.energyWh / top) * 30}
              width={Math.max(width - 0.4, 0.4)}
              height={(quarter.energyWh / top) * 30}
            />
          ))}
        </svg>
      )}
    </>
  );
}
