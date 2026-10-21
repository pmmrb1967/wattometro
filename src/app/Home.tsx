// SPDX-License-Identifier: AGPL-3.0-or-later
import { t } from '../i18n/pt-PT';
import { useSession } from './session';

export function Home() {
  const { me } = useSession();
  return (
    <>
      <h1>{me.householdName}</h1>
      <p className="badge">{t.home.status}</p>
      <p>{t.home.intro}</p>

      <h2>{t.home.comingTitle}</h2>
      <ul className="coming">
        {t.home.coming.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
