// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Security headers of the published app, written to dist/_headers at build
 * time; Cloudflare's static assets serve them. Adapted from Faturómetro.
 *
 * The app may only connect to itself (the API is same-origin, under /v1), the
 * Anthropic API (AI, with the user's own key) and Open-Meteo (weather, no
 * personal data); see CLAUDE.md, rule 1.
 */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "connect-src 'self' https://api.anthropic.com https://api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function headersFile(): string {
  return `/*
  Content-Security-Policy: ${contentSecurityPolicy()}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
`;
}
