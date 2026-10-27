// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * "Calibrar aparelhos" (Phase 8.2): the user names an appliance and marks when
 * it ran, live ("Liguei agora" … "Desliguei agora") or by the times; the
 * per-second values of the run are kept on the server (POST /v1/signatures)
 * past the 90 days of readings_1s. Each kept run shows the cycle the detection
 * finds in it (src/nilm/signature.ts): the appliance's power and duration,
 * and from it the app recognises the appliance on every day (Phase 8.3).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { addDays } from '../domain/consumption';
import { t } from '../i18n/pt-PT';
import {
  formatDuration,
  formatLisbonDateTime,
  formatLisbonTime,
  lisbonLocalTime,
  lisbonToday,
  nextDate,
} from '../lib/time';
import { formatKwh, formatPower } from '../lib/units';
import { decodeSecondsRecords } from '../nilm/series';
import { signatureCycle } from '../nilm/signature';
import { classify, describeCycle } from '../nilm/appliances';
import type { Cycle } from '../nilm/cycles';
import {
  createSignature,
  deleteSignature,
  fetchSignatures,
  fetchSignatureSeconds,
  type Signature,
} from './api';
import { addAppliance, useAppliances } from './appliances-store';
import { KnownAppliances } from './KnownAppliances';
import {
  loadPending,
  MAX_RUN_S,
  nextTry,
  runFromTimes,
  savePending,
  type PendingCalibration,
} from './calibration';
import { useHouseholdEnergy } from './household-energy';
import { failureText, useSession } from './session';

const texts = t.calibrate;
/** As long as readings_1s keeps the per-second values. */
const SECONDS_DAYS = 90;

const nowSeconds = () => Math.floor(Date.now() / 1000);

type Found = Cycle | null | 'loading' | 'error';

