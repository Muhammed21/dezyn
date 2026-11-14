import { Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type {
  InvitationFailure,
  MembersFailure,
  SentInvitation,
  Space,
  SpaceFailure,
  SpaceMember,
} from "../domain/space.ts";
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
  inviteMember: async ({
    spaceId,
    email,
  }: {
    readonly spaceId: string;
    readonly email: string;
  }): Promise<Result<SentInvitation, InvitationFailure>> =>
    Uuid.safeParse(spaceId).success ? gateway.inviteMember({ spaceId, email }) : err("not_found"),
  listMembers: async ({
    spaceId,
  }: {
    readonly spaceId: string;
  }): Promise<Result<readonly SpaceMember[], MembersFailure>> =>
    Uuid.safeParse(spaceId).success ? gateway.listMembers({ spaceId }) : err("not_found"),
});
