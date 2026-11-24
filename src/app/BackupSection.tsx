// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Definições › Dados e Shelly, with an account: the household copy (docs/backup.md).
 * Saving reads the house from the server, seals it in this browser with the
 * account password and writes it in the chosen folder (or the downloads);
 * putting one back joins it to the house, over several days if needed
 * (src/backup/restore.ts). Also when to be reminded, and BackupReminder for
 * the Início.
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import {
  checkBackupPassword,
  fetchBackupInfo,
  recordBackupDone,
  saveBackupReminder,
  type BackupInfo,
} from '../api/backup';
import { makeCopy } from '../backup/copy';
import {
  chooseFolder,
  canChooseFolder,
  downloadFile,
  keptFolder,
  mayWrite,
  writeInFolder,
} from '../backup/folder';
import {
  backupFileName,
  isBackupLate,
  remindDaysSchema,
  REMIND_CHOICES,
  type RemindDays,
} from '../backup/format';
import {
  cancelRestore,
  openCopy,
  RESTORE_EVENT,
  restoreProgress,
  runRestore,
  startRestore,
  type RestoreOutcome,
  type RestoreProgress,
} from '../backup/restore';
import { isDemo } from '../demo/mode';
import { t } from '../i18n/pt-PT';
import { isLocal } from '../local/mode';
import { formatLisbonDateTime, formatLisbonTime, lisbonToday } from '../lib/time';
import { SecretInput } from './SecretInput';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.backup;
const DAY = 86_400;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const count = new Intl.NumberFormat('pt-PT');
const daysSince = (at: number, now: number) => Math.max(0, Math.floor((now - at) / DAY));

/** The lines about the last copy: when, and whether it is late. */
function LastCopy({ info, now }: { info: BackupInfo; now: number }) {
  const late = isBackupLate(info.lastAt, info.remindDays, now);
  return (
    <>
      <p>
        {info.lastAt === null
          ? texts.never
          : texts.last(formatLisbonDateTime(info.lastAt), daysSince(info.lastAt, now))}
      </p>
      {late && info.lastAt !== null && (
        <p className="error" role="alert">
          {texts.late(info.remindDays)}
        </p>
      )}
    </>
  );
}

