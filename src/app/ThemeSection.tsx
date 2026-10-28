// SPDX-License-Identifier: AGPL-3.0-or-later
/** Settings → Aspeto: light, dark or as the device. */
import { useState } from 'react';
import { t } from '../i18n/pt-PT';
import { readTheme, saveTheme, THEMES, type Theme } from './theme';

const texts = t.settings.theme;

export function ThemeSection() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const choose = (next: Theme) => {
    saveTheme(next);
    setTheme(next);
  };
  return (
    <section className="card form">
      <h2>{texts.title}</h2>
      <p className="hint">{texts.intro}</p>
      <div className="segmented" role="group" aria-label={texts.title}>
        {THEMES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={theme === item}
            onClick={() => choose(item)}
          >
            {texts.options[item]}
          </button>
        ))}
      </div>
    </section>
  );
}
