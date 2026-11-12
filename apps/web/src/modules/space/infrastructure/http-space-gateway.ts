import type { z } from "zod";

import { MySpaceOutput, MySpacesOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { SpaceGateway } from "../application/space-gateway.ts";
import { knownActionsOf, planOf, roleOf, type Space } from "../domain/space.ts";

const UNAUTHORIZED = 401;
const NOT_FOUND = 404;

const spaceOf = ({
  id,
  name,
  plan,
  role,
  allowedActions,
}: z.infer<typeof MySpaceOutput>): Space => ({
  id,
  name,
  plan: planOf(plan),
  role: roleOf(role),
  allowedActions: knownActionsOf(allowedActions),
});

export const createHttpSpaceGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): SpaceGateway => ({
  listMySpaces: async () => {
    const sent = await send(fetch, `${apiUrl}/v1/spaces`, { method: "GET" });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status === UNAUTHORIZED) {
      return err("unauthenticated");
    }
    if (!response.ok) {
      return err(failureOf(response));
    }
    const body = await parseJson(response, MySpacesOutput);
    return body.ok ? ok(body.value.spaces.map(spaceOf)) : body;
  },
  readSpace: async ({ spaceId }) => {
    const sent = await send(fetch, `${apiUrl}/v1/spaces/${spaceId}`, { method: "GET" });
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
    if (!response.ok) {
      return err(failureOf(response));
    }
    const body = await parseJson(response, MySpaceOutput);
    return body.ok ? ok(spaceOf(body.value)) : body;
  },
});
