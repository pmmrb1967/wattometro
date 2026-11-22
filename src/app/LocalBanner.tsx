// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The local mode's line at the top of every page: the household is only in this
 * browser, whether it has a copy, and whether it could be read at all; with
 * OneDrive linked, the sync and what stops it. Also where persistent storage is
 * asked for, once there is something to protect, and where the sync runner
 * lives while the local mode is open (src/local/cloud-runner.ts).
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime, formatLocalDate, lisbonDate } from '../lib/time';
import {
  askPersistence,
  LOCAL_CHANGED,
  localStatus,
  readBackupMarks,
  watchOtherTabs,
  type LocalStatus,
} from '../local/backup';
import { signInToOneDrive } from '../cloud/onedrive-auth';
import { clearCloudReturn, takeCloudReturn } from '../local/cloud-return';
import {
  clearRemovedMark,
  CLOUD_CHANGED,
  cloudStatus,
  cloudWorking,
  relinkAccount,
  removedMark,
  runWhileLinked,
  type CloudStatus,
} from '../local/cloud-runner';
import { reloadLocal } from '../local/server';
import { browserStore } from '../local/store';

const texts = t.local;
const cloudTexts = t.cloud.banner;

interface BannerState {
  local: LocalStatus;
  cloud: CloudStatus;
  /** The cloud house was found deleted or replaced, until linked again or closed. */
  removed: boolean;
  /** The last sync of a working cloud (it counts as the copy, localStatus); else undefined. */
  syncedAt?: number;
}

function useLocalStatus(): BannerState {
  const [status, setStatus] = useState<BannerState>({
    local: { kind: 'empty' },
    cloud: { linked: false },
    removed: false,
  });
  useEffect(() => {
    let active = true;
    let asked = false;
    const refresh = async () => {
      const [read, cloud] = await Promise.all([browserStore.load(), cloudStatus()]);
      if (!active) return;
      const now = Math.floor(Date.now() / 1000);
      const working = cloudWorking(cloud, now);
      const next = localStatus(read, readBackupMarks(), now, working);
      const state: BannerState = { local: next, cloud, removed: removedMark() !== null };
      if (working && cloud.linked) state.syncedAt = cloud.lastSyncAt;
      setStatus(state);
      if (!asked && next.kind !== 'empty' && next.kind !== 'unreadable') {
        asked = true;
        void askPersistence();
      }
    };
    const listener = () => void refresh();
    listener();
    window.addEventListener(LOCAL_CHANGED, listener);
    window.addEventListener(CLOUD_CHANGED, listener);
    // What this tab holds is out of date: the next request reads the house again.
    const stopWatching = watchOtherTabs(() => {
      reloadLocal();
      listener();
    });
    return () => {
      active = false;
      window.removeEventListener(LOCAL_CHANGED, listener);
      window.removeEventListener(CLOUD_CHANGED, listener);
      stopWatching();
    };
  }, []);
  return status;
}

/** The sync runs while the local mode is open and linked; back from "Ligar de novo", it continues. */
function useCloudRunner(): void {
  useEffect(() => {
    let active = true;
    const stop = runWhileLinked();
    void takeCloudReturn('reconnect').then((back) => {
      // StrictMode runs this twice: only the run still mounted takes the sign-in.
      if (!active || !back) return;
      clearCloudReturn('reconnect');
      void relinkAccount(back.accountId);
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
}

/** What stops the sync, above the copy reminder; null when nothing does. */
function CloudProblem({ cloud, removed }: { cloud: CloudStatus; removed: boolean }) {
  if (removed && !cloud.linked) {
    return (
      <p className="server-banner" role="alert">
        {cloudTexts.removed} <Link to="/definicoes#onedrive">{cloudTexts.removedLink}</Link>{' '}
        <button type="button" className="link-button" onClick={clearRemovedMark}>
          {cloudTexts.close}
        </button>
      </p>
    );
  }
  if (!cloud.linked) return null;
  switch (cloud.error) {
    case 'needs_reconnect':
      return (
        <p className="server-banner" role="alert">
          {cloudTexts.needs_reconnect}{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => void signInToOneDrive('reconnect')}
          >
            {cloudTexts.reconnect}
          </button>
        </p>
      );
    case 'quota_full':
    case 'newer_app':
    case 'unreadable_device':
      return (
        <p className="server-banner" role="alert">
          {cloudTexts[cloud.error]}
        </p>
      );
    case undefined:
    case 'offline':
    case 'throttled':
      // They pass on their own (the copy reminder comes back if they last).
      return null;
    default:
      // Anything else that lasts (a damaged chave.json, a conflict…): the sync stopped.
      return (
        <p className="server-banner" role="alert">
          {cloudTexts.failed}
        </p>
      );
  }
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
  const { local: status, cloud, removed, syncedAt } = useLocalStatus();
  useCloudRunner();
  if (status.kind === 'unreadable') {
    return (
      <p className="server-banner" role="alert">
        {message(status)} <Link to="/definicoes#dados">{texts.unreadableLink}</Link>
      </p>
    );
  }
  // A working cloud counts as the copy: the banner shows the sync instead.
  return (
    <>
      <CloudProblem cloud={cloud} removed={removed} />
      <div className="demo-banner" role="status">
        <span>
          {syncedAt !== undefined && status.kind !== 'empty'
            ? cloudTexts.synced(formatLisbonDateTime(syncedAt))
            : message(status)}
        </span>
        {status.kind !== 'empty' && syncedAt === undefined && (
          <Link to="/definicoes#dados" className="demo-exit">
            {texts.backupLink}
          </Link>
        )}
      </div>
    </>
  );
}
