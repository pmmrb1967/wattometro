// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → E-Redes consumption: the .xlsx exported from the Balcão Digital
 * is read in the browser (src/import/eredes.ts); only the quarter hours go to
 * the server, in batches. The CPE and meter number in the file are not sent.
 */
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { eredesCoverage, type EredesDay } from '../domain/eredes-coverage';
import { parseEredesXlsx, type EredesFile } from '../import/eredes';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime, formatLocalDate } from '../lib/time';
import { formatKwh } from '../lib/units';
import {
  deleteEredesImport,
  EREDES_BATCH,
  fetchEredesSummary,
  importEredesBatch,
  type EredesSummary,
} from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.eredes;

function Period({ from, to }: { from: number; to: number }) {
  return <>{texts.period(formatLisbonDateTime(from), formatLisbonDateTime(to))}</>;
}

/** Lists shown in full up to this many; longer ones end with "e mais N". */
const SHOWN = 5;

function Items({ items }: { items: string[] }) {
  const shown = items.length > SHOWN ? items.slice(0, SHOWN - 1) : items;
  const rest = items.length - shown.length;
  return (
    <>
      {shown.join(' · ')}
      {rest > 0 && ` · ${texts.coverage.more(rest)}`}
    </>
  );
}

/** The gaps in what is stored: missing and incomplete days, estimated quarter hours. */
function Coverage({ days }: { days: readonly EredesDay[] }) {
  const coverage = useMemo(() => eredesCoverage(days), [days]);
  const copy = texts.coverage;
  const { missing, partial, estimated } = coverage;
  if (missing.length === 0 && partial.length === 0 && estimated.length === 0) {
    return <p className="hint">{copy.whole}</p>;
  }
  const missingDays = missing.reduce((sum, range) => sum + range.days, 0);
  const estimatedQuarters = estimated.reduce((sum, day) => sum + day.quarters, 0);
  return (
    <ul className="hint coverage">
      {missing.length > 0 && (
        <li>
          {copy.missing(missingDays)}{' '}
          <Items
            items={missing.map((range) =>
              copy.range(formatLocalDate(range.from), formatLocalDate(range.to), range.days),
            )}
          />
        </li>
      )}
      {partial.length > 0 && (
        <li>
          {copy.partial(partial.length)}{' '}
          <Items
            items={partial.map((day) =>
              copy.partialDay(formatLocalDate(day.day), day.missingQuarters),
            )}
          />
        </li>
      )}
      {(missing.length > 0 || partial.length > 0) && <li>{copy.gapsHint}</li>}
      {estimated.length > 0 && (
        <>
          <li>
            {copy.estimated(estimatedQuarters, estimated.length)}{' '}
            <Items
              items={estimated.map((day) =>
                copy.estimatedDay(formatLocalDate(day.day), day.quarters),
              )}
            />
          </li>
          <li>{copy.estimatedHint}</li>
        </>
      )}
    </ul>
  );
}

export function EredesImportSection() {
  const { signOut } = useSession();
  const [summary, setSummary] = useState<EredesSummary | null>(null);
  const [file, setFile] = useState<EredesFile | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  useEffect(() => {
    let active = true;
    void fetchEredesSummary().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setSummary(outcome.summary);
      else if (outcome.reason === 'unauthenticated') signOut();
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    setFile(null);
    setFileName(chosen?.name ?? null);
    if (!chosen) return;
    setStatus({ kind: 'busy' });
    const result = parseEredesXlsx(new Uint8Array(await chosen.arrayBuffer()));
    if (!result.ok) {
      setStatus({ kind: 'error', text: texts.errors[result.error](result.row ?? 0) });
      return;
    }
    setStatus({ kind: 'idle' });
    setFile(result);
  }

  async function send(chosen: EredesFile) {
    setStatus({ kind: 'busy' });
    let written = 0;
    for (let start = 0; start < chosen.quarters.length; start += EREDES_BATCH) {
      setProgress(start / chosen.quarters.length);
      const batch = chosen.quarters
        .slice(start, start + EREDES_BATCH)
        .map((quarter): [number, number, 0 | 1] => [
          quarter.ts,
          quarter.energyWh,
          quarter.estimated ? 1 : 0,
        ]);
      const outcome = await importEredesBatch(batch);
      if (!outcome.ok) {
        setProgress(null);
        const text = failureText(outcome, texts.rejected);
        if (text === null) signOut();
        else setStatus({ kind: 'error', text });
        return;
      }
      written += outcome.written;
    }
    setProgress(null);
    setFile(null);
    setStatus({ kind: 'done', text: texts.done(written) });
    const refreshed = await fetchEredesSummary();
    if (refreshed.ok) setSummary(refreshed.summary);
  }

  async function remove() {
    if (!window.confirm(texts.removeConfirm)) return;
    const outcome = await deleteEredesImport();
    if (outcome.ok) {
      setSummary({ quarters: 0, estimated: 0, energyWh: 0, from: null, to: null, days: [] });
      setStatus({ kind: 'done', text: texts.removed });
      return;
    }
    const text = failureText(outcome, t.errors.unavailable);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  const first = file?.quarters[0];
  const last = file?.quarters.at(-1);

  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <ol className="hint steps">
        {texts.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      {summary && summary.from !== null && summary.to !== null && (
        <div className="facts">
          <p>
            <strong>{texts.stored}</strong> <Period from={summary.from} to={summary.to} />
          </p>
          <p className="hint">
            {texts.storedDetail(
              formatKwh(summary.energyWh, 0),
              summary.quarters,
              summary.estimated,
            )}
          </p>
          <Coverage days={summary.days} />
        </div>
      )}

      <label className="file-pick">
        {texts.choose}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => void choose(event)}
          disabled={status.kind === 'busy'}
        />
        <span className="file-row">
          <span className="secondary">{texts.pick}</span>
          <span className="hint">{fileName ?? texts.noFile}</span>
        </span>
      </label>

      {file && first && last && (
        <div className="facts">
          <p>
            <strong>{texts.inFile}</strong> <Period from={first.ts} to={last.ts + 900} />
          </p>
          <ul className="hint">
            <li>{texts.fileEnergy(formatKwh(file.energyWh, 0), file.quarters.length)}</li>
            {file.estimated > 0 && <li>{texts.fileEstimated(file.estimated)}</li>}
            {file.missing > 0 && <li>{texts.fileMissing(file.missing)}</li>}
          </ul>
          <button
            type="button"
            className="primary"
            onClick={() => void send(file)}
            disabled={status.kind === 'busy'}
          >
            {texts.send}
          </button>
        </div>
      )}

      {progress !== null && (
        <p className="hint" role="status">
          {texts.sending(Math.round(progress * 100))}
        </p>
      )}
      <StatusLine status={status} />

      {summary && summary.quarters > 0 && (
        <button type="button" className="secondary danger" onClick={() => void remove()}>
          {texts.remove}
        </button>
      )}
    </section>
  );
}
