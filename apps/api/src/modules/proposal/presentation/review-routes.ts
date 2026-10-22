import { Hono } from "hono";
import { z } from "zod";

import { issuesOfCheck } from "#modules/token/contracts/token-issues.ts";
import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { invalidRequest, type Problem, problemResponse } from "#platform/problem.ts";
import { validate } from "#platform/validate.ts";
import { Uuid } from "@repo/contracts";

import type { ProposalUseCases } from "../application/proposal-use-cases.ts";
import type { BatchValidationFailure, ReviewFailure } from "../application/review-proposals.ts";
import type { ValidatedDefinition } from "../application/write-tokens.ts";
import type { Decision, Proposal } from "../domain/proposal.ts";

const proposedOf = ({ token: { $type, $value, modes, $description, $extensions } }: Proposal) => ({
  $type,
  $value,
  modes,
  $description,
  $extensions,
});

const validatedOutputOf = ({
  $type,
  $value,
  modes,
  $description,
  $extensions,
}: ValidatedDefinition) => ({
  $type,
  $value,
  modes,
  $description,
  $extensions,
});

const proposalOutputOf = (
  proposal: Proposal & { readonly validated: ValidatedDefinition | null },
) => ({
  id: proposal.id,
  name: proposal.name,
  kind: proposal.kind,
  status: proposal.status,
  validated: proposal.validated === null ? null : validatedOutputOf(proposal.validated),
  proposed: proposedOf(proposal),
});

const conflictOf = (failure: Exclude<ReviewFailure, "not_found">): Problem =>
  failure === "already_reviewed"
    ? { type: "about:blank", title: "Proposition déjà relue", status: 409 }
    : {
        type: "about:blank",
        title: "Proposition invalide",
        status: 409,
        errors: issuesOfCheck(failure),
      };

const BatchValidationInput = z.object({ rejected: z.array(Uuid).default([]) });

const batchProblemOf = (
  failure: Exclude<BatchValidationFailure, "not_found">,
  rejected: readonly string[],
): Problem => {
  if (failure === "batch_open") {
    return { type: "about:blank", title: "Lot ouvert", status: 409 };
  }
  if (failure.code === "unknown_propositions") {
    return invalidRequest(
      rejected.flatMap((id, index) =>
        failure.ids.includes(id)
          ? [{ path: `rejected.${index}`, message: "Proposition hors du lot" }]
          : [],
      ),
    );
  }
  return {
    type: "about:blank",
    title: "Lot invalide",
    status: 409,
    errors: issuesOfCheck(failure.failure).map(({ path, message }) => ({
      path: `proposals.${failure.proposalId}.${path}`,
      message,
    })),
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

export const reviewRoutes = ({ batchOf, reviewProposal, validateBatch }: ProposalUseCases) => {
  const reviewed = (decision: Decision) =>
    new Hono<AuthenticatedEnv>().post("/:proposalId/" + decision, async (c) => {
      const proposalId = Uuid.safeParse(c.req.param("proposalId")).data;
      if (proposalId === undefined) {
        return c.notFound();
      }
      const outcome = await reviewProposal({
        proposalId,
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
      const { id, projectId, intent, state, proposals } = batch.value;
      return c.json({
        id,
        projectId,
        intent,
        state,
        proposals: proposals.map(proposalOutputOf),
      });
    })
    .post(
      "/proposal-batches/:batchId/validate",
      validate("json", BatchValidationInput),
      async (c) => {
        const batchId = Uuid.safeParse(c.req.param("batchId")).data;
        if (batchId === undefined) {
          return c.notFound();
        }
        const { rejected } = c.req.valid("json");
        const outcome = await validateBatch({
          batchId,
          userId: c.get("identity").userId,
          rejected,
          correlationId: c.get("correlationId"),
        });
        if (outcome.ok) {
          return c.json(outcome.value);
        }
        return outcome.error === "not_found"
          ? c.notFound()
          : problemResponse(c, batchProblemOf(outcome.error, rejected));
      },
    )
    .route("/proposals", reviewed("validate"))
    .route("/proposals", reviewed("reject"));
};
