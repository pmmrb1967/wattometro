// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Security headers of the published app, written to dist/_headers at build
 * time; Cloudflare's static assets serve them. Adapted from Faturómetro.
 *
 * The app may only connect to itself, the project's API, the Anthropic API
 * (AI, with the user's own key) and Open-Meteo (weather, no personal data);
 * see CLAUDE.md, rule 1.
 */
export function contentSecurityPolicy(apiUrl: string): string {
  const apiOrigin = new URL(apiUrl).origin;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `connect-src 'self' ${apiOrigin} https://api.anthropic.com https://api.open-meteo.com https://archive-api.open-meteo.com`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function headersFile(apiUrl: string): string {
  return `/*
  Content-Security-Policy: ${contentSecurityPolicy(apiUrl)}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;
}
