import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { ProjectTokens, TokensFailure } from "../domain/token.ts";
import type { TokenGateway } from "./token-gateway.ts";

export const tokenUseCases = ({ gateway }: { readonly gateway: TokenGateway }) => ({
  readTokens: async ({
    projectId,
  }: {
    readonly projectId: string;
  }): Promise<Result<ProjectTokens, TokensFailure>> =>
    Uuid.safeParse(projectId).success ? gateway.readTokens({ projectId }) : err("not_found"),
});
