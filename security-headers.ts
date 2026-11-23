// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Security headers of the published app, written to dist/_headers at build
 * time; Cloudflare's static assets serve them. Adapted from Faturómetro.
 *
 * The app may only connect to itself (the API is same-origin, under /v1), the
 * Anthropic API (AI, with the user's own key) and Open-Meteo (weather, no
 * personal data); see CLAUDE.md, rule 1. Only if the user links OneDrive:
 * Microsoft sign-in and Graph (the app's own folder) and the hosts OneDrive
 * downloads files from; likewise Dropbox's and Google Drive's APIs. Sign-in is a full-page redirect; the hidden frame is
 * for silent token renewal.
 */
/** Where Microsoft sign-in comes back to (src/cloud/auth-redirect.ts). */
export const AUTH_REDIRECT_PATH = '/auth-redirect.html';

/** Dropbox and Google Drive APIs (only if the user links one; their sign-in pages are top-level navigations). */
const DRIVE_ORIGINS = [
  'https://api.dropboxapi.com',
  'https://content.dropboxapi.com',
  'https://www.googleapis.com',
];

const MICROSOFT_LOGIN = 'https://login.microsoftonline.com';
/** Graph, and the hosts its download links point to (personal and work OneDrive). */
const ONEDRIVE_ORIGINS = [
  'https://graph.microsoft.com',
  'https://*.files.1drv.com',
  'https://*.livefilestore.com',
  'https://my.microsoftpersonalcontent.com',
  'https://*.sharepoint.com',
];

export function contentSecurityPolicy(frameAncestors = "'none'"): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    `connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://api.open-meteo.com https://archive-api.open-meteo.com https://geocoding-api.open-meteo.com ${MICROSOFT_LOGIN} ${ONEDRIVE_ORIGINS.join(' ')} ${DRIVE_ORIGINS.join(' ')}`,
    // Silent renewal of the Microsoft sign-in (hidden frame).
    `frame-src 'self' ${MICROSOFT_LOGIN}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
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
${AUTH_REDIRECT_PATH}
  ! Content-Security-Policy
  ! X-Frame-Options
  Content-Security-Policy: ${contentSecurityPolicy("'self'")}
`;
}
