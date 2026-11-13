import type { Result } from "@repo/result";

import type { AcceptanceFailure, Space, SpaceFailure } from "../domain/space.ts";

export type SpacesFailure = "unauthenticated" | "unavailable" | "invalid_response";

export type SpaceGateway = {
  readonly listMySpaces: () => Promise<Result<readonly Space[], SpacesFailure>>;
  readonly readSpace: (space: { readonly spaceId: string }) => Promise<Result<Space, SpaceFailure>>;
  readonly acceptInvitation: (invitation: {
    readonly token: string;
  }) => Promise<Result<Space, AcceptanceFailure>>;
};
