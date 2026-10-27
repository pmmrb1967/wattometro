// SPDX-License-Identifier: AGPL-3.0-or-later
/** "Consumo" with the house chosen: how far the Shelly is from E-Redes (src/domain/reconciliation.ts). */
import { useMemo } from 'react';
import { reconcile, type DayEnergy } from '../domain/reconciliation';
import { HowItWorks } from '../components/HowItWorks';
import { t } from '../i18n/pt-PT';
import { lisbonDate } from '../lib/time';
import { formatKwh } from '../lib/units';

const texts = t.consumption.reconcile;
const SHORT_DAY = new Intl.DateTimeFormat('pt-PT', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortDay = (date: string) => SHORT_DAY.format(new Date(`${date}T12:00:00Z`));
/** The most unusual days listed. */
const MAX_UNUSUAL = 5;

/** Tenths of a percent as "2,5 %" (unsigned) or "+2,5 %". */
function pct(tenths: number, signed: boolean): string {
  return `${new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'never',
  }).format(tenths / 10)} %`;
}

export function Reconciliation({
  compare,
  shellyName,
}: {
  compare: {
    eredes: readonly { ts: number }[];
    eredesDays: readonly DayEnergy[];
    shellyDays: readonly DayEnergy[];
  };
  shellyName: string;
}) {
  const result = useMemo(() => {
    // The E-Redes days' minutes, from their quarter hours (the daily totals do not say).
    const quarters = new Map<string, number>();
    for (const { ts } of compare.eredes) {
      const date = lisbonDate(ts);
      quarters.set(date, (quarters.get(date) ?? 0) + 1);
    }
    const eredesDays = compare.eredesDays.map(([date, wh]): DayEnergy => [
      date,
      wh,
      (quarters.get(date) ?? 0) * 15,
    ]);
    return reconcile(eredesDays, compare.shellyDays);
  }, [compare.eredes, compare.eredesDays, compare.shellyDays]);
  const firstShelly = compare.shellyDays[0]?.[0];
  return (
    <section className="card form">
      <h2>{texts.title(shellyName)}</h2>
      <p className="lead">{texts.intro}</p>
      {result.tenths === null ? (
        <p>
          {result.incomplete > 0
            ? texts.onlyIncomplete(result.incomplete)
            : firstShelly
              ? texts.none(shortDay(firstShelly))
              : null}
        </p>
      ) : (
        <>
          <p className="verdict">
            {texts.result(Math.sign(result.tenths) as 1 | 0 | -1, pct(result.tenths, false))}
          </p>
          <p>
            {texts.totals(
              result.days.length,
              formatKwh(result.eredesWh),
              formatKwh(result.shellyWh),
            )}
          </p>
          {result.incomplete > 0 && <p className="hint">{texts.incomplete(result.incomplete)}</p>}
          {result.unusual.length > 0 && (
            <>
              <h3>{texts.unusualTitle}</h3>
              <p className="hint">{texts.unusualIntro}</p>
              <ul>
                {result.unusual.slice(0, MAX_UNUSUAL).map((day) => (
                  <li key={day.date}>
                    {texts.unusualDay(shortDay(day.date), pct(day.tenths, true))}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <HowItWorks>
        <ul className="hint caveats">
          {result.tenths !== null && <li>{texts.normal}</li>}
          <li>{texts.rule}</li>
        </ul>
      </HowItWorks>
    </section>
  );
}
