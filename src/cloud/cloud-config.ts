// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Adapted from Faturómetro (src/cloud/cloud-config.ts).
 *
 * The app's id in the Microsoft identity platform (an SPA registration, see
 * docs/onedrive.md). Not a secret: it only names the app on the sign-in page.
 * VITE_ONEDRIVE_CLIENT_ID overrides it at build time. Without an id, OneDrive
 * is not offered.
 */
export const PROJECT_ONEDRIVE_CLIENT_ID = '9c75a57c-b9b8-4d1f-943a-8cf8778a1adb';
