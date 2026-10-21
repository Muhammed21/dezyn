import { Hono } from "hono";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { type Problem, problemResponse } from "#platform/problem.ts";
import { validate } from "#platform/validate.ts";
import { Uuid } from "@repo/contracts";

import type { AddedToken } from "../application/add-token.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import { TokenDefinitionInput } from "../contracts/token-definition.ts";
import { issuesOfCheck } from "../contracts/token-issues.ts";
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

const invalidRequest = (errors: readonly { path: string; message: string }[]): Problem => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  errors,
});

export const tokensRoutes = ({ addToken, readProjectTokens }: TokenUseCases) =>
  new Hono<AuthenticatedEnv>()
    .get("/:projectId/tokens", async (c) => {
      const projectId = Uuid.safeParse(c.req.param("projectId")).data;
      if (projectId === undefined) {
        return c.notFound();
      }
      const read = await readProjectTokens({ projectId, userId: c.get("identity").userId });
      return read.ok ? c.json(tokensOutputOf(read.value)) : c.notFound();
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
