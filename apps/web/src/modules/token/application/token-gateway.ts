import type { Result } from "@repo/result";

import type { ProjectTokens, TokensFailure } from "../domain/token.ts";

export type TokenGateway = {
  readonly readTokens: (project: {
    readonly projectId: string;
  }) => Promise<Result<ProjectTokens, TokensFailure>>;
};
