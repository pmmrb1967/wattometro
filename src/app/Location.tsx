// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Settings → Location: the locality of the house, for the weather used by the
 * bill forecast (docs/open-meteo.md). A locality, never an address or GPS.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { t } from '../i18n/pt-PT';
import { MIN_QUERY_LENGTH, searchLocalities, type Locality } from '../weather/geocoding';
import { fetchHouseholdLocation, saveHouseholdLocation, type HouseholdLocation } from './api';
import { failureText, useSession } from './session';
import { StatusLine, type Status } from './StatusLine';

const texts = t.settings.location;

export function LocationSection() {
  const { signOut } = useSession();
  const [location, setLocation] = useState<HouseholdLocation | null | undefined>(undefined);
  const [results, setResults] = useState<Locality[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

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

  async function save(next: HouseholdLocation | null) {
    setStatus({ kind: 'busy' });
    const outcome = await saveHouseholdLocation(next);
    if (outcome.ok) {
      setLocation(next);
      setResults(null);
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
      <StatusLine status={status} />
      {location && (
        <button type="button" className="secondary" disabled={busy} onClick={() => void save(null)}>
          {texts.clear}
        </button>
      )}
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
