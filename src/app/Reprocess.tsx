// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Calibrar aparelhos" → "Reprocessar": works the last days out again from
 * their per-second values and replaces what the server kept (nilm-days.ts),
 * when the detection improved. Older days keep what they were stored with.
 */
import { useState } from 'react';
import { addDays } from '../domain/consumption';
import { t } from '../i18n/pt-PT';
import { lisbonToday, type LocalDate } from '../lib/time';
import { reprocessDays, SECONDS_DAYS } from './nilm-days';

const texts = t.reprocess;

export function Reprocess({
  householdId,
  meter,
  shellyFrom,
}: {
  householdId: string;
  meter: string;
  shellyFrom: LocalDate | null;
}) {
  const [done, setDone] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<{ error: boolean; text: string } | null>(null);
  const busy = done !== null;

  async function run() {
    const today = lisbonToday();
    const days: LocalDate[] = [];
    for (let back = SECONDS_DAYS - 1; back >= 1; back--) {
      const day = addDays(today, -back);
      if (!shellyFrom || day >= shellyFrom) days.push(day);
    }
    setResult(null);
    setTotal(days.length);
    setDone(0);
    const saved = await reprocessDays(householdId, meter, days, setDone);
    setDone(null);
    setResult(
      saved === null
        ? { error: true, text: texts.failed }
        : { error: false, text: texts.done(saved) },
    );
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <button type="button" className="secondary" disabled={busy} onClick={() => void run()}>
        {done !== null ? texts.working(done, total) : texts.action}
      </button>
      {result && (
        <p className={result.error ? 'error' : 'hint'} role={result.error ? 'alert' : 'status'}>
          {result.text}
        </p>
      )}
    </section>
  );
}
