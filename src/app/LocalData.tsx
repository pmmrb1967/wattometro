// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Dados, in the local mode: the household is only in this browser
 * (src/local/), so a copy in a file, putting one back, and removing it; and,
 * where a cloud service is offered, its sync (CloudSection).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { forgetAiData } from '../ai/settings';
import { providerName } from '../cloud/providers';
import { t } from '../i18n/pt-PT';
import { clearBackupMarks, markBackup } from '../local/backup';
import { CLOUD_CHANGED, cloudStatus, restoreHouse, unlinkCloud } from '../local/cloud-runner';
import { LOCAL_ME, reloadLocal } from '../local/server';
import { readStored } from '../local/stored';
import { browserStore } from '../local/store';
import { lisbonToday } from '../lib/time';
import { CloudSection } from './CloudSection';
import { download } from './download';
import { StatusLine, type Status } from './StatusLine';

const texts = t.local.data;
const cloudTexts = t.cloud.data;

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function LocalDataSection() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [unreadable, setUnreadable] = useState(false);
  /** The linked service's name, false when not linked; null until known ("Apagar" and "Repor" wait for it). */
  const [linked, setLinked] = useState<string | false | null>(null);
  /** With the cloud linked, "Apagar" first asks where from. */
  const [removing, setRemoving] = useState<'idle' | 'choice' | 'cloud'>('idle');
  /** The linked service, in the texts only shown while linked. */
  const service = linked || '';

  useEffect(() => {
    let active = true;
    void browserStore.load().then((read) => {
      if (active) setUnreadable(read.kind === 'unreadable');
    });
    const refresh = () =>
      void cloudStatus().then((status) => {
        if (active) setLinked(status.linked && providerName(status.provider));
      });
    refresh();
    window.addEventListener(CLOUD_CHANGED, refresh);
    return () => {
      active = false;
      window.removeEventListener(CLOUD_CHANGED, refresh);
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
    if (!window.confirm(linked ? cloudTexts.restoreConfirm(linked) : texts.restoreConfirm)) return;
    // The house is now what that file holds, on every linked device too; counts as a copy.
    if (!(await restoreHouse(read.data))) {
      setStatus({ kind: 'error', text: texts.notKept });
      return;
    }
    // Every page reads the household again (the cycle on start sends it to the cloud).
    window.location.reload();
  }

  async function remove() {
    if (linked) {
      setRemoving('choice');
      return;
    }
    if (!window.confirm(texts.removeConfirm)) return;
    await clearHere();
  }

  /** "Só deste browser" unlinks this browser first; "Também da cloud" removes the cloud house first. */
  async function removeLinked(removeCloud: boolean) {
    setStatus({ kind: 'busy' });
    try {
      await unlinkCloud({ removeCloud });
    } catch {
      setStatus({ kind: 'error', text: cloudTexts.cloudNotRemoved(service) });
      return;
    }
    await clearHere();
  }

  function confirmCloudRemoval(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = String(new FormData(event.currentTarget).get('word')).trim().toLowerCase();
    if (word === cloudTexts.word) void removeLinked(true);
  }

  async function clearHere() {
    if (!(await browserStore.clear())) {
      setStatus({ kind: 'error', text: texts.notRemoved });
      return;
    }
    forgetAiData(LOCAL_ME.email);
    clearBackupMarks();
    reloadLocal();
    window.location.reload();
  }

  return (
    <>
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
              disabled={linked === null}
              onChange={(event) => void restore(event.target.files?.[0])}
            />
            <span className="file-row">
              <span className="secondary">{texts.restore}</span>
            </span>
          </label>
        </div>
        <StatusLine status={status} />
        {removing === 'idle' && (
          <button
            type="button"
            className="secondary danger"
            disabled={linked === null}
            onClick={() => void remove()}
          >
            {texts.remove}
          </button>
        )}
        {removing === 'choice' && (
          <>
            <p>{cloudTexts.removeChoice(service)}</p>
            <div className="actions">
              <button
                type="button"
                className="secondary danger"
                disabled={status.kind === 'busy'}
                onClick={() => void removeLinked(false)}
              >
                {cloudTexts.onlyHere}
              </button>
              <button
                type="button"
                className="secondary danger"
                onClick={() => setRemoving('cloud')}
              >
                {cloudTexts.alsoCloud}
              </button>
              <button type="button" className="secondary" onClick={() => setRemoving('idle')}>
                {t.cloud.cancel}
              </button>
            </div>
          </>
        )}
        {removing === 'cloud' && (
          <form className="form" onSubmit={confirmCloudRemoval}>
            <label>
              {cloudTexts.typeWord}
              <input name="word" autoComplete="off" required />
            </label>
            <div className="actions">
              <button type="submit" className="secondary danger" disabled={status.kind === 'busy'}>
                {cloudTexts.removeAll}
              </button>
              <button type="button" className="secondary" onClick={() => setRemoving('idle')}>
                {t.cloud.cancel}
              </button>
            </div>
          </form>
        )}
      </section>
      <CloudSection />
    </>
  );
}
