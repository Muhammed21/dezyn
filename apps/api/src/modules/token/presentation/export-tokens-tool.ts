import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { McpCall } from "#platform/mcp.ts";
import { RECORD_FAILURE_TEXT, type RecordProjectCall } from "#platform/project-call.ts";
import { Uuid } from "@repo/contracts";

import type { TokenUseCases } from "../application/token-use-cases.ts";
import { issuesOfConflicts } from "../contracts/token-issues.ts";

export const registerExportTokens =
  ({
    exportTokens,
    recordProjectCall,
  }: Pick<TokenUseCases, "exportTokens"> & { readonly recordProjectCall: RecordProjectCall }) =>
  (server: McpServer, { identity, correlationId }: McpCall) => {
    server.registerTool(
      "export_tokens",
      {
        description:
          "Exporte les tokens validés d'un projet : un document DTCG imbriqué par groupes, ou, si le projet a des modes, un document Resolver (version 2025.10) avec un contexte par mode. Le document revient dans document. Un projet dont deux tokens sont en conflit de groupe ne s'exporte pas.",
        inputSchema: { projectId: Uuid },
        outputSchema: { document: z.record(z.string(), z.unknown()) },
      },
      async ({ projectId }) => {
        const exported = await recordProjectCall({
          tool: "export_tokens",
          projectId,
          userId: identity.userId,
          clientId: identity.clientId,
          correlationId,
          input: {},
          run: () => exportTokens({ projectId, userId: identity.userId }),
        });
        if (!exported.ok) {
          const text =
            typeof exported.error === "string"
              ? RECORD_FAILURE_TEXT[exported.error]
              : issuesOfConflicts(exported.error.conflicts)
                  .map(({ path, message }) => `${path} : ${message}`)
                  .join("\n");
          return { content: [{ type: "text", text }], isError: true };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(exported.value) }],
          structuredContent: { document: exported.value },
        };
      },
    );
  };
