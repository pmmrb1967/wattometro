// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { headersFile } from './security-headers.ts';

/** dist/_headers: CSP and other security headers for Cloudflare (security-headers.ts). */
function securityHeaders(): Plugin {
  return {
    name: 'wattometro-security-headers',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile() });
    },
  };
}

/** Short commit of the build, shown in the footer so it is clear which version is running. */
function buildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ mode }) => ({
  define: {
    __APP_COMMIT__: JSON.stringify(buildCommit()),
  },
  plugins: [
    react(),
    securityHeaders(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Wattómetro',
        short_name: 'Wattómetro',
        description: 'O consumo elétrico da casa transformado em poupança concreta.',
        lang: 'pt-PT',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f7f4',
        theme_color: '#2e2250',
        // Lets Chrome/Edge tell the app it is installed (install.ts, getInstalledRelatedApps).
        related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,woff2}'],
        // The API shares the origin: never answer it with the app shell.
        navigateFallbackDenylist: [/^\/v1(\/|$)/],
      },
    }),
  ],
  // The API is same-origin in production (server/src/gateway.ts); in development /v1 goes to
  // `pnpm dev:server` unless VITE_API_PROXY points elsewhere.
  server: {
    proxy: {
      '/v1': {
        target: loadEnv(mode, process.cwd(), 'VITE_').VITE_API_PROXY || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'shelly/**/*.test.ts'],
  },
}));
