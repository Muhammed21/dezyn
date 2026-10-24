import { request as httpRequest } from "node:http";

import type { App } from "./authorization-flow.ts";

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

const headersOf = (raw: NodeJS.Dict<string | string[]>): Headers =>
  new Headers(
    Object.entries(raw).flatMap(([name, value]) =>
      (Array.isArray(value) ? value : [value ?? ""]).map((one): [string, string] => [name, one]),
    ),
  );

const bodyOf = async (body: BodyInit | null | undefined): Promise<Buffer | undefined> =>
  body === undefined || body === null
    ? undefined
    : Buffer.from(await new Response(body).arrayBuffer());

export const httpApp = (server: URL): App => ({
  request: async (input, init = {}) => {
    const target = new URL(input);
    const body = await bodyOf(init.body);
    return new Promise((resolve, reject) => {
      const outgoing = httpRequest(
        new URL(`${target.pathname}${target.search}`, server),
        {
          method: init.method ?? "GET",
          headers: { ...Object.fromEntries(new Headers(init.headers)), host: target.host },
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
          incoming.on("end", () => {
            const status = incoming.statusCode ?? 500;
            resolve(
              new Response(NULL_BODY_STATUSES.has(status) ? null : Buffer.concat(chunks), {
                status,
                headers: headersOf(incoming.headers),
              }),
            );
          });
          incoming.on("error", reject);
        },
      );
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  },
});
