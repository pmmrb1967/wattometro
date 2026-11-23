// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The local mode's line at the top of every page: the household is only in this
 * browser, whether it has a copy, and whether it could be read at all; with
 * the cloud linked, the sync and what stops it. Also where persistent storage is
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
import { signInToCloud } from '../cloud/cloud-drives';
import { providerAvailable, providerName, type CloudProvider } from '../cloud/providers';
import { clearCloudReturn, takeCloudFailure, takeCloudReturn } from '../local/cloud-return';
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

/**
 * The sync runs while the local mode is open and linked; back from "Ligar de
 * novo", it continues. Gives the service whose sign-in or relink failed, if any.
 */
function useCloudRunner(): [CloudProvider | null, (provider: CloudProvider | null) => void] {
  const [failed, setFailed] = useState<CloudProvider | null>(null);
  useEffect(() => {
    let active = true;
    const stop = runWhileLinked();
    void takeCloudReturn('reconnect').then(async (back) => {
      // StrictMode runs this twice: only the run still mounted takes the sign-in.
      if (!active) return;
      if (!back) {
        const refused = await takeCloudFailure('reconnect');
        if (!active || refused === null) return;
        clearCloudReturn('reconnect');
        setFailed(refused);
        return;
      }
      clearCloudReturn('reconnect');
      relinkAccount(back).catch(() => {
        if (active) setFailed(back.provider);
      });
    });
    return () => {
      active = false;
      stop();
    };
  }, []);
  return [failed, setFailed];
}

/** What stops the sync, above the copy reminder; null when nothing does. */
function CloudProblem({
  cloud,
  removed,
  onFailed,
}: {
  cloud: CloudStatus;
  removed: boolean;
  onFailed: (provider: CloudProvider | null) => void;
}) {
  if (removed && !cloud.linked) {
    return (
      <p className="server-banner" role="alert">
        {cloudTexts.removed} <Link to="/definicoes#nuvem">{cloudTexts.removedLink}</Link>{' '}
        <button type="button" className="link-button" onClick={clearRemovedMark}>
          {cloudTexts.close}
        </button>
      </p>
    );
  }
  if (!cloud.linked) return null;
  const service = providerName(cloud.provider);
  switch (cloud.error) {
    case 'needs_reconnect':
      if (!providerAvailable(cloud.provider)) {
        // This build no longer offers the link's service: signing in again is not possible here.
        return (
          <p className="server-banner" role="alert">
            {cloudTexts.needs_reconnect(service)}{' '}
            <Link to="/definicoes#nuvem">{cloudTexts.settingsLink}</Link>
          </p>
        );
      }
      return (
        <p className="server-banner" role="alert">
          {cloudTexts.needs_reconnect(service)}{' '}
          <button
            type="button"
            className="link-button"
            // The link's own service: a return from another one never changes the link.
            onClick={() => {
              onFailed(null);
              signInToCloud(cloud.provider, 'reconnect').catch(() => onFailed(cloud.provider));
            }}
          >
            {cloudTexts.reconnect(service)}
          </button>
        </p>
      );
    case 'quota_full':
      return (
        <p className="server-banner" role="alert">
          {cloudTexts.quota_full(service)}
        </p>
      );
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
          {cloudTexts.failed(service)}
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
  const [failed, setFailed] = useCloudRunner();
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
      <CloudProblem cloud={cloud} removed={removed} onFailed={setFailed} />
      {failed !== null && (
        <p className="server-banner" role="alert">
          {t.cloud.failed(providerName(failed))}
        </p>
      )}
      <div className="demo-banner" role="status">
        <span>
          {syncedAt !== undefined && cloud.linked && status.kind !== 'empty'
            ? cloudTexts.synced(providerName(cloud.provider), formatLisbonDateTime(syncedAt))
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
