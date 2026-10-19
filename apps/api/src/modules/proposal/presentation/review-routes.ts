import { Hono } from "hono";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { type Problem, problemResponse } from "../../../platform/problem.ts";
import { issuesOfCheck } from "../../token/contracts/token-issues.ts";
import type { ProposalUseCases } from "../application/proposal-use-cases.ts";
import type { ReviewFailure } from "../application/review-propositions.ts";
import type { ValidatedDefinition } from "../application/write-tokens.ts";
import type { Decision, Proposition } from "../domain/proposition.ts";

const proposedOf = ({ token: { $type, $value, modes, $description } }: Proposition) => ({
  $type,
  $value,
  modes,
  $description,
});

const validatedOutputOf = ({ $type, $value, modes, $description }: ValidatedDefinition) => ({
  $type,
  $value,
  modes,
  $description,
});

const propositionOutputOf = (
  proposition: Proposition & { readonly validated: ValidatedDefinition | null },
) => ({
  id: proposition.id,
  name: proposition.name,
  kind: proposition.kind,
  status: proposition.status,
  validated: proposition.validated === null ? null : validatedOutputOf(proposition.validated),
  proposed: proposedOf(proposition),
});

const conflictOf = (failure: Exclude<ReviewFailure, "not_found">): Problem => {
  if (failure === "already_reviewed") {
    return { type: "about:blank", title: "Proposition déjà relue", status: 409 };
  }
  if (failure.code === "name_taken") {
    return {
      type: "about:blank",
      title: "Proposition invalide",
      status: 409,
      errors: [{ path: "name", message: "Nom déjà pris dans le projet" }],
    };
  }
  return {
    type: "about:blank",
    title: "Proposition invalide",
    status: 409,
    errors: issuesOfCheck(failure),
  };
};

export const projectBatchesRoutes = ({ listBatches }: ProposalUseCases) =>
  new Hono<AuthenticatedEnv>().get("/:projectId/proposal-batches", async (c) => {
    const projectId = Uuid.safeParse(c.req.param("projectId")).data;
    if (projectId === undefined) {
      return c.notFound();
    }
    const batches = await listBatches({ projectId, userId: c.get("identity").userId });
    return batches.ok ? c.json({ batches: batches.value }) : c.notFound();
  });

export const reviewRoutes = ({ batchOf, reviewProposition }: ProposalUseCases) => {
  const reviewed = (decision: Decision) =>
    new Hono<AuthenticatedEnv>().post("/:propositionId/" + decision, async (c) => {
      const propositionId = Uuid.safeParse(c.req.param("propositionId")).data;
      if (propositionId === undefined) {
        return c.notFound();
      }
      const outcome = await reviewProposition({
        propositionId,
        userId: c.get("identity").userId,
        decision,
        correlationId: c.get("correlationId"),
      });
      if (outcome.ok) {
        const { id, name, kind, status } = outcome.value;
        return c.json({ id, name, kind, status });
      }
      return outcome.error === "not_found"
        ? c.notFound()
        : problemResponse(c, conflictOf(outcome.error));
    });
  return new Hono<AuthenticatedEnv>()
    .get("/proposal-batches/:batchId", async (c) => {
      const batchId = Uuid.safeParse(c.req.param("batchId")).data;
      if (batchId === undefined) {
        return c.notFound();
      }
      const batch = await batchOf({ batchId, userId: c.get("identity").userId });
      if (!batch.ok) {
        return c.notFound();
      }
      const { id, projectId, intention, state, propositions } = batch.value;
      return c.json({
        id,
        projectId,
        intention,
        state,
        propositions: propositions.map(propositionOutputOf),
      });
    })
    .route("/proposals", reviewed("validate"))
    .route("/proposals", reviewed("reject"));
};
