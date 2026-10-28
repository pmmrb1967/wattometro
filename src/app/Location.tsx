// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Location: the locality of the house, for the weather used by the
 * bill forecast (docs/open-meteo.md). Found by name, or from this device's
 * position after the browser's permission and the user's confirmation; either
 * way only ~1 km precision is kept, never an address.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n/pt-PT';
import { mapLink, requestDevicePosition } from '../weather/device-location';
import { MIN_QUERY_LENGTH, searchLocalities, type Locality } from '../weather/geocoding';
import { fetchHouseholdLocation, saveHouseholdLocation, type HouseholdLocation } from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.location;

/** Hundredths of a degree as shown (e.g. -872 → "-8,72"). */
const coordinate = (cdeg: number) =>
  new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    cdeg / 100,
  );

export function LocationSection() {
  const { signOut } = useSession();
  const [location, setLocation] = useState<HouseholdLocation | null | undefined>(undefined);
  const [results, setResults] = useState<Locality[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  /** A device position waiting for the user's confirmation. */
  const [found, setFound] = useState<(HouseholdLocation & { accuracyM: number }) | null>(null);

  useEffect(() => {
    let active = true;
    void fetchHouseholdLocation().then((outcome) => {
      if (!active) return;
      if (outcome.ok) setLocation(outcome.location);
      else if (outcome.reason === 'unauthenticated') signOut();
      else setStatus({ kind: 'error', text: t.errors.unavailable });
    });
    return () => {
      active = false;
    };
  }, [signOut]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get('query')).trim();
    // The geocoding does not know Portuguese postal codes (docs/open-meteo.md).
    if (/^\d{4}(-\d{3})?$/.test(query)) {
      setStatus({ kind: 'error', text: texts.postalCode });
      return;
    }
    if (query.length < MIN_QUERY_LENGTH) {
      setStatus({ kind: 'error', text: texts.tooShort(MIN_QUERY_LENGTH) });
      return;
    }
    setStatus({ kind: 'busy' });
    const found = await searchLocalities(query);
    if (found === null) {
      setResults(null);
      setStatus({ kind: 'error', text: texts.searchFailed });
    } else {
      setResults(found);
      setStatus(found.length === 0 ? { kind: 'error', text: texts.notFound } : { kind: 'idle' });
    }
  }

  async function locate() {
    setResults(null);
    setFound(null);
    setStatus({ kind: 'busy' });
    const position = await requestDevicePosition();
    if (!position.ok) {
      setStatus({ kind: 'error', text: texts.deviceFailed[position.reason] });
      return;
    }
    setFound({
      name: texts.deviceName,
      latitudeCdeg: position.latitudeCdeg,
      longitudeCdeg: position.longitudeCdeg,
      accuracyM: position.accuracyM,
    });
    setStatus({ kind: 'idle' });
  }

  async function save(next: HouseholdLocation | null) {
    setStatus({ kind: 'busy' });
    const outcome = await saveHouseholdLocation(next);
    if (outcome.ok) {
      setLocation(next);
      setResults(null);
      setFound(null);
      setStatus({ kind: 'done', text: next ? texts.saved(next.name) : texts.cleared });
      return;
    }
    const text = failureText(outcome, texts.invalid);
    if (text === null) signOut();
    else setStatus({ kind: 'error', text });
  }

  const busy = status.kind === 'busy';
  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      {location !== undefined && <p>{location ? texts.current(location.name) : texts.none}</p>}
      <form className="inline-form" onSubmit={search}>
        <label>
          {texts.query}
          <input name="query" placeholder={texts.placeholder} maxLength={80} required />
        </label>
        <button type="submit" className="secondary" disabled={busy}>
          {texts.search}
        </button>
      </form>
      {results && results.length > 0 && (
        <ul className="choices">
          {results.map((locality) => (
            <li key={locality.id}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  void save({
                    name: locality.name,
                    latitudeCdeg: locality.latitudeCdeg,
                    longitudeCdeg: locality.longitudeCdeg,
                  })
                }
              >
                {locality.region ? `${locality.name} (${locality.region})` : locality.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">{texts.deviceIntro}</p>
      <div className="actions even">
        <button type="button" className="secondary" disabled={busy} onClick={() => void locate()}>
          {texts.device}
        </button>
        {location && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => void save(null)}
          >
            {texts.clear}
          </button>
        )}
      </div>
      {found && (
        <div className="confirm" role="group" aria-label={texts.confirmTitle}>
          <p>
            <strong>{texts.confirmTitle}</strong>
          </p>
          <p>
            {texts.confirmText(
              coordinate(found.latitudeCdeg),
              coordinate(found.longitudeCdeg),
              found.accuracyM,
            )}{' '}
            <a
              href={mapLink(found.latitudeCdeg, found.longitudeCdeg)}
              target="_blank"
              rel="noreferrer"
            >
              {texts.map}
            </a>
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() =>
                void save({
                  name: found.name,
                  latitudeCdeg: found.latitudeCdeg,
                  longitudeCdeg: found.longitudeCdeg,
                })
              }
            >
              {texts.confirm}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => setFound(null)}
            >
              {texts.cancel}
            </button>
          </div>
        </div>
      )}
      <StatusLine status={status} />
      <p className="hint">
        {texts.attribution}{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>{' '}
        ·{' '}
        <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
          GeoNames
        </a>
      </p>
    </section>
  );
}
