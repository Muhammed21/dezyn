import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import { TokenDefinitionInput } from "../../token/contracts/token-definition.ts";
import { issuesOfCheck } from "../../token/contracts/token-issues.ts";
import type { ProposalUseCases } from "../application/proposal-use-cases.ts";
import type { UncheckedTokens, Written } from "../application/write-tokens.ts";
import { WrittenTokensOutput } from "../contracts/proposal.ts";

type InvalidTokens = { readonly code: "invalid_tokens"; readonly issues: readonly string[] };

type WriteFailure = "not_found" | "history_unavailable" | InvalidTokens | UncheckedTokens;

export type RecordProjectCall = (call: {
  readonly tool: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly correlationId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly run: () => Promise<Result<Written, InvalidTokens | UncheckedTokens>>;
}) => Promise<Result<Written, WriteFailure>>;

const ERROR_TEXT: Readonly<Record<"not_found" | "history_unavailable", string>> = {
  not_found: "Projet introuvable",
  history_unavailable: "Historique indisponible",
};

const TokensInput = z.array(TokenDefinitionInput).min(1);

const pathOf = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((joined, key) => {
    if (typeof key === "number") {
      return `${joined}[${key}]`;
    }
    return `${joined}.${String(key)}`;
  }, "tokens");

const issuesOf = (failure: InvalidTokens | UncheckedTokens): readonly string[] =>
  failure.code === "invalid_tokens"
    ? failure.issues
    : failure.checks.flatMap(({ index, failure: check }) =>
        issuesOfCheck(check).map(({ path, message }) => `tokens[${index}].${path} : ${message}`),
      );

const errorTextOf = (failure: WriteFailure): string =>
  typeof failure === "string" ? ERROR_TEXT[failure] : issuesOf(failure).join("\n");

const writtenOutputOf = ({ batch, proposals, unchanged, replaced }: Written) => ({
  batch: batch === null ? null : { id: batch.id, state: batch.state },
  proposals: proposals.map(({ id, name, kind, status }) => ({ id, name, kind, status })),
  unchanged,
  replaced,
});

export const registerWriteTokens =
  ({
    writeTokens,
    recordProjectCall,
  }: Pick<ProposalUseCases, "writeTokens"> & { readonly recordProjectCall: RecordProjectCall }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "write_tokens",
      {
        description:
          "Propose la création de tokens DTCG dans un projet : chaque token devient une proposition Proposée, rangée dans le lot ouvert de l'IA, à relire par un éditeur.",
        inputSchema: { projectId: Uuid, tokens: z.array(z.unknown()).optional() },
        outputSchema: WrittenTokensOutput,
      },
      async ({ projectId, tokens }) => {
        const written = await recordProjectCall({
          tool: "write_tokens",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: { tokens },
          run: async () => {
            const parsed = TokensInput.safeParse(tokens);
            if (!parsed.success) {
              return err({
                code: "invalid_tokens",
                issues: parsed.error.issues.map(
                  ({ path, message }) => `${pathOf(path)} : ${message}`,
                ),
              });
            }
            return writeTokens({
              projectId,
              userId: identity.userId,
              clientId: identity.clientId,
              tokens: parsed.data,
            });
          },
        });
        if (!written.ok) {
          return { content: [{ type: "text", text: errorTextOf(written.error) }], isError: true };
        }
        const output = writtenOutputOf(written.value);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  };
