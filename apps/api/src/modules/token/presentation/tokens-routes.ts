import { Hono } from "hono";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import { type Problem, problemResponse } from "../../../platform/problem.ts";
import { validate } from "../../../platform/validate.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import { TokenDefinitionInput } from "../contracts/token-definition.ts";
import type { ModeRefusal } from "../domain/mode-completeness.ts";
import type { ReferenceRefusal } from "../domain/reference.ts";
import type { Token } from "../domain/token.ts";

const MODE_ISSUES: Readonly<Record<ModeRefusal["refusal"], string>> = {
  missing_mode: "Valeur manquante pour ce mode",
  unknown_mode: "Mode inconnu du projet",
  value_without_mode: "Le projet a des modes : donner une valeur par mode dans modes",
  modes_without_modifier: "Le projet n'a pas de modes : donner $value",
  missing_value: "Valeur manquante",
};

const modeIssueOf = (refusal: ModeRefusal) => {
  if ("mode" in refusal) {
    return { path: `modes.${refusal.mode}`, message: MODE_ISSUES[refusal.refusal] };
  }
  return {
    path: refusal.refusal === "modes_without_modifier" ? "modes" : "$value",
    message: MODE_ISSUES[refusal.refusal],
  };
};

const REFERENCE_MESSAGES: Readonly<Record<ReferenceRefusal, string>> = {
  unknown_reference: "Référence vers un token inexistant",
  unvalidated_reference: "Référence vers un token non validé",
  type_mismatch: "Référence vers un token d'un autre type",
};

const referenceIssueOf = ({
  mode,
  refusal,
}: {
  readonly mode?: string;
  readonly refusal: ReferenceRefusal;
}) => ({
  path: mode === undefined ? "$value" : `modes.${mode}`,
  message: REFERENCE_MESSAGES[refusal],
});

const tokenOutputOf = ({ id, name, $type, $value, modes, $description, status }: Token) => ({
  id,
  name,
  $type,
  $value,
  modes,
  $description,
  status,
});

const invalidRequest = (errors: readonly { path: string; message: string }[]): Problem => ({
  type: "about:blank",
  title: "Requête invalide",
  status: 400,
  errors,
});

export const tokensRoutes = ({ addToken }: TokenUseCases) =>
  new Hono<AuthenticatedEnv>().post(
    "/:projectId/tokens",
    validate("json", TokenDefinitionInput),
    async (c) => {
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
      if (added.error === "name_taken") {
        return problemResponse(
          c,
          invalidRequest([{ path: "name", message: "Nom déjà pris dans le projet" }]),
        );
      }
      if (added.error.code === "invalid_references") {
        return problemResponse(c, invalidRequest(added.error.refusals.map(referenceIssueOf)));
      }
      return problemResponse(c, invalidRequest(added.error.refusals.map(modeIssueOf)));
    },
  );