/** A calibration's cycle: already recognised, or a button to recognise it on every day. */
function Recognise({ signature, cycle }: { signature: Signature; cycle: Cycle }) {
  const { me, signOut } = useSession();
  const known = useAppliances(me.householdId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (known.kind !== 'ready') return null;
  const appliance = classify([cycle], known.appliances).get(cycle.start);
  if (appliance) return <span className="hint">{texts.recognised(appliance.label)}</span>;

  async function recognise() {
    setBusy(true);
    const outcome = await addAppliance(signature.label, describeCycle(cycle));
    setBusy(false);
    if (outcome.ok) return;
    const text = failureText(outcome, t.dayEvents.tooMany);
    if (text === null) return signOut();
    setError(text);
  }

  return (
    <>
      <button
        type="button"
        className="link-button"
        disabled={busy}
        onClick={() => void recognise()}
      >
        {texts.recognise}
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}

function Library({
  signatures,
  found,
  onRemove,
}: {
  signatures: Signature[];
  found: Map<string, Found>;
  onRemove: (signature: Signature) => void;
}) {
  if (signatures.length === 0) return <p className="hint">{texts.empty}</p>;
  return (
    <ul className="signature-list">
      {signatures.map((signature) => {
        // A run without a cycle is null; one not analysed yet is not in the map.
        const cycle = found.has(signature.id) ? (found.get(signature.id) as Found) : 'loading';
        return (
          <li key={signature.id}>
            <div>
              <strong>{signature.label}</strong>
              <span className="hint">
                {formatLisbonDateTime(signature.from)}–{formatLisbonTime(signature.to)}
              </span>
              <span>
                {cycle === 'loading'
                  ? texts.loading
                  : cycle === 'error'
                    ? t.errors.unavailable
                    : cycle === null
                      ? texts.noCycle
                      : texts.cycle(
                          cycle.states.length > 1
                            ? cycle.states.map((state) => formatPower(state.powerW)).join(' → ')
                            : cycle.pulses
                              ? t.dayEvents.pulsing(formatPower(cycle.powerW))
                              : cycle.heats
                                ? t.dayEvents.programme(
                                    formatPower(cycle.powerW),
                                    cycle.heats.count,
                                  )
                                : formatPower(cycle.powerW),
                          formatDuration(cycle.durationS),
                          formatKwh(cycle.energyWh, 2),
                        )}
              </span>
              {cycle !== 'loading' && cycle !== 'error' && cycle !== null && (
                <Recognise signature={signature} cycle={cycle} />
              )}
            </div>
            <button type="button" className="secondary" onClick={() => onRemove(signature)}>
              {texts.remove}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Calibrate() {
  const { me, signOut } = useSession();
  const energy = useHouseholdEnergy();
  const meter = energy.houseShelly;
  const household = me.householdId;

  const [label, setLabel] = useState('');
  const [pending, setPendingState] = useState<PendingCalibration | null>(() =>
    loadPending(household),
  );
  const [now, setNow] = useState(nowSeconds);
  const [late, setLate] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [signatures, setSignatures] = useState<Signature[] | null>(null);
  const [found, setFound] = useState<Map<string, Found>>(new Map());
  const [today] = useState(lisbonToday);
  const [manual, setManual] = useState({ day: addDays(today, -1), from: '', to: '' });
  const pendingRef = useRef(pending);
  const lastTry = useRef<number | null>(null);
  const sending = useRef(false);

  const setPending = (next: PendingCalibration | null) => {
    pendingRef.current = next;
    lastTry.current = null;
    setLate(false);
    setPendingState(next);
    savePending(household, next);
  };

  const fail = (outcome: Parameters<typeof failureText>[0]) => {
    const text = failureText(outcome, texts.invalidRun);
    if (text === null) signOut();
    else setMessage({ text, error: true });
  };

  /** Adds a kept run to the list and finds its cycle. */
  const analyse = async (signature: Signature) => {
    const outcome = await fetchSignatureSeconds(signature.id);
    const result: Found = outcome.ok
      ? signatureCycle(decodeSecondsRecords(outcome.records), signature.from, signature.to)
      : 'error';
    setFound((map) => new Map(map).set(signature.id, result));
  };

  useEffect(() => {
    let active = true;
    void fetchSignatures().then((outcome) => {
      if (!active) return;
      if (!outcome.ok) {
        if (outcome.reason === 'unauthenticated') signOut();
        setSignatures([]);
        return;
      }
      setSignatures(outcome.signatures);
      for (const signature of outcome.signatures) void analyse(signature);
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  const keep = (signature: Signature) => {
    setSignatures((list) => [signature, ...(list ?? []).filter((s) => s.id !== signature.id)]);
    void analyse(signature);
  };

  /** Sends the marked run; false while the Shelly has not sent its minutes. */
  async function send(run: PendingCalibration & { to: number }): Promise<boolean> {
    const outcome = await createSignature({
      meter: run.meter,
      label: run.label,
      from: run.from,
      to: run.to,
    });
    if (outcome.ok) {
      keep(outcome.signature);
      setMessage({ text: texts.saved(run.label), error: false });
      return true;
    }
    if (outcome.reason === 'noSeconds') return false;
    fail(outcome);
    return true;
  }

  // A clock while a run is marked; once it ended, it is sent when its minutes should be there.
  const active = pending !== null;
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const current = nowSeconds();
      setNow(current);
      const run = pendingRef.current;
      if (!run || run.to === null || sending.current) return;
      const step = nextTry(run, lastTry.current, current);
      if (step === 'late') setLate(true);
      if (step !== 'now') return;
      lastTry.current = current;
      sending.current = true;
      void send({ ...run, to: run.to }).then((done) => {
        sending.current = false;
        if (done) setPending(null);
      });
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
    // The run, the last try and send() are read through refs and the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  function start() {
    const name = label.trim();
    if (!meter || name === '') return;
    setMessage(null);
    setPending({ meter, label: name, from: nowSeconds(), to: null });
    setLabel('');
  }

  function stop() {
    if (!pending) return;
    const to = nowSeconds();
    if (to - pending.from > MAX_RUN_S) {
      setMessage({ text: texts.tooLong, error: true });
      return;
    }
    setPending({ ...pending, to });
  }

  async function retry() {
    const run = pendingRef.current;
    if (!run || run.to === null) return;
    setLate(false);
    lastTry.current = nowSeconds();
    if (await send({ ...run, to: run.to })) setPending(null);
    else setLate(true);
  }

  async function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = label.trim();
    if (!meter || name === '') return;
    const run = runFromTimes(manual.day, manual.from, manual.to, lisbonLocalTime, nextDate);
    if (!run || run.to > nowSeconds() || run.to - run.from > MAX_RUN_S) {
      setMessage({ text: texts.invalidRun, error: true });
      return;
    }
    setMessage(null);
    const outcome = await createSignature({ meter, label: name, ...run });
    if (outcome.ok) {
      keep(outcome.signature);
      setMessage({ text: texts.saved(name), error: false });
      setLabel('');
    } else if (outcome.reason === 'noSeconds') {
      setMessage({ text: texts.noSeconds, error: true });
    } else {
      fail(outcome);
    }
  }

  async function remove(signature: Signature) {
    if (!window.confirm(texts.confirmRemove(signature.label))) return;
    const outcome = await deleteSignature(signature.id);
    if (outcome.ok) setSignatures((list) => (list ?? []).filter((s) => s.id !== signature.id));
    else fail(outcome);
  }

  const labels = [...new Set((signatures ?? []).map((signature) => signature.label))];
  const labelField = (
    <label>
      {texts.appliance}
      <input
        value={label}
        maxLength={60}
        list="calibrated-appliances"
        placeholder={texts.appliancePlaceholder}
        onChange={(event) => setLabel(event.target.value)}
      />
      <datalist id="calibrated-appliances">
        {labels.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </label>
  );

  return (
    <>
      <Link to="/consumo">{texts.back}</Link>
      <h1>{texts.title}</h1>
      <p className="lead">{texts.intro}</p>

      {energy.meters === null && !energy.error ? (
        <p className="hint">{t.loading}</p>
      ) : !meter ? (
        <section className="card">
          <p>{texts.noShelly}</p>
        </section>
      ) : (
        <section className="card">
          {pending === null ? (
            <div className="form">
              {labelField}
              <p className="hint">{texts.tip}</p>
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={label.trim() === ''}
                  onClick={start}
                >
                  {texts.start}
                </button>
              </div>
              <details>
                <summary>{texts.manual}</summary>
                <form className="form" onSubmit={(event) => void saveManual(event)}>
                  <p className="hint">{texts.manualIntro}</p>
                  <label>
                    {texts.day}
                    <input
                      type="date"
                      value={manual.day}
                      min={addDays(today, -(SECONDS_DAYS - 1))}
                      max={today}
                      onChange={(event) => setManual({ ...manual, day: event.target.value })}
                      required
                    />
                  </label>
                  <div className="calibrate-times">
                    <label>
                      {texts.from}
                      <input
                        type="time"
                        value={manual.from}
                        onChange={(event) => setManual({ ...manual, from: event.target.value })}
                        required
                      />
                    </label>
                    <label>
                      {texts.to}
                      <input
                        type="time"
                        value={manual.to}
                        onChange={(event) => setManual({ ...manual, to: event.target.value })}
                        required
                      />
                    </label>
                  </div>
                  <div className="actions">
                    <button type="submit" className="primary" disabled={label.trim() === ''}>
                      {texts.save}
                    </button>
                  </div>
                </form>
              </details>
            </div>
          ) : pending.to === null ? (
            <div className="form">
              <p role="status">
                {texts.running(
                  pending.label,
                  formatLisbonTime(pending.from),
                  formatDuration(Math.max(0, now - pending.from)),
                )}
              </p>
              <div className="actions">
                <button type="button" className="primary" onClick={stop}>
                  {texts.stop}
                </button>
                <button type="button" className="secondary" onClick={() => setPending(null)}>
                  {texts.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="form">
              <p role="status">{late ? texts.late : texts.waiting(pending.label)}</p>
              <div className="actions">
                {late && (
                  <button type="button" className="primary" onClick={() => void retry()}>
                    {texts.retry}
                  </button>
                )}
                <button type="button" className="secondary" onClick={() => setPending(null)}>
                  {texts.cancel}
                </button>
              </div>
            </div>
          )}
          {message && (
            <p
              className={message.error ? 'error' : 'success'}
              role={message.error ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2>{texts.library}</h2>
        {signatures === null ? (
          <p className="hint">{t.loading}</p>
        ) : (
          <Library signatures={signatures} found={found} onRemove={(s) => void remove(s)} />
        )}
      </section>

      <KnownAppliances />
    </>
  );
}
