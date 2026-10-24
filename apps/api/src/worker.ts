import { createPostgresDatabase } from "#db";
import { readWorkerConfig } from "#platform/api-config.ts";
import type { LogSink } from "#platform/logging.ts";
import { INTERNAL_ERROR } from "#platform/problem.ts";
import { err } from "@repo/result";

import { buildApi } from "./build-api.ts";

type ExecutionContext = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

const internalError = (request: Request): Response =>
  new Response(JSON.stringify({ ...INTERNAL_ERROR, instance: new URL(request.url).pathname }), {
    status: INTERNAL_ERROR.status,
    headers: { "content-type": "application/problem+json" },
  });

export const createWorker = ({ log }: { readonly log: LogSink }) => ({
  fetch: async (request: Request, bindings: unknown, ctx: ExecutionContext): Promise<Response> => {
    const config = readWorkerConfig(bindings);
    if (!config.ok) {
      log({ level: "error", msg: "invalid configuration", issues: config.error });
      return internalError(request);
    }
    const db = createPostgresDatabase({ url: config.value.databaseUrl, log });
    try {
      const { app } = await buildApi({
        ...config.value,
        db,
        mailer: { send: async () => err("mail_unavailable") },
        log,
      });
      return await app.fetch(request);
    } finally {
      ctx.waitUntil(db.close());
    }
  },
});

export default createWorker({ log: () => undefined });
