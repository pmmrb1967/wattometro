// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The development server's /v1 proxy (vite.config.ts): `pnpm dev` on
 * localhost:5173 sends the API's requests to `pnpm dev:server` or to
 * VITE_API_PROXY. The API takes writes only from its own origin
 * (server/src/app.ts, trustedOrigin), so the proxy sends them with the origin
 * of the API it goes to, as the published app (same origin) does. The
 * published API then needs no development origins in ALLOWED_ORIGINS.
 */

/** The part of a proxied request this needs (Node's ClientRequest has these). */
interface OutgoingRequest {
  getHeader(name: string): unknown;
  setHeader(name: string, value: string): unknown;
}

interface Proxy {
  on(event: 'proxyReq', listener: (request: OutgoingRequest) => void): unknown;
}

export function apiProxy(target: string) {
  const origin = new URL(target).origin;
  return {
    target,
    changeOrigin: true,
    configure(proxy: Proxy) {
      proxy.on('proxyReq', (request) => {
        if (request.getHeader('origin') !== undefined) request.setHeader('origin', origin);
      });
    },
  };
}
