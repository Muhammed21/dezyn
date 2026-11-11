import { MySpacesOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { SpaceGateway } from "../application/space-gateway.ts";
import { planOf, roleOf } from "../domain/space.ts";

const UNAUTHORIZED = 401;

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
    if (!body.ok) {
      return body;
    }
    return ok(
      body.value.spaces.map(({ id, name, plan, role }) => ({
        id,
        name,
        plan: planOf(plan),
        role: roleOf(role),
      })),
    );
  },
});
