// SPDX-License-Identifier: AGPL-3.0-or-later
// Adapted from Faturómetro (src/app/feedback.ts).
/**
 * Feedback by email: a mailto link that opens the user's own email app. The
 * app sends nothing; the "from" is whatever account that app uses. Subjects
 * start with "Wattómetro:" so they can be grouped on arrival.
 */
import { t } from '../i18n/pt-PT';
import { APP_COMMIT } from './build-info';

export const FEEDBACK_EMAIL = 'wattometro@outlook.com';

/** Technical lines that help with a report: version and page, never consumption data. */
export function feedbackBody(page: string, commit = APP_COMMIT): string {
  const copy = t.feedback;
  return [copy.bodyStart, '', '', copy.technical, copy.version(commit), copy.page(page)].join('\n');
}

export function feedbackLink(page: string): string {
  const subject = `Wattómetro: ${t.feedback.subject}`;
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackBody(page))}`;
}
