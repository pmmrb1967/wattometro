// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The local mode's line at the top of every page: the household is only in this
 * browser, whether it has a copy, and whether it could be read at all. Also
 * where persistent storage is asked for, once there is something to protect.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { formatLocalDate, lisbonDate } from '../lib/time';
import {
  askPersistence,
  LOCAL_CHANGED,
  localStatus,
  readBackupMarks,
  watchOtherTabs,
  type LocalStatus,
} from '../local/backup';
import { reloadLocal } from '../local/server';
import { browserStore } from '../local/store';

const texts = t.local;

function useLocalStatus(): LocalStatus {
  const [status, setStatus] = useState<LocalStatus>({ kind: 'empty' });
  useEffect(() => {
    let active = true;
    let asked = false;
    const refresh = async () => {
      const read = await browserStore.load();
      if (!active) return;
      const now = Math.floor(Date.now() / 1000);
      const next = localStatus(read, readBackupMarks(), now);
      setStatus(next);
      if (!asked && next.kind !== 'empty' && next.kind !== 'unreadable') {
        asked = true;
        void askPersistence();
      }
    };
    const listener = () => void refresh();
    listener();
    window.addEventListener(LOCAL_CHANGED, listener);
    // What this tab holds is out of date: the next request reads the house again.
    const stopWatching = watchOtherTabs(() => {
      reloadLocal();
      listener();
    });
    return () => {
      active = false;
      window.removeEventListener(LOCAL_CHANGED, listener);
      stopWatching();
    };
  }, []);
  return status;
}

function message(status: LocalStatus): string {
  switch (status.kind) {
    case 'due':
    case 'fresh':
      return texts.banner[status.kind](formatLocalDate(lisbonDate(status.at)));
    default:
      return texts.banner[status.kind];
  }
}

export function LocalBanner() {
  const status = useLocalStatus();
  if (status.kind === 'unreadable') {
    return (
      <p className="server-banner" role="alert">
        {message(status)} <Link to="/definicoes#dados">{texts.unreadableLink}</Link>
      </p>
    );
  }
  return (
    <div className="demo-banner" role="status">
      <span>{message(status)}</span>
      {status.kind !== 'empty' && (
        <Link to="/definicoes#dados" className="demo-exit">
          {texts.backupLink}
        </Link>
      )}
    </div>
  );
}
