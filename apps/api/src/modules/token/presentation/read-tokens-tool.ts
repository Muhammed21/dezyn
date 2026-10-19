import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { Uuid } from "@repo/contracts";
import { ok, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import type { ProjectTokens } from "../application/read-tokens.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import type { TokenDefinition } from "../contracts/token-definition.ts";
import { TokensOutput } from "../contracts/token.ts";

type ReadFailure = "not_found" | "history_unavailable";

export type PendingProposition = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly lot: { readonly id: string; readonly state: string };
  readonly token: TokenDefinition;
};

export type PendingPropositionsOf = (projectId: string) => Promise<readonly PendingProposition[]>;

type ReadTokens = ProjectTokens & { readonly propositions?: readonly PendingProposition[] };

export type RecordProjectCall = (call: {
  readonly tool: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly correlationId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly run: () => Promise<Result<ReadTokens, never>>;
}) => Promise<Result<ReadTokens, ReadFailure>>;

const ERROR_TEXT: Readonly<Record<ReadFailure, string>> = {
  not_found: "Projet introuvable",
  history_unavailable: "Historique indisponible",
};

export const registerReadTokens =
  ({
    readTokens,
    pendingPropositionsOf,
    recordProjectCall,
  }: Pick<TokenUseCases, "readTokens"> & {
    readonly pendingPropositionsOf: PendingPropositionsOf;
    readonly recordProjectCall: RecordProjectCall;
  }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "read_tokens",
      {
        description:
          "Lit les tokens validés d'un projet en DTCG, triés par nom : une valeur $value, ou une valeur par mode dans modes, et les alias en {nom.du.token}. Avec includePropositions, rend aussi les propositions en attente, triées par nom, avec leur statut et leur lot.",
        inputSchema: { projectId: Uuid, includePropositions: z.boolean().optional() },
        outputSchema: TokensOutput,
      },
      async ({ projectId, includePropositions }) => {
        const read = await recordProjectCall({
          tool: "read_tokens",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: { includePropositions },
          run: async () => {
            const tokens = await readTokens(projectId);
            return ok(
              includePropositions === true
                ? { ...tokens, propositions: await pendingPropositionsOf(projectId) }
                : tokens,
            );
          },
        });
        if (!read.ok) {
          return { content: [{ type: "text", text: ERROR_TEXT[read.error] }], isError: true };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(read.value) }],
          structuredContent: read.value,
        };
      },
    );
  };
