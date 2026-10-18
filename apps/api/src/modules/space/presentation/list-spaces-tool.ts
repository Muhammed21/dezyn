import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AccessTokenIdentity } from "@repo/auth-verifier";

import { MySpacesOutput } from "../contracts/my-spaces.ts";
import type { MySpace } from "../domain/space.ts";

export const registerListSpaces =
  ({ listMySpaces }: { readonly listMySpaces: (userId: string) => Promise<readonly MySpace[]> }) =>
  (server: McpServer, identity: AccessTokenIdentity) => {
    server.registerTool(
      "list_spaces",
      {
        description:
          "Liste les espaces dont l'utilisateur est membre, avec son rôle et le plan de chacun.",
        outputSchema: MySpacesOutput,
      },
      async () => {
        const output = { spaces: await listMySpaces(identity.userId) };
        return {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: output,
        };
      },
    );
  };
