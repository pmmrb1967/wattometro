// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Qualidade": outages of the year against the zone's standard, voltage per week
 * and episodes outside the band. Printed (or saved as PDF) it is a factual report
 * to attach to a complaint: dates, values and the sources of the limits.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  mondayOf,
  outagesFromBoots,
  QUALITY_ZONES,
  VOLTAGE_LIMITS,
  voltageEpisodes,
  weeklyCompliance,
  yearSummary,
  type Outage,
  type QualityZone,
} from '../domain/voltage';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import {
  formatDuration,
  formatLisbonDateTime,
  formatLocalDate,
  lisbonDate,
  lisbonParts,
  startOfLisbonDay,
} from '../lib/time';
import { formatVolts } from '../lib/units';
import {
  fetchBoots,
  fetchQuality,
  saveQualityZone,
  setBootExcluded,
  type Boot,
  type Quality as QualityData,
} from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.quality;
const WEEK_CHOICES = [1, 4, 12] as const;
const DAY = 86_400;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function meterName(meter: string, devices: QualityData['devices']): string {
  const [deviceId, channel] = meter.split(':');
  const name = devices.find((device) => device.id === deviceId)?.name ?? deviceId ?? meter;
  return channel && channel !== '0' ? `${name} · ${t.now.channel(Number(channel))}` : name;
}

