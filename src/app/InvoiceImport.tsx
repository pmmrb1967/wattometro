// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Tariff: fill the form from a Repsol electricity invoice in PDF
 * (src/import/repsol-invoice.ts). The file is read in the browser, with
 * pdf.js loaded only now; neither the file nor its password leaves it.
 */
import { useState, type FormEvent } from 'react';
import { readRepsolInvoice, type InvoiceFields } from '../import/repsol-invoice';
import { t } from '../i18n/pt-PT';
import { formatLocalDate } from '../lib/time';
import { PdfPasswordError } from '../pdf/text';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.tariff.invoice;

/** What the form needs from the invoice; the rest of the form stays as it was. */
export interface InvoiceFill {
  fields: InvoiceFields;
  periodStart: string;
  periodEnd: string;
}

export function InvoiceImport({ onRead }: { onRead: (fill: InvoiceFill) => void }) {
  const [file, setFile] = useState<Uint8Array | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function read(data: Uint8Array, password?: string) {
    setStatus({ kind: 'busy' });
    try {
      const { readPdfText } = await import('../pdf/browser');
      const reading = readRepsolInvoice(await readPdfText(data, password));
      setNeedsPassword(false);
      if (!reading.ok) {
        setStatus({ kind: 'error', text: texts.problems[reading.problem] });
        return;
      }
      setStatus({
        kind: 'done',
        text: texts.read(formatLocalDate(reading.periodStart), formatLocalDate(reading.periodEnd)),
      });
      onRead(reading);
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        setNeedsPassword(true);
        setStatus(
          error.reason === 'incorrect'
            ? { kind: 'error', text: texts.wrongPassword }
            : { kind: 'idle' },
        );
        return;
      }
      setStatus({ kind: 'error', text: texts.unreadable });
    }
  }

  async function choose(chosen: File | undefined) {
    if (!chosen) return;
    const data = new Uint8Array(await chosen.arrayBuffer());
    setFile(data);
    setFileName(chosen.name);
    await read(data);
  }

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');
    if (file && password) void read(file, password);
  }

  return (
    <div className="invoice-import">
      <h3>{texts.title}</h3>
      <p className="hint">{texts.intro}</p>
      <label className="file-pick">
        {texts.choose}
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(event) => void choose(event.target.files?.[0])}
          disabled={status.kind === 'busy'}
        />
        <span className="file-row">
          <span className="secondary">{texts.pick}</span>
          <span className="hint">{fileName ?? texts.noFile}</span>
        </span>
      </label>
      {needsPassword && (
        <form className="form" onSubmit={unlock}>
          <label>
            {texts.password}
            <input name="password" type="password" autoComplete="off" required />
            <span className="hint">{texts.passwordHint}</span>
          </label>
          <button type="submit" disabled={status.kind === 'busy'}>
            {texts.open}
          </button>
        </form>
      )}
      {status.kind === 'busy' && <p className="hint">{texts.reading}</p>}
      <StatusLine status={status} />
    </div>
  );
}
