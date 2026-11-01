// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Dados, in the local mode: the household is only in this browser
 * (src/local/), so a copy in a file, putting one back, and removing it.
 */
import { useEffect, useState } from 'react';
import { forgetAiData } from '../ai/settings';
import { t } from '../i18n/pt-PT';
import { clearBackupMarks, markBackup } from '../local/backup';
import { LOCAL_ME, reloadLocal } from '../local/server';
import { readStored } from '../local/stored';
import { browserStore } from '../local/store';
import { lisbonToday } from '../lib/time';
import { StatusLine, type Status } from './StatusLine';

const texts = t.local.data;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function download(content: unknown, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(content)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function LocalDataSection() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    let active = true;
    void browserStore.load().then((read) => {
      if (active) setUnreadable(read.kind === 'unreadable');
    });
    return () => {
      active = false;
    };
  }, []);

  async function save() {
    const read = await browserStore.load();
    if (read.kind === 'empty') {
      setStatus({ kind: 'error', text: texts.nothingToSave });
    } else if (read.kind === 'ok') {
      download(read.data, texts.fileName(lisbonToday()));
      markBackup(nowSeconds());
    } else if (read.raw === undefined) {
      setStatus({ kind: 'error', text: texts.notRead });
    } else {
      // Not a copy that can be restored: it does not count as one.
      download(read.raw, texts.unreadableFileName(lisbonToday()));
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    let read;
    try {
      read = readStored(JSON.parse(await file.text()));
    } catch {
      read = null;
    }
    if (read?.kind !== 'ok') {
      setStatus({ kind: 'error', text: texts.badFile });
      return;
    }
    if (!window.confirm(texts.restoreConfirm)) return;
    if (!(await browserStore.save(read.data))) {
      setStatus({ kind: 'error', text: texts.notKept });
      return;
    }
    // The house is now what that file holds.
    markBackup(nowSeconds());
    reloadLocal();
    // Every page reads the household again.
    window.location.reload();
  }

  async function remove() {
    if (!window.confirm(texts.removeConfirm)) return;
    await browserStore.clear();
    forgetAiData(LOCAL_ME.email);
    clearBackupMarks();
    reloadLocal();
    window.location.reload();
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {unreadable && (
        <p className="server-banner" role="alert">
          {texts.unreadable}
        </p>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={() => void save()}>
          {unreadable ? texts.saveAsTheyAre : texts.save}
        </button>
        <label className="file-pick">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void restore(event.target.files?.[0])}
          />
          <span className="file-row">
            <span className="secondary">{texts.restore}</span>
          </span>
        </label>
      </div>
      <StatusLine status={status} />
      <button type="button" className="secondary danger" onClick={() => void remove()}>
        {texts.remove}
      </button>
    </section>
  );
}
