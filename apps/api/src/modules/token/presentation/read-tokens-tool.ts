import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { Uuid } from "@repo/contracts";
import { ok, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import type { ProjectTokens } from "../application/read-tokens.ts";
import type { TokenUseCases } from "../application/token-use-cases.ts";
import { TokensOutput } from "../contracts/token.ts";

type ReadFailure = "not_found" | "history_unavailable";

export type RecordProjectCall = (call: {
  readonly tool: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly correlationId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly run: () => Promise<Result<ProjectTokens, never>>;
}) => Promise<Result<ProjectTokens, ReadFailure>>;

const ERROR_TEXT: Readonly<Record<ReadFailure, string>> = {
  not_found: "Projet introuvable",
  history_unavailable: "Historique indisponible",
};

export const registerReadTokens =
  ({
    readTokens,
    recordProjectCall,
  }: Pick<TokenUseCases, "readTokens"> & { readonly recordProjectCall: RecordProjectCall }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "read_tokens",
      {
        description:
          "Lit les tokens validés d'un projet en DTCG, triés par nom : une valeur $value, ou une valeur par mode dans modes, et les alias en {nom.du.token}.",
        inputSchema: { projectId: Uuid },
        outputSchema: TokensOutput,
      },
      async ({ projectId }) => {
        const read = await recordProjectCall({
          tool: "read_tokens",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: {},
          run: async () => ok(await readTokens(projectId)),
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
