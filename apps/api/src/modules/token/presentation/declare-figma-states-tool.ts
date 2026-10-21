import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { McpCall } from "#platform/mcp.ts";
import {
  RECORD_FAILURE_TEXT,
  type RecordFailure,
  type RecordProjectCall,
} from "#platform/project-call.ts";
import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type {
  DeclaredFigmaStates,
  FigmaValueFailure,
  InvalidDeclaration,
} from "../application/declare-figma-states.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import { issuesOfCheck } from "../contracts/token-issues.ts";
import { DeclaredFigmaStatesOutput } from "../contracts/token.ts";
import type { FigmaRefusal } from "../domain/figma-declaration.ts";

type MalformedStates = { readonly code: "malformed_states"; readonly issues: readonly string[] };

type DeclarationFailure = RecordFailure | MalformedStates | InvalidDeclaration;

const MAX_STATES_PER_CALL = 500;

const StatesInput = z
  .array(
    z.object({
      name: z.string(),
      state: z.string(),
      figmaVariables: z.array(z.string()).optional(),
      figmaValue: z.unknown().optional(),
    }),
  )
  .min(1)
  .max(MAX_STATES_PER_CALL, `${MAX_STATES_PER_CALL} états au plus par appel`);

const REFUSAL_ISSUES: Readonly<Record<FigmaRefusal, string>> = {
  unknown_token: "name : Token inconnu du projet",
  unknown_state: "state : État Figma inconnu",
  duplicate_name: "name : Token déjà nommé dans cette déclaration",
  too_few_figma_variables: "figmaVariables : Au moins deux variables Figma distinctes",
  figma_variables_without_duplicate: "figmaVariables : Réservé à un doublon dans Figma",
  missing_figma_value: "figmaValue : Valeur Figma requise",
  figma_value_without_divergence: "figmaValue : Réservée à un token divergent",
};

const figmaValueIssuesOf = (failure: FigmaValueFailure): readonly string[] => {
  switch (failure.kind) {
    case "malformed":
      return failure.issues.map(({ path, message }) =>
        path === "" ? `figmaValue : ${message}` : `figmaValue.${path} : ${message}`,
      );
    case "unchecked":
      return issuesOfCheck(failure.check).map(
        ({ path, message }) => `figmaValue.${path} : ${message}`,
      );
    default:
      return ["figmaValue : Valeur identique à la valeur validée, déclarer synced"];
  }
};

const pathOf = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((joined, key) => {
    if (typeof key === "number") {
      return `${joined}[${key}]`;
    }
    return `${joined}.${String(key)}`;
  }, "states");

const errorTextOf = (failure: DeclarationFailure): string => {
  if (typeof failure === "string") {
    return RECORD_FAILURE_TEXT[failure];
  }
  if (failure.code === "malformed_states") {
    return failure.issues.join("\n");
  }
  if (failure.code === "invalid_figma_values") {
    return failure.failures
      .flatMap(({ index, failure: value }) =>
        figmaValueIssuesOf(value).map((issue) => `states[${index}].${issue}`),
      )
      .join("\n");
  }
  return failure.refusals
    .map(({ index, refusal }) => `states[${index}].${REFUSAL_ISSUES[refusal]}`)
    .join("\n");
};

const declaredOutputOf = ({ states }: DeclaredFigmaStates) => ({
  states: states.map(({ declaredAt, ...state }) => ({
    ...state,
    declaredAt: declaredAt.toISOString(),
  })),
});

export const registerDeclareFigmaStates =
  ({
    declareFigmaStates,
    recordProjectCall,
  }: Pick<TokenUseCases, "declareFigmaStates"> & {
    readonly recordProjectCall: RecordProjectCall;
  }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "declare_figma_states",
      {
        description:
          "Déclare l'état Figma de tokens d'un projet, après comparaison avec Figma : synced si la variable Figma a la même valeur dans chaque mode, missing_in_figma si elle n'existe pas, duplicate_in_figma si plusieurs variables Figma correspondent au token, avec leurs noms dans figmaVariables (au moins deux), diverged si la valeur Figma diffère dans au moins un mode, avec cette valeur dans figmaValue ($value ou modes) : elle devient une proposition dans le lot ouvert de l'IA, ou dans un lot automatique. La déclaration s'applique sans relecture et remplace l'état précédent ; une entrée invalide refuse toute la déclaration.",
        inputSchema: { projectId: Uuid, states: z.array(z.unknown()).optional() },
        outputSchema: DeclaredFigmaStatesOutput,
      },
      async ({ projectId, states }) => {
        const declared = await recordProjectCall({
          tool: "declare_figma_states",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: { states },
          run: async (): Promise<
            Result<DeclaredFigmaStates, MalformedStates | InvalidDeclaration | "not_found">
          > => {
            const parsed = StatesInput.safeParse(states);
            if (!parsed.success) {
              return err({
                code: "malformed_states",
                issues: parsed.error.issues.map(
                  ({ path, message }) => `${pathOf(path)} : ${message}`,
                ),
              });
            }
            return declareFigmaStates({
              projectId,
              userId: identity.userId,
              clientId: identity.clientId,
              entries: parsed.data,
            });
          },
        });
        if (!declared.ok) {
          return { content: [{ type: "text", text: errorTextOf(declared.error) }], isError: true };
        }
        const output = declaredOutputOf(declared.value);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  };
