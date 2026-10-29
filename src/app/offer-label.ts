// SPDX-License-Identifier: AGPL-3.0-or-later
import type { OfferResult } from '../domain/compare';
import { t } from '../i18n/pt-PT';

/** "Simples", or "Bi-horário · ciclo diário". */
export const optionLabel = (result: Pick<OfferResult, 'option' | 'cycle'>) =>
  result.option === 'simple'
    ? t.settings.tariff.options.simple
    : `${t.settings.tariff.options[result.option]} · ${t.settings.tariff.cycles[result.cycle].toLowerCase()}`;