function ZoneSection({
  zone,
  onChange,
}: {
  zone: QualityZone | null;
  onChange: (zone: QualityZone | null) => void;
}) {
  const { signOut } = useSession();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function change(value: string) {
    const next = (QUALITY_ZONES as string[]).includes(value) ? (value as QualityZone) : null;
    setStatus({ kind: 'busy' });
    const outcome = await saveQualityZone(next);
    if (outcome.ok) {
      onChange(next);
      setStatus({ kind: 'done', text: texts.zone.saved });
      return;
    }
    const text = failureText(outcome, t.errors.unavailable);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  return (
    <section className="card form">
      <h2>{texts.zone.title}</h2>
      <p className="print-only">{zone ? texts.zone.options[zone] : texts.outages.noZone}</p>
      <label className="no-print">
        {texts.zone.label}
        <select
          value={zone ?? ''}
          disabled={status.kind === 'busy'}
          onChange={(event) => void change(event.target.value)}
        >
          <option value="">{texts.zone.none}</option>
          {QUALITY_ZONES.map((value) => (
            <option key={value} value={value}>
              {texts.zone.options[value]}
            </option>
          ))}
        </select>
        <span className="hint">{texts.zone.hint}</span>
      </label>
      <div className="no-print">
        <StatusLine status={status} />
      </div>
    </section>
  );
}

function OutagesSection({
  outages,
  zone,
  year,
  onExclude,
}: {
  outages: Outage[] | null;
  zone: QualityZone | null;
  year: number;
  onExclude: (outage: Outage, excluded: boolean) => void;
}) {
  const inYear = (outages ?? []).filter((outage) => lisbonParts(outage.start).year === year);
  const summary = yearSummary(outages ?? [], year, zone);
  return (
    <section className="card">
      <h2>{texts.outages.title(year)}</h2>
      {outages === null ? (
        <p className="hint">{t.loading}</p>
      ) : (
        <>
          <ul className="facts">
            <li>{texts.outages.long(summary.longCount, formatDuration(summary.longSeconds))}</li>
            <li>{texts.outages.short(summary.shortCount)}</li>
            {summary.excludedCount > 0 && <li>{texts.outages.excluded(summary.excludedCount)}</li>}
          </ul>
          {zone && summary.standard ? (
            <>
              <p>
                {texts.outages.standard(
                  zone,
                  summary.standard.interruptions,
                  summary.standard.hours,
                )}
              </p>
              {summary.overCount && <p className="error">{texts.outages.overCount}</p>}
              {summary.overHours && <p className="error">{texts.outages.overHours}</p>}
              {!summary.overCount && !summary.overHours && (
                <p className="success">{texts.outages.within}</p>
              )}
              {(summary.overCount || summary.overHours) && (
                <p className="hint">{texts.outages.compensation}</p>
              )}
            </>
          ) : (
            <p className="hint">{texts.outages.noZone}</p>
          )}

          {inYear.length === 0 ? (
            <p>{texts.outages.none}</p>
          ) : (
            <div className="table-wrap">
              <table className="table stacked">
                <thead>
                  <tr>
                    <th>{texts.outages.columns.start}</th>
                    <th>{texts.outages.columns.end}</th>
                    <th>{texts.outages.columns.duration}</th>
                    <th>{texts.outages.columns.kind}</th>
                    <th>{texts.outages.columns.count}</th>
                  </tr>
                </thead>
                <tbody>
                  {inYear.map((outage) => (
                    <tr key={outage.start} className={outage.excluded ? 'muted' : undefined}>
                      <td>{formatLisbonDateTime(outage.start)}</td>
                      <td data-label={texts.outages.columns.end}>
                        {formatLisbonDateTime(outage.end)}
                      </td>
                      <td data-label={texts.outages.columns.duration}>
                        {formatDuration(outage.seconds)}
                      </td>
                      <td data-label={texts.outages.columns.kind}>
                        {outage.long ? texts.outages.kindLong : texts.outages.kindShort}
                      </td>
                      <td data-label={texts.outages.columns.count}>
                        <input
                          type="checkbox"
                          className="no-print"
                          aria-label={texts.outages.exclude}
                          checked={!outage.excluded}
                          onChange={(event) => onExclude(outage, !event.target.checked)}
                        />
                        {outage.excluded && (
                          <span className="print-only">{texts.outages.notCounted}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <HowItWorks>
            <ul className="hint caveats">
              {texts.outages.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ul>
          </HowItWorks>
        </>
      )}
    </section>
  );
}

function MeterVoltage({
  name,
  intervals,
  outside,
  outages,
  minMinutes,
}: {
  name: string;
  intervals: QualityData['intervals'][number]['intervals'];
  outside: QualityData['outside'][number]['minutes'];
  outages: Outage[];
  minMinutes: number;
}) {
  const weeks = weeklyCompliance(
    intervals.map(([ts, , avgDv]) => ({ ts, avgDv })),
    outages,
    VOLTAGE_LIMITS,
  );
  const episodes = voltageEpisodes(
    outside.map(([ts, minDv, maxDv]) => ({ ts, minDv, maxDv })),
    VOLTAGE_LIMITS,
    minMinutes,
  );
  const columns = texts.voltage.weekColumns;
  const episodeColumns = texts.voltage.episodeColumns;
  return (
    <>
      <h3>{name}</h3>
      <div className="table-wrap">
        <table className="table stacked">
          <thead>
            <tr>
              <th>{columns.week}</th>
              <th>{columns.evaluated}</th>
              <th>{columns.outside}</th>
              <th>{columns.result}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.week}>
                <td>{formatLocalDate(week.week)}</td>
                <td data-label={columns.evaluated}>
                  {texts.voltage.evaluated(week.evaluated, week.expected)}
                  {week.excluded > 0 && (
                    <span className="hint"> · {texts.voltage.excluded(week.excluded)}</span>
                  )}
                </td>
                <td data-label={columns.outside}>{week.outsideBand}</td>
                <td
                  className={week.meetsBand && week.meetsLimits ? 'success' : 'error'}
                  data-label={columns.result}
                >
                  {[
                    !week.meetsBand && texts.voltage.failsBand,
                    !week.meetsLimits && texts.voltage.failsLimits,
                  ]
                    .filter(Boolean)
                    .join('; ') || texts.voltage.meets}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>{texts.voltage.episodesTitle}</h4>
      {episodes.length === 0 ? (
        <p className="hint">{texts.voltage.noEpisodes}</p>
      ) : (
        <div className="table-wrap">
          <table className="table stacked">
            <thead>
              <tr>
                <th>{episodeColumns.start}</th>
                <th>{episodeColumns.duration}</th>
                <th>{episodeColumns.kind}</th>
                <th>{episodeColumns.value}</th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((episode) => (
                <tr key={`${episode.kind}:${episode.start}`}>
                  <td>{formatLisbonDateTime(episode.start)}</td>
                  <td data-label={episodeColumns.duration}>
                    {formatDuration(episode.end - episode.start)}
                  </td>
                  <td data-label={episodeColumns.kind}>
                    {episode.kind === 'low' ? texts.voltage.low : texts.voltage.high}
                  </td>
                  <td data-label={episodeColumns.value}>{formatVolts(episode.extremeDv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** The page's conclusion first: outages against the zone, the voltage against the standard. */
function QualityVerdict({
  data,
  outages,
  zone,
  year,
  weeks,
}: {
  data: QualityData | null;
  outages: Outage[] | null;
  zone: QualityZone | null;
  year: number;
  weeks: number;
}) {
  if (outages === null || data === null) return null;
  const summary = yearSummary(outages, year, zone);
  const over = summary.overCount || summary.overHours;
  const failing = data.intervals.reduce(
    (count, { intervals }) =>
      count +
      weeklyCompliance(
        intervals.map(([ts, , avgDv]) => ({ ts, avgDv })),
        outages,
        VOLTAGE_LIMITS,
      ).filter((week) => !week.meetsBand || !week.meetsLimits).length,
    0,
  );
  const verdict = texts.verdict;
  return (
    <section className="card">
      <p className={over ? 'verdict error' : 'verdict'}>
        {summary.standard
          ? over
            ? verdict.outagesOver(year)
            : verdict.outagesWithin(year, summary.longCount, summary.shortCount)
          : verdict.outages(year, summary.longCount, summary.shortCount)}
      </p>
      {data.intervals.length > 0 && (
        <p className={failing > 0 ? 'verdict error' : 'verdict'}>
          {failing > 0 ? verdict.voltageFails(weeks, failing) : verdict.voltageMeets(weeks)}
        </p>
      )}
      {(over || failing > 0) && <p className="hint">{verdict.complain}</p>}
    </section>
  );
}

function VoltageSection({
  data,
  weeks,
  onWeeks,
  outages,
}: {
  data: QualityData | null;
  weeks: number;
  onWeeks: (weeks: number) => void;
  outages: Outage[];
}) {
  const [minMinutes, setMinMinutes] = useState(1);
  return (
    <section className="card">
      <h2>{texts.voltage.title}</h2>
      <p className="hint">
        {texts.voltage.limits(
          formatVolts(VOLTAGE_LIMITS.lowDv),
          formatVolts(VOLTAGE_LIMITS.highDv),
          formatVolts(VOLTAGE_LIMITS.floorDv),
        )}
      </p>
      <div className="form inline-fields no-print">
        <label>
          {texts.voltage.period}
          <select value={weeks} onChange={(event) => onWeeks(Number(event.target.value))}>
            {WEEK_CHOICES.map((value) => (
              <option key={value} value={value}>
                {texts.voltage.weeks(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {texts.voltage.minMinutes}
          <input
            type="number"
            min={1}
            max={60}
            value={minMinutes}
            onChange={(event) =>
              setMinMinutes(Math.max(1, Math.floor(Number(event.target.value)) || 1))
            }
          />
        </label>
      </div>
      {data === null ? (
        <p className="hint">{t.loading}</p>
      ) : data.intervals.length === 0 ? (
        <p>{texts.voltage.noData}</p>
      ) : (
        data.intervals.map(({ meter, intervals }) => (
          <MeterVoltage
            key={meter}
            name={meterName(meter, data.devices)}
            intervals={intervals}
            outside={data.outside.find((item) => item.meter === meter)?.minutes ?? []}
            outages={outages}
            minMinutes={minMinutes}
          />
        ))
      )}
      {data?.outsideTruncated && <p className="error">{texts.voltage.truncated}</p>}
      <HowItWorks>
        <ul className="hint caveats">
          {texts.voltage.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      </HowItWorks>
    </section>
  );
}

export function Quality() {
  const { me, signOut } = useSession();
  const [weeks, setWeeks] = useState(4);
  // Tagged with the period it answers, so a new period shows "loading".
  const [loaded, setLoaded] = useState<{ from: number; quality: QualityData } | null>(null);
  const [zone, setZone] = useState<QualityZone | null>(null);
  const [boots, setBoots] = useState<Boot[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [now] = useState(nowSeconds);
  const year = lisbonParts(now).year;
  // Whole weeks: from the Monday (weeks − 1) weeks before this one.
  const from = startOfLisbonDay(mondayOf(lisbonDate(now - (weeks - 1) * 7 * DAY)));

  useEffect(() => {
    let active = true;
    void fetchQuality(from, now, VOLTAGE_LIMITS.lowDv, VOLTAGE_LIMITS.highDv).then((outcome) => {
      if (!active) return;
      if (outcome.ok) {
        setLoaded({ from, quality: outcome.quality });
        setZone(outcome.quality.zone);
      } else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [from, now, signOut]);

  useEffect(() => {
    let active = true;
    // The year and the voltage period, from a day before so an outage across midnight is whole.
    const start = Math.min(startOfLisbonDay(`${year}-01-01`), from) - DAY;
    void fetchBoots(start, now + 1).then((outcome) => {
      if (!active) return;
      if (outcome.ok) setBoots(outcome.boots);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [year, from, now, signOut]);

  const data = loaded?.from === from ? loaded.quality : null;
  const outages = useMemo(() => (boots ? outagesFromBoots(boots) : null), [boots]);

  async function exclude(outage: Outage, excluded: boolean) {
    for (const boot of outage.boots) {
      const outcome = await setBootExcluded(boot.deviceId, boot.bootAt, excluded);
      if (!outcome.ok) {
        const text = failureText(outcome, t.errors.unavailable);
        if (text === null) signOut();
        else setStatus({ kind: 'error', text });
        return;
      }
    }
    const changed = new Set(outage.boots.map((boot) => `${boot.deviceId}:${boot.bootAt}`));
    setBoots((list) =>
      (list ?? []).map((boot) =>
        changed.has(`${boot.deviceId}:${boot.bootAt}`) ? { ...boot, excluded } : boot,
      ),
    );
  }

  return (
    <>
      <div className="print-only report-head">
        <h1>{texts.reportTitle}</h1>
        <p>{texts.reportHousehold(me.householdName)}</p>
        <p>{texts.reportPeriod(formatLisbonDateTime(from), formatLisbonDateTime(now))}</p>
        <p>{texts.reportGenerated(formatLisbonDateTime(now))}</p>
      </div>
      <div className="no-print">
        <h1>{texts.title}</h1>
        <p className="hint">{texts.intro}</p>
      </div>
      <StatusLine status={status} />

      <QualityVerdict data={data} outages={outages} zone={zone} year={year} weeks={weeks} />
      <OutagesSection
        outages={outages}
        zone={zone}
        year={year}
        onExclude={(outage, excluded) => void exclude(outage, excluded)}
      />
      <VoltageSection data={data} weeks={weeks} onWeeks={setWeeks} outages={outages ?? []} />
      <ZoneSection zone={zone} onChange={setZone} />

      <section className="card">
        <h2>{texts.sourcesTitle}</h2>
        <ul className="hint caveats">
          {texts.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </section>

      <section className="card no-print">
        <p className="hint">{texts.printHint}</p>
        <button type="button" className="primary" onClick={() => window.print()}>
          {texts.print}
        </button>
      </section>
    </>
  );
}
