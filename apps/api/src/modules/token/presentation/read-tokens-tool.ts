import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { Uuid } from "@repo/contracts";
import { ok, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import { RECORD_FAILURE_TEXT, type RecordProjectCall } from "../../../platform/project-call.ts";
import type { ProjectTokens } from "../application/read-tokens.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import type { TokenDefinition } from "../contracts/token-definition.ts";
import { TokensOutput } from "../contracts/token.ts";
import { tokensOutputOf } from "./tokens-output.ts";

export type PendingProposal = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly batch: { readonly id: string; readonly state: string };
  readonly token: TokenDefinition;
};

export type PendingProposalsOf = (projectId: string) => Promise<readonly PendingProposal[]>;

type ReadTokens = ProjectTokens & { readonly proposals?: readonly PendingProposal[] };

export const registerReadTokens =
  ({
    readTokens,
    pendingProposalsOf,
    recordProjectCall,
  }: Pick<TokenUseCases, "readTokens"> & {
    readonly pendingProposalsOf: PendingProposalsOf;
    readonly recordProjectCall: RecordProjectCall;
  }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "read_tokens",
      {
        description:
          "Lit les tokens validés d'un projet en DTCG, triés par nom : une valeur $value, ou une valeur par mode dans modes, et les alias en {nom.du.token}. Avec includeProposals, rend aussi les propositions en attente, triées par nom, avec leur statut et leur lot.",
        inputSchema: { projectId: Uuid, includeProposals: z.boolean().optional() },
        outputSchema: TokensOutput,
      },
      async ({ projectId, includeProposals }) => {
        const read = await recordProjectCall({
          tool: "read_tokens",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: { includeProposals },
          run: async (): Promise<Result<ReadTokens, never>> => {
            const tokens = await readTokens(projectId);
            return ok(
              includeProposals === true
                ? { ...tokens, proposals: await pendingProposalsOf(projectId) }
                : tokens,
            );
          },
        });
        if (!read.ok) {
          return {
            content: [{ type: "text", text: RECORD_FAILURE_TEXT[read.error] }],
            isError: true,
          };
        }
        const output = tokensOutputOf(read.value);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  };
