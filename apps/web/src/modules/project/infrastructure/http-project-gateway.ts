import { CreatedProjectOutput, PlanRequiredProblem } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { failureOf, type Fetch, parseJson, send } from "../../../platform/http.ts";
import type { ProjectGateway } from "../application/project-gateway.ts";
import type { ProjectCreationFailure } from "../domain/project.ts";

const CREATED = 201;
const BAD_REQUEST = 400;
const UNAUTHORIZED = 401;
const FORBIDDEN = 403;
const NOT_FOUND = 404;

const refusalOf = async (response: Response): Promise<ProjectCreationFailure> => {
  if (response.status === BAD_REQUEST) {
    return "invalid_name";
  }
  if (response.status === UNAUTHORIZED) {
    return "unauthenticated";
  }
  if (response.status === NOT_FOUND) {
    return "not_found";
  }
  if (response.status === FORBIDDEN) {
    const problem = await parseJson(response, PlanRequiredProblem);
    return problem.ok ? { reason: "plan_required", limit: problem.value.limit } : "forbidden";
  }
  return failureOf(response);
};

export const createHttpProjectGateway = ({
  apiUrl,
  fetch,
}: {
  readonly apiUrl: string;
  readonly fetch: Fetch;
}): ProjectGateway => ({
  createProject: async ({ spaceId, name }) => {
    const sent = await send(fetch, `${apiUrl}/v1/spaces/${spaceId}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!sent.ok) {
      return sent;
    }
    const response = sent.value;
    if (response.status !== CREATED) {
      return err(await refusalOf(response));
    }
    const body = await parseJson(response, CreatedProjectOutput);
    if (!body.ok) {
      return body;
    }
    return ok({
      id: body.value.id,
      spaceId: body.value.spaceId,
      name: body.value.name,
      createdAt: new Date(body.value.createdAt),
    });
  },
});