function RestoreState({
  progress,
  running,
  outcome,
  onGoOn,
  onCancel,
}: {
  progress: RestoreProgress;
  running: boolean;
  outcome: RestoreOutcome | null;
  onGoOn: () => void;
  onCancel: () => void;
}) {
  const date = formatLisbonDateTime(progress.createdAt);
  if (progress.finished) {
    return (
      <div className="form">
        <p className="success">{texts.finished(date, count.format(progress.written))}</p>
        <div className="actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {texts.dismiss}
          </button>
        </div>
      </div>
    );
  }
  const percent = progress.total === 0 ? 100 : Math.floor((progress.done / progress.total) * 100);
  const waiting = progress.waitUntil !== null && nowSeconds() < progress.waitUntil;
  return (
    <div className="form">
      <p role="status">{texts.progress(date, percent)}</p>
      <progress max={100} value={percent} />
      {progress.refused && (
        <p className="error" role="alert">
          {texts.refused}
        </p>
      )}
      {!progress.refused && waiting && progress.waitUntil !== null && (
        <p className="hint">{texts.waiting(formatLisbonTime(progress.waitUntil))}</p>
      )}
      {!progress.refused && !waiting && !running && outcome === 'stopped' && (
        <p className="hint">{texts.stopped}</p>
      )}
      <div className="actions">
        {!progress.refused && !waiting && !running && (
          <button type="button" className="primary" onClick={onGoOn}>
            {texts.goOn}
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={() => {
            if (progress.refused || window.confirm(texts.cancelConfirm)) onCancel();
          }}
        >
          {progress.refused ? texts.dismiss : texts.cancel}
        </button>
      </div>
    </div>
  );
}

export function BackupSection() {
  const { me, signOut } = useSession();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  /** What the copy is doing while busy. */
  const [doing, setDoing] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState<Status>({ kind: 'idle' });
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<Status>({ kind: 'idle' });
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);
  const busy = status.kind === 'busy' || restoreStatus.kind === 'busy';
  const now = nowSeconds();

  const fail = useCallback(
    (set: (status: Status) => void, text: string | null) => {
      if (text === null) signOut();
      else set({ kind: 'error', text });
    },
    [signOut],
  );

  useEffect(() => {
    let active = true;
    void fetchBackupInfo().then((outcome) => {
      if (active && outcome.ok) setInfo(outcome.info);
    });
    void keptFolder().then((kept) => {
      if (active) setFolder(kept);
    });
    const refresh = () =>
      void restoreProgress().then((kept) => {
        if (active) setProgress(kept);
      });
    refresh();
    window.addEventListener(RESTORE_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(RESTORE_EVENT, refresh);
    };
  }, []);

  async function pickFolder() {
    const chosen = await chooseFolder();
    if (chosen) setFolder(chosen);
  }

  async function save() {
    if (password === '') {
      setStatus({ kind: 'error', text: texts.wrongPassword });
      return;
    }
    // First, while the click still counts as the user's: the folder's permission.
    if (folder && !(await mayWrite(folder))) {
      setStatus({ kind: 'error', text: texts.folderDenied });
      return;
    }
    setStatus({ kind: 'busy' });
    setDoing(texts.saving('0'));
    try {
      const checked = await checkBackupPassword(password);
      if (!checked.ok) {
        fail(setStatus, failureText(checked, texts.wrongPassword));
        return;
      }
      const copy = await makeCopy(password, me.householdName, (rows) =>
        setDoing(texts.saving(count.format(rows))),
      );
      if (!copy.ok) {
        if (copy.reason === 'busy') {
          setStatus({ kind: 'error', text: texts.busy(formatLisbonTime(copy.retryAt)) });
        } else fail(setStatus, failureText(copy, texts.unavailable));
        return;
      }
      const name = backupFileName(lisbonToday());
      if (folder) {
        try {
          await writeInFolder(folder, name, copy.file);
        } catch {
          setStatus({ kind: 'error', text: texts.notWritten });
          return;
        }
      } else downloadFile(name, copy.file);
      const done = await recordBackupDone();
      if (done.ok) setInfo((previous) => previous && { ...previous, lastAt: done.lastAt });
      setPassword('');
      setStatus({
        kind: 'done',
        text: folder ? texts.saved(name, folder.name) : texts.downloaded(name),
      });
    } finally {
      setDoing(null);
    }
  }

  async function remind(event: ChangeEvent<HTMLSelectElement>) {
    const parsed = remindDaysSchema.safeParse(Number(event.target.value));
    if (!parsed.success) return;
    const days: RemindDays = parsed.data;
    setReminderStatus({ kind: 'busy' });
    const outcome = await saveBackupReminder(days);
    if (!outcome.ok) {
      fail(setReminderStatus, failureText(outcome, texts.unavailable));
      return;
    }
    setInfo((previous) => previous && { ...previous, remindDays: days });
    setReminderStatus({ kind: 'done', text: texts.reminderSaved });
  }

  const goOn = useCallback(async () => {
    setRunning(true);
    setOutcome(null);
    try {
      setOutcome(await runRestore(me.householdId));
    } finally {
      setRunning(false);
    }
  }, [me.householdId]);

  async function pickCopy(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (password === '') {
      setRestoreStatus({ kind: 'error', text: texts.needsPassword });
      return;
    }
    setRestoreStatus({ kind: 'busy' });
    setDoing(texts.opening);
    const opened = await openCopy(new Uint8Array(await file.arrayBuffer()), password).finally(() =>
      setDoing(null),
    );
    if (!opened.ok) {
      const reasons = {
        notACopy: texts.notACopy,
        unknownVersion: texts.unknownVersion,
        wrongPassword: texts.openWrongPassword,
        badContent: texts.badContent,
      };
      setRestoreStatus({ kind: 'error', text: reasons[opened.reason] });
      return;
    }
    const { header, total } = opened.copy;
    const question = texts.confirm(
      header.householdName,
      formatLisbonDateTime(header.createdAt),
      count.format(total),
    );
    if (!window.confirm(question)) {
      setRestoreStatus({ kind: 'idle' });
      return;
    }
    if (!(await startRestore(opened.copy, me.householdId))) {
      setRestoreStatus({ kind: 'error', text: texts.notKept });
      return;
    }
    setPassword('');
    setRestoreStatus({ kind: 'idle' });
    void goOn();
  }

  const share =
    info && info.rowsReadLimit > 0
      ? Math.max(1, Math.round((info.estimateRows / info.rowsReadLimit) * 100))
      : null;

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {info && <LastCopy info={info} now={now} />}

      {canChooseFolder() ? (
        <>
          <p>{folder ? texts.folder(folder.name) : texts.noFolder}</p>
          <p className="hint">{texts.folderNote}</p>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void pickFolder()}
            >
              {folder ? texts.changeFolder : texts.chooseFolder}
            </button>
          </div>
        </>
      ) : (
        <p className="hint">{texts.downloadsOnly}</p>
      )}

      <div className="form">
        <input type="email" autoComplete="username" hidden readOnly value={me.email} />
        <SecretInput
          label={texts.password}
          showLabel={texts.showPassword}
          hideLabel={texts.hidePassword}
          name="backup-password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="hint">{texts.passwordNote}</p>
        {info && share !== null && info.estimateRows > 0 && (
          <p className="hint">{texts.estimate(count.format(info.estimateRows), share)}</p>
        )}
        {doing !== null && <p role="status">{doing}</p>}
        <StatusLine status={status} />
        <div className="actions">
          <button type="button" className="primary" disabled={busy} onClick={() => void save()}>
            {texts.save}
          </button>
        </div>
      </div>

      {info && (
        <label>
          {texts.remind}
          <select value={info.remindDays} disabled={busy} onChange={(event) => void remind(event)}>
            {REMIND_CHOICES.map((days) => (
              <option key={days} value={days}>
                {texts.remindChoices[days]}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="hint">{texts.remindNote}</p>
      <StatusLine status={reminderStatus} />

      <h3>{texts.restoreTitle}</h3>
      <p className="hint">{texts.restoreIntro}</p>
      {progress ? (
        <RestoreState
          progress={progress}
          running={running}
          outcome={outcome}
          onGoOn={() => void goOn()}
          onCancel={() => void cancelRestore()}
        />
      ) : (
        <div className="actions">
          <label className="file-pick">
            <input
              type="file"
              accept=".wmbk,application/octet-stream"
              disabled={busy}
              onChange={(event) => void pickCopy(event)}
            />
            <span className="file-row">
              <span className="secondary">{texts.restorePick}</span>
            </span>
          </label>
        </div>
      )}
      <StatusLine status={restoreStatus} />
    </section>
  );
}

/** On the Início: the copy is late (only with an account and a reminder set). */
export function BackupReminder() {
  const [info, setInfo] = useState<BackupInfo | null>(null);
  useEffect(() => {
    if (isDemo() || isLocal()) return;
    let active = true;
    void fetchBackupInfo().then((outcome) => {
      if (active && outcome.ok) setInfo(outcome.info);
    });
    return () => {
      active = false;
    };
  }, []);
  const now = nowSeconds();
  if (!info || !isBackupLate(info.lastAt, info.remindDays, now)) return null;
  return (
    <p className="notice-box reminder" role="status">
      {info.lastAt === null ? texts.homeNever : texts.homeLate(daysSince(info.lastAt, now))}{' '}
      <Link to="/definicoes#dados">{texts.homeLink}</Link>
    </p>
  );
}
