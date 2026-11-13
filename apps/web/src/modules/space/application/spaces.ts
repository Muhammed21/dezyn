import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { Space, SpaceFailure } from "../domain/space.ts";
import type { SpaceGateway } from "./space-gateway.ts";

export const spaceUseCases = ({ gateway }: { readonly gateway: SpaceGateway }) => ({
  listMySpaces: () => gateway.listMySpaces(),
  readSpace: async ({
    spaceId,
  }: {
    readonly spaceId: string;
  }): Promise<Result<Space, SpaceFailure>> =>
    Uuid.safeParse(spaceId).success ? gateway.readSpace({ spaceId }) : err("not_found"),
  acceptInvitation: ({ token }: { readonly token: string }) => gateway.acceptInvitation({ token }),
});
