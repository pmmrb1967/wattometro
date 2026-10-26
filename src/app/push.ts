// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * This browser's Web Push subscription (docs/alerts.md). The service worker
 * that shows the alerts is the PWA's (public/push-sw.js). On iPhone and iPad,
 * Safari only offers push to the app added to the home screen.
 */
import { manualBrowser, standalone } from './install';

export type PushSupport = 'supported' | 'needsInstall' | 'unsupported';

export function pushSupport(): PushSupport {
  const ios = manualBrowser(navigator.userAgent, navigator.maxTouchPoints) === 'ios';
  if (ios && !standalone()) return 'needsInstall';
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    ? 'supported'
    : 'unsupported';
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The service worker, or null where there is none (development, an old browser). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  return (await registration())?.pushManager.getSubscription() ?? null;
}

export class PushError extends Error {
  readonly reason: 'denied' | 'noWorker';
  constructor(reason: 'denied' | 'noWorker') {
    super(reason);
    this.reason = reason;
  }
}

/** Asks for permission (the browser's own dialog) and subscribes with the server's key. */
export async function subscribe(publicKey: string): Promise<PushSubscription> {
  const worker = await registration();
  if (!worker) throw new PushError('noWorker');
  if ((await Notification.requestPermission()) !== 'granted') throw new PushError('denied');
  return worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });
}

/** What the server needs to encrypt for this browser. */
export function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } {
  return {
    p256dh: toBase64Url(subscription.getKey('p256dh')),
    auth: toBase64Url(subscription.getKey('auth')),
  };
}
