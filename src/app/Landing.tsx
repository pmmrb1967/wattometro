// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/landing/Landing.tsx).
/**
 * The page before signing in: what the app is for, where the data comes from
 * and what it does with it; the demo. The login is on "/entrar" (the top bar).
 */
import { Link, useLocation } from 'react-router';
import { InstallSection } from '../components/InstallSection';
import { t } from '../i18n/pt-PT';
import type { Me } from './api';
import { LandingDay } from './LandingDay';
import { Login } from './Login';

const copy = t.landing;

export const SIGN_IN_PATH = '/entrar';

export function Landing({
  onSignedIn,
  onDemo,
}: {
  onSignedIn: (me: Me) => void;
  onDemo: () => void;
}) {
  const { pathname } = useLocation();

  if (pathname === SIGN_IN_PATH) {
    return (
      <>
        <Link to="/" className="back-link">
          {copy.back}
        </Link>
        <Login onSignedIn={onSignedIn} />
      </>
    );
  }

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <h1 className="landing-title">{copy.title}</h1>
          <p className="landing-lead">{copy.lead}</p>
          <div className="landing-actions">
            <button type="button" className="primary" onClick={onDemo}>
              {t.demo.title}
            </button>
            <a href="#como-funciona" className="secondary button-link">
              {copy.howItWorksLink}
            </a>
          </div>
          <p className="hint">{t.demo.intro}</p>
        </div>
        <LandingDay />
      </section>

      <section className="landing-band" aria-labelledby="landing-features">
        <h2 id="landing-features">{copy.features.title}</h2>
        <div className="landing-grid">
          {copy.features.items.map((item) => (
            <article key={item.title} className="landing-feature">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band" aria-labelledby="landing-sources">
        <h2 id="landing-sources">{copy.sources.title}</h2>
        <div className="landing-grid landing-grid-two">
          {copy.sources.items.map((item, index) => (
            <article key={item.title} className="landing-source">
              <SourceIcon kind={index === 0 ? 'shelly' : 'file'} />
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-band landing-band-ink" aria-labelledby="landing-privacy">
        <h2 id="landing-privacy">{copy.privacy.title}</h2>
        <ul className="landing-privacy">
          {copy.privacy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="landing-band" id="como-funciona" aria-labelledby="landing-steps">
        <h2 id="landing-steps">{copy.steps.title}</h2>
        <ol className="landing-steps">
          {copy.steps.items.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <InstallSection />
    </div>
  );
}

/** A meter on a DIN rail, or a downloaded file. */
function SourceIcon({ kind }: { kind: 'shelly' | 'file' }) {
  return (
    <svg
      className="landing-source-icon"
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'shelly' ? (
        <>
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M3 9h3M18 9h3M3 15h3M18 15h3" />
          <path d="M12.5 7l-2.5 5h4l-2.5 5" />
        </>
      ) : (
        <>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h6" />
        </>
      )}
    </svg>
  );
}
