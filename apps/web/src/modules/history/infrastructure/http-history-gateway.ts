import type { z } from "zod";

import { HistoryOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { HistoryGateway } from "../application/history-gateway.ts";
import type { HistoryAuthor, HistoryEntry } from "../domain/history.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

type EntryOutput = z.infer<typeof HistoryOutput>["entries"][number];

const authorOf = (author: EntryOutput["author"]): HistoryAuthor =>
  author.kind === "member" && "name" in author && typeof author.name === "string"
    ? { kind: "member", name: author.name, left: author.membership === "left" }
    : { kind: "unknown" };

const entryOf = ({ id, action, author, clientId, occurredAt }: EntryOutput): HistoryEntry => ({
  id,
  action,
  author: authorOf(author),
  clientId: clientId ?? undefined,
  occurredAt: new Date(occurredAt),
});

export const createHttpHistoryGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): HistoryGateway => ({
  readHistory: async ({ projectId }) => {
    const sent = await send(fetch, `${apiUrl}/v1/projects/${projectId}/history`, {
      method: "GET",
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status === UNAUTHORIZED) {
      return err("unauthenticated");
    }
    if (response.status === NOT_FOUND) {
      return err("not_found");
    }
    if (response.status !== OK) {
      return err(failureOf(response));
    }
    const body = await parseJson(response, HistoryOutput);
    if (!body.ok) {
      return body;
    }
    const { entries, purgedBefore } = body.value;
    return ok({
      entries: entries.map(entryOf),
      purgedBefore: purgedBefore === null ? undefined : new Date(purgedBefore),
    });
  },
});
