// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where "Adicionar um Shelly" leads: Settings › Dados, or, in the local mode
 * (no server to send to), the README's own-installation steps.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n/pt-PT';
import { isLocal } from '../local/mode';
import { OWN_INSTALL_URL } from './build-info';

export function AddShellyLink({ children }: { children: ReactNode }) {
  if (isLocal()) {
    return (
      <a href={OWN_INSTALL_URL} target="_blank" rel="noreferrer">
        {t.local.addShelly}
      </a>
    );
  }
  return <Link to="/definicoes#dados">{children}</Link>;
}
