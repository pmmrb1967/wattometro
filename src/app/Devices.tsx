// SPDX-License-Identifier: AGPL-3.0-or-later
/** Settings → Devices: the Shellies that may send readings, and their tokens. */
import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n/pt-PT';
import { formatLisbonDateTime } from '../lib/time';
import { createDevice, fetchDevices, revokeDevice, type Device } from './api';
import { SOURCE_URL } from './build-info';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.devices;
const INSTRUCTIONS_URL = `${SOURCE_URL}/blob/main/shelly/README.md`;

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <code>{value}</code>
      <button type="button" className="secondary" onClick={copy}>
        {copied ? texts.copied : texts.copy}
      </button>
    </div>
  );
}

function DeviceItem({ device, onRemove }: { device: Device; onRemove: () => void }) {
  return (
    <li className="device">
      <div>
        <strong>{device.name}</strong>
        <p className="hint">
          {device.lastSeenAt === null
            ? texts.neverSeen
            : texts.lastSeen(formatLisbonDateTime(device.lastSeenAt))}
        </p>
        {device.model && device.scriptVersion && (
          <p className="hint">{texts.details(device.model, device.scriptVersion)}</p>
        )}
      </div>
      <button type="button" className="secondary" onClick={onRemove}>
        {texts.remove}
      </button>
    </li>
  );
}

export function DevicesSection() {
  const { signOut } = useSession();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null);

  useEffect(() => {
    let active = true;
    void fetchDevices().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setDevices(outcome.devices);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  const fail = (text: string | null) => {
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  };

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name')).trim();
    setStatus({ kind: 'busy' });
    const outcome = await createDevice(name);
    if (!outcome.ok) return fail(failureText(outcome, texts.invalid));
    form.reset();
    setStatus({ kind: 'idle' });
    setDevices((list) => [...(list ?? []), outcome.device]);
    setCreated({ name: outcome.device.name, token: outcome.token });
  }

  async function remove(device: Device) {
    if (!window.confirm(texts.removeConfirm(device.name))) return;
    const outcome = await revokeDevice(device.id);
    if (!outcome.ok) return fail(failureText(outcome, t.errors.unavailable));
    setDevices((list) => (list ?? []).filter((d) => d.id !== device.id));
  }

  return (
    <section className="card">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>

      {devices === null ? (
        <p className="hint">{t.loading}</p>
      ) : devices.length === 0 ? (
        <p>{texts.none}</p>
      ) : (
        <ul className="devices">
          {devices.map((device) => (
            <DeviceItem key={device.id} device={device} onRemove={() => void remove(device)} />
          ))}
        </ul>
      )}

      {created && (
        <div className="created" role="status">
          <h3>{texts.createdTitle(created.name)}</h3>
          <p className="error">{texts.createdWarning}</p>
          <CopyField label={texts.url} value={`${window.location.origin}/v1/ingest`} />
          <CopyField label={texts.token} value={created.token} />
          <a href={INSTRUCTIONS_URL} target="_blank" rel="noreferrer">
            {texts.instructions}
          </a>
          <button type="button" className="secondary" onClick={() => setCreated(null)}>
            {texts.done}
          </button>
        </div>
      )}

      <form className="form" onSubmit={add}>
        <label>
          {texts.name}
          <input name="name" placeholder={texts.namePlaceholder} maxLength={60} required />
        </label>
        <StatusLine status={status} />
        <button type="submit" className="primary" disabled={status.kind === 'busy'}>
          {status.kind === 'busy' ? texts.adding : texts.add}
        </button>
      </form>
    </section>
  );
}
