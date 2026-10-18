import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { McpCall } from "../../../platform/mcp.ts";
import { decodeCursor } from "../application/history-cursor.ts";
import type { HistoryUseCases } from "../application/history-use-cases.ts";
import type { HistoryPage } from "../application/read-history.ts";
import { HistoryOutput } from "../contracts/history.ts";

const ERROR_TEXT: Readonly<Record<"not_found" | "invalid_cursor" | "history_unavailable", string>> =
  {
    not_found: "Projet introuvable",
    invalid_cursor: "Curseur invalide",
    history_unavailable: "Historique indisponible",
  };

const historyOutputOf = ({ entries, nextCursor }: HistoryPage) => ({
  entries: entries.map((entry) => ({ ...entry, occurredAt: entry.occurredAt.toISOString() })),
  nextCursor,
});

const ReadHistoryInput = {
  projectId: Uuid,
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

export const registerReadHistory =
  ({ readHistory, auditProjectCall }: HistoryUseCases) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "read_history",
      {
        description:
          "Lit l'historique d'un projet, des entrées les plus récentes aux plus anciennes, page par page : renvoyer nextCursor en cursor pour la page suivante.",
        inputSchema: ReadHistoryInput,
        outputSchema: HistoryOutput,
      },
      async ({ projectId, ...input }) => {
        const page = await auditProjectCall({
          tool: "read_history",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input,
          run: async (): Promise<Result<HistoryPage, "invalid_cursor" | "not_found">> => {
            const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor);
            if (input.cursor !== undefined && after === undefined) {
              return err("invalid_cursor");
            }
            return readHistory({
              projectId,
              userId: identity.userId,
              after,
              limit: input.limit ?? 50,
            });
          },
        });
        if (!page.ok) {
          return {
            content: [{ type: "text", text: ERROR_TEXT[page.error] }],
            isError: true,
          };
        }
        const output = historyOutputOf(page.value);
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  };
