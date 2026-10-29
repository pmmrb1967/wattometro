// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/landing/Landing.tsx).
/**
 * The page before signing in: what the app is for, where the data comes from
 * and what it does with it; the demo; the login on "/entrar".
 */
import { Link, useLocation } from 'react-router';
import { InstallSection } from '../components/InstallSection';
import { t } from '../i18n/pt-PT';
import type { Me } from './api';
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
        <h1 className="landing-title">{copy.title}</h1>
        <p className="landing-lead">{copy.lead}</p>
        <div className="button-row">
          <Link to={SIGN_IN_PATH} className="primary button-link">
            {copy.signIn}
          </Link>
          <button type="button" className="secondary" onClick={onDemo}>
            {t.demo.title}
          </button>
          <a href="#como-funciona" className="secondary button-link">
            {copy.howItWorksLink}
          </a>
        </div>
        <p className="hint">{t.demo.intro}</p>
      </section>

      <section aria-labelledby="landing-features">
        <h2 id="landing-features">{copy.features.title}</h2>
        <div className="landing-grid">
          {copy.features.items.map((item) => (
            <article key={item.title} className="landing-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="landing-sources">
        <h2 id="landing-sources">{copy.sources.title}</h2>
        <div className="landing-grid landing-grid-two">
          {copy.sources.items.map((item) => (
            <article key={item.title} className="landing-item">
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="landing-privacy">
        <h2 id="landing-privacy">{copy.privacy.title}</h2>
        <ul className="landing-list">
          {copy.privacy.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section id="como-funciona" aria-labelledby="landing-steps">
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
