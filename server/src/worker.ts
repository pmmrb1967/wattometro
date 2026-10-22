// SPDX-License-Identifier: AGPL-3.0-or-later
/** Cloudflare Worker entry point. Configuration in server/wrangler.toml. */
import { createApp } from './app';
import { d1 } from './db';
import { allowedOrigins, positiveInteger, type Env } from './env';

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const app = createApp({
      sql: d1(env.DB),
      sessionSecret: env.SESSION_SECRET,
      allowedOrigins: allowedOrigins(env),
      ingestRequestsPerMinute: positiveInteger(env.INGEST_REQUESTS_PER_MINUTE),
    });
    return app.fetch(request);
  },
};
