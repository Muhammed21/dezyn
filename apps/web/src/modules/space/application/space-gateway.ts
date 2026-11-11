import type { Result } from "@repo/result";

import type { Space } from "../domain/space.ts";

export type SpacesFailure = "unauthenticated" | "unavailable" | "invalid_response";

export type SpaceGateway = {
  readonly listMySpaces: () => Promise<Result<readonly Space[], SpacesFailure>>;
};
