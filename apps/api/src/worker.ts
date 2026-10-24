import { createPostgresDatabase } from "#db";
import { readWorkerConfig } from "#platform/api-config.ts";
import { createJsonLineSink } from "#platform/json-line-sink.ts";
import { errorDetails, type LogSink } from "#platform/logging.ts";
import { INTERNAL_ERROR, type Problem } from "#platform/problem.ts";
import { assertSchemaVersion, LATEST_MIGRATION } from "@repo/db";
import { err } from "@repo/result";

import { buildApi } from "./build-api.ts";

type ExecutionContext = {
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

const SERVICE_UNAVAILABLE: Problem = {
  type: "about:blank",
  title: "Service indisponible",
  status: 503,
};

const problemResponse = (request: Request, problem: Problem): Response =>
  new Response(JSON.stringify({ ...problem, instance: new URL(request.url).pathname }), {
    status: problem.status,
    headers: { "content-type": "application/problem+json" },
  });

const schemaIsCurrent = async ({
  assertSchema,
  databaseUrl,
  log,
}: {
  readonly assertSchema: (databaseUrl: string) => Promise<void>;
  readonly databaseUrl: string;
  readonly log: LogSink;
}): Promise<boolean> => {
  try {
    await assertSchema(databaseUrl);
    return true;
  } catch (error) {
    log({
      level: "error",
      msg: "schema check failed",
      ...errorDetails(error),
    });
    return false;
  }
};

export const createWorker = ({
  log,
  assertSchema,
}: {
  readonly log: LogSink;
  readonly assertSchema: (databaseUrl: string) => Promise<void>;
}) => {
  let schemaChecked = false;
  return {
    fetch: async (
      request: Request,
      bindings: unknown,
      ctx: ExecutionContext,
    ): Promise<Response> => {
      const config = readWorkerConfig(bindings);
      if (!config.ok) {
        log({ level: "error", msg: "invalid configuration", issues: config.error });
        return problemResponse(request, INTERNAL_ERROR);
      }
      schemaChecked =
        schemaChecked ||
        (await schemaIsCurrent({ assertSchema, databaseUrl: config.value.databaseUrl, log }));
      if (!schemaChecked) {
        return problemResponse(request, SERVICE_UNAVAILABLE);
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
  };
};

export default createWorker({
  log: createJsonLineSink({ write: (line) => console.log(line.trimEnd()), now: () => new Date() }),
  assertSchema: (databaseUrl) =>
    assertSchemaVersion({ connectionString: databaseUrl, migration: LATEST_MIGRATION }),
});
