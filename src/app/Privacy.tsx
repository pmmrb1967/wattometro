// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The public privacy page (/privacidade), open with or without a session: what
 * exists, where it lives, who can read it. Adapted from Faturómetro
 * (src/landing/PrivacyPage.tsx). Also the privacy link of the app's
 * registration with Google (docs/google-drive.md).
 */
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';

export const PRIVACY_PATH = '/privacidade';

const copy = t.privacyPage;

export function Privacy() {
  return (
    <article className="card privacy">
      <h1>{copy.title}</h1>
      <p className="hint">{copy.updated}</p>
      <p>{copy.intro}</p>
      {copy.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <p>
        <Link to="/">{copy.back}</Link>
      </p>
    </article>
  );
}
