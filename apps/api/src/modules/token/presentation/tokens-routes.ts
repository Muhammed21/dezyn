import { Hono } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { invalidRequest, type Problem, problemResponse } from "#platform/problem.ts";
import { validate } from "#platform/validate.ts";
import { Uuid } from "@repo/contracts";

import type { AddedToken } from "../application/add-token.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import { TokenDefinitionInput } from "../contracts/token-definition.ts";
import { issuesOfCheck, issuesOfConflicts } from "../contracts/token-issues.ts";
import type { GroupConflict } from "../domain/token-name.ts";
import { tokensOutputOf } from "./tokens-output.ts";

const tokenOutputOf = ({
  id,
  name,
  $type,
  $value,
  modes,
  $description,
  $extensions,
  status,
  replaced,
}: AddedToken) => ({
  id,
  name,
  $type,
  $value,
  modes,
  $description,
  $extensions,
  status,
  replaced,
});

const exportConflict = (conflicts: readonly GroupConflict[]): Problem => ({
  type: "about:blank",
  title: "Export impossible",
  status: 409,
  errors: issuesOfConflicts(conflicts),
});

export const tokensRoutes = ({ addToken, readProjectTokens, exportTokens }: TokenUseCases) =>
  new Hono<AuthenticatedEnv>()
    .get("/:projectId/tokens", async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const read = await readProjectTokens({ projectId, userId: c.get("identity").userId });
      return read.ok ? c.json(tokensOutputOf(read.value)) : c.notFound();
    })
    .get("/:projectId/tokens/export", async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const exported = await exportTokens({ projectId, userId: c.get("identity").userId });
      if (exported.ok) {
        return c.json(exported.value);
      }
      return exported.error === "not_found"
        ? c.notFound()
        : problemResponse(c, exportConflict(exported.error.conflicts));
    })
    .post("/:projectId/tokens", validate("json", TokenDefinitionInput), async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const added = await addToken({
        projectId,
        userId: c.get("identity").userId,
        token: c.req.valid("json"),
        correlationId: c.get("correlationId"),
      });
      if (added.ok) {
        return c.json(tokenOutputOf(added.value), 201);
      }
      if (added.error === "not_found") {
        return c.notFound();
      }
      return problemResponse(
        c,
        invalidRequest(
          issuesOfCheck(added.error === "name_taken" ? { code: "name_taken" } : added.error),
        ),
      );
    });
