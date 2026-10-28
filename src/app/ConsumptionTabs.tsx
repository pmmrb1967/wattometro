// SPDX-License-Identifier: AGPL-3.0-or-later
/** "Visão geral · Relatório · Aparelhos": the pages of Consumo, the current one marked. */
import { NavLink } from 'react-router';
import { t } from '../i18n/pt-PT';

const texts = t.consumption.tabs;

export function ConsumptionTabs({ appliances }: { appliances: boolean }) {
  return (
    <nav className="segmented tabs no-print" aria-label={texts.label}>
      <NavLink to="/consumo" end>
        {texts.overview}
      </NavLink>
      <NavLink to="/consumo/relatorio">{texts.report}</NavLink>
      {appliances && <NavLink to="/consumo/aparelhos">{texts.appliances}</NavLink>}
    </nav>
  );
}
