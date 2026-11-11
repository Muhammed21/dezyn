import type { z } from "zod";

import { type TokenOutput, TokensOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { TokenGateway } from "../application/token-gateway.ts";
import { type Token, tokenTypeOf } from "../domain/token.ts";

const OK = 200;
const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const tokenOf = ({
  id,
  name,
  $type,
  $value,
  modes,
  $description,
}: z.infer<typeof TokenOutput>): Token => ({
  id,
  name,
  type: tokenTypeOf($type),
  value:
    modes === undefined ? { kind: "single", value: $value } : { kind: "by_mode", values: modes },
  description: $description,
});

export const createHttpTokenGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): TokenGateway => ({
  readTokens: async ({ projectId }) => {
    const sent = await send(fetch, `${apiUrl}/v1/projects/${projectId}/tokens`, { method: "GET" });
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
    const body = await parseJson(response, TokensOutput);
    if (!body.ok) {
      return body;
    }
    return ok({ modes: body.value.modes, tokens: body.value.tokens.map(tokenOf) });
  },
});
