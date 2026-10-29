// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Dados, in the local mode: the household is only in this browser
 * (src/local/), so a copy in a file, putting one back, and removing it.
 */
import { useState } from 'react';
import { t } from '../i18n/pt-PT';
import { emptyLocalData, localDataSchema } from '../local/data';
import { reloadLocal } from '../local/server';
import { browserStore } from '../local/store';
import { lisbonToday } from '../lib/time';
import { StatusLine, type Status } from './StatusLine';

const texts = t.local.data;

export function LocalDataSection() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  async function save() {
    const data = (await browserStore.load()) ?? emptyLocalData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = texts.fileName(lisbonToday());
    link.click();
    URL.revokeObjectURL(url);
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    let parsed;
    try {
      parsed = localDataSchema.safeParse(JSON.parse(await file.text()));
    } catch {
      parsed = null;
    }
    if (!parsed?.success) {
      setStatus({ kind: 'error', text: texts.badFile });
      return;
    }
    if (!window.confirm(texts.restoreConfirm)) return;
    if (!(await browserStore.save(parsed.data))) {
      setStatus({ kind: 'error', text: texts.notKept });
      return;
    }
    reloadLocal();
    // Every page reads the household again.
    window.location.reload();
  }

  async function remove() {
    if (!window.confirm(texts.removeConfirm)) return;
    await browserStore.clear();
    reloadLocal();
    window.location.reload();
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <div className="actions">
        <button type="button" className="primary" onClick={() => void save()}>
          {texts.save}
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
