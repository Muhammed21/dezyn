import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { Uuid } from "@repo/contracts";
import { err, ok, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import type { ClosedBatch, OpenedBatch } from "../application/proposal-batches.ts";
import type { ProposalUseCases } from "../application/proposal-use-cases.ts";
import { ClosedBatchOutput, OpenedBatchOutput } from "../contracts/proposal.ts";
import type { ProposalBatch } from "../domain/proposal.ts";

type BatchFailure = "not_found" | "history_unavailable" | "invalid_intent";

type RecordProjectCall = <T, E>(call: {
  readonly tool: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly correlationId: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly run: () => Promise<Result<T, E>>;
}) => Promise<Result<T, E | "not_found" | "history_unavailable">>;

const ERROR_TEXT: Readonly<Record<BatchFailure, string>> = {
  not_found: "Projet introuvable",
  history_unavailable: "Historique indisponible",
  invalid_intent: "intent : Intention requise",
};

const Intent = z.string().trim().min(1);

type TextContent = { readonly type: "text"; readonly text: string };

const errorOf = (failure: BatchFailure): { content: TextContent[]; isError: true } => ({
  content: [{ type: "text", text: ERROR_TEXT[failure] }],
  isError: true,
});

const structured = <T extends Record<string, unknown>>(
  output: T,
): { content: TextContent[]; structuredContent: T } => ({
  content: [{ type: "text", text: JSON.stringify(output) }],
  structuredContent: output,
});

const batchOutputOf = ({ id, state, intent }: ProposalBatch) => ({ id, state, intent });

export const registerProposalBatchTools =
  ({
    openBatch,
    closeBatch,
    recordProjectCall,
  }: Pick<ProposalUseCases, "openBatch" | "closeBatch"> & {
    readonly recordProjectCall: RecordProjectCall;
  }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    const writer = { userId: identity.userId, clientId: identity.clientId, correlationId };
    server.registerTool(
      "open_proposal_batch",
      {
        description:
          "Ouvre un lot de propositions dans un projet en déclarant l'intention de l'IA, par exemple « Import du Figma Healthcare » ; les écritures suivantes y vont, et le lot ouvert précédent de l'IA dans ce projet se ferme.",
        inputSchema: { projectId: Uuid, intent: z.string().optional() },
        outputSchema: OpenedBatchOutput,
      },
      async ({ projectId, intent }) => {
        const opened = await recordProjectCall({
          ...writer,
          tool: "open_proposal_batch",
          projectId,
          input: { intent },
          run: async (): Promise<Result<OpenedBatch, "invalid_intent">> => {
            const parsed = Intent.safeParse(intent);
            if (!parsed.success) {
              return err("invalid_intent");
            }
            return ok(
              await openBatch({
                projectId,
                userId: identity.userId,
                clientId: identity.clientId,
                intent: parsed.data,
              }),
            );
          },
        });
        if (!opened.ok) {
          return errorOf(opened.error);
        }
        const { batch, closed } = opened.value;
        return structured({
          batch: batchOutputOf(batch),
          closed: closed === null ? null : { id: closed.id },
        });
      },
    );
    server.registerTool(
      "close_proposal_batch",
      {
        description:
          "Ferme le lot de propositions ouvert de l'IA dans un projet ; l'éditeur peut alors le valider en entier.",
        inputSchema: { projectId: Uuid },
        outputSchema: ClosedBatchOutput,
      },
      async ({ projectId }) => {
        const closed = await recordProjectCall({
          ...writer,
          tool: "close_proposal_batch",
          projectId,
          input: {},
          run: async (): Promise<Result<ClosedBatch, never>> =>
            ok(
              await closeBatch({
                projectId,
                userId: identity.userId,
                clientId: identity.clientId,
              }),
            ),
        });
        if (!closed.ok) {
          return errorOf(closed.error);
        }
        const { batch } = closed.value;
        return structured({ batch: batch === null ? null : batchOutputOf(batch) });
      },
    );
  };
