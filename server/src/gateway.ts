// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Entry point of the `app` Worker (wrangler.app.toml). Static files are served
 * by Workers Assets without running this code; only /v1/* reaches it and goes
 * to the `api` Worker through a service binding. The browser and the Shelly
 * therefore see a single origin, behind a single Cloudflare Access application.
 */
export interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

export interface GatewayEnv {
  API: Fetcher;
  ASSETS: Fetcher;
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/v1' || pathname.startsWith('/v1/');
}

export default {
  fetch(request: Request, env: GatewayEnv): Promise<Response> {
    const { pathname } = new URL(request.url);
    return isApiPath(pathname) ? env.API.fetch(request) : env.ASSETS.fetch(request);
  },
};
