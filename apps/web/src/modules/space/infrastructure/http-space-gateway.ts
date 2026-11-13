import type { z } from "zod";

import {
  AlreadyMemberProblem,
  EmailMismatchProblem,
  MySpaceOutput,
  MySpacesOutput,
  PlanRequiredProblem,
} from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { SpaceGateway } from "../application/space-gateway.ts";
import {
  type AcceptanceFailure,
  knownActionsOf,
  planOf,
  roleOf,
  type Space,
} from "../domain/space.ts";

const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const GONE = 410;

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

const refusalOf = async (response: Response): Promise<AcceptanceFailure> => {
  if (response.status === UNAUTHORIZED) {
    return "unauthenticated";
  }
  if (response.status === GONE) {
    return "gone";
  }
  if (response.status !== FORBIDDEN && response.status !== CONFLICT) {
    return failureOf(response);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (EmailMismatchProblem.safeParse(body).success) {
    return "email_mismatch";
  }
  if (AlreadyMemberProblem.safeParse(body).success) {
    return "already_member";
  }
  return PlanRequiredProblem.safeParse(body).success ? "plan_required" : "invalid_response";
};

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
  acceptInvitation: async ({ token }) => {
    const sent = await send(fetch, `${apiUrl}/v1/invitations/${token}/accept`, {
      method: "POST",
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (!response.ok) {
      return err(await refusalOf(response));
    }
    const body = await parseJson(response, MySpaceOutput);
    return body.ok ? ok(spaceOf(body.value)) : body;
  },
});
