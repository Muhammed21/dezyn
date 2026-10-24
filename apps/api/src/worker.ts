import { z } from "zod";

import { createPostgresDatabase } from "#db";
import { err } from "@repo/result";

import { buildApi } from "./build-api.ts";

type ExecutionContext = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

const WorkerEnv = z.object({
  HYPERDRIVE: z.object({ connectionString: z.string() }),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  WEB_URL: z.url(),
  TRUSTED_IP_HEADER: z.string().min(1).default("cf-connecting-ip"),
});

const log = () => undefined;

export default {
  fetch: async (request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> => {
    const config = WorkerEnv.parse(env);
    const db = createPostgresDatabase({ url: config.HYPERDRIVE.connectionString, log });
    try {
      const { app } = await buildApi({
        db,
        mailer: { send: async () => err("mail_unavailable") },
        log,
        authSecret: config.BETTER_AUTH_SECRET,
        baseURL: config.BETTER_AUTH_URL,
        trustedIpHeader: config.TRUSTED_IP_HEADER,
        webUrl: config.WEB_URL,
      });
      return await app.fetch(request);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
};
