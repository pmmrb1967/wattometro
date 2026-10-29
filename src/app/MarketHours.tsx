// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Tarifários": tomorrow's cheapest and dearest hours on the market (OMIE),
 * which the Worker reads every day (server/src/omie.ts); today's until
 * tomorrow's are published, around 12:00.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { priceWindows, WINDOW_HOURS } from '../domain/omie';
import { t } from '../i18n/pt-PT';
import { formatPricePerKwh, omieToMicro } from '../lib/money';
import { formatLisbonTime, lisbonDate, nextDate, startOfLisbonDay } from '../lib/time';
import { fetchOmieDays, type OmieDays } from './api';

const texts = t.tariffs.market;
const perKwh = (centsPerMwh: number) => formatPricePerKwh(omieToMicro(centsPerMwh));

export function MarketHours() {
  const [days, setDays] = useState<OmieDays | null>(null);
  const [now] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    let active = true;
    void fetchOmieDays().then((result) => {
      if (active) setDays(result);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!days) return null;
  const today = lisbonDate(now);
  const tomorrow = days.find((day) => day.date === nextDate(today));
  const day = tomorrow ?? days.find((item) => item.date === today);
  if (!day) return null;
  // Today: only the hours still to come.
  const from = tomorrow ? startOfLisbonDay(day.date) : Math.max(startOfLisbonDay(day.date), now);
  const windows = priceWindows(day.start, day.prices, from);
  if (!windows) return null;
  const { cheapest, dearest } = windows;

  return (
    <section className="card form" id="amanha">
      <h2>{tomorrow ? texts.tomorrowTitle : texts.todayTitle}</h2>
      <p>
        {texts.cheapest(
          WINDOW_HOURS,
          formatLisbonTime(cheapest.from),
          formatLisbonTime(cheapest.to),
          perKwh(cheapest.average),
        )}
      </p>
      <p>
        {texts.dearest(
          formatLisbonTime(dearest.from),
          formatLisbonTime(dearest.to),
          perKwh(dearest.average),
        )}
      </p>
      {!tomorrow && <p className="hint">{texts.notYet}</p>}
      <p className="hint">
        {texts.whoFor} <Link to="/definicoes#avisos">{texts.alertLink}</Link>
      </p>
    </section>
  );
}
