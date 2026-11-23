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

/**
 * The app key in the Dropbox App Console ("App folder" access, see docs/dropbox.md).
 * Not a secret. VITE_DROPBOX_APP_KEY overrides it at build time. Empty: Dropbox is
 * not offered.
 */
export const PROJECT_DROPBOX_APP_KEY = '';

/**
 * The OAuth client id in Google Cloud (see docs/google-drive.md). Not a secret; the
 * client secret lives only in the Worker. VITE_GOOGLE_CLIENT_ID overrides it at
 * build time. Empty: Google Drive is not offered.
 */
export const PROJECT_GOOGLE_CLIENT_ID = '';
