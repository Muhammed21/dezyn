import type { Result } from "@repo/result";

import type {
  AcceptanceFailure,
  AssignableRole,
  ChangedRole,
  InvitationFailure,
  MembersFailure,
  RemovalFailure,
  RoleChangeFailure,
  SentInvitation,
  Space,
  SpaceFailure,
  SpaceMember,
} from "../domain/space.ts";

export type SpacesFailure = "unauthenticated" | "unavailable" | "invalid_response";

export type SpaceGateway = {
  readonly listMySpaces: () => Promise<Result<readonly Space[], SpacesFailure>>;
  readonly readSpace: (space: { readonly spaceId: string }) => Promise<Result<Space, SpaceFailure>>;
  readonly acceptInvitation: (invitation: {
    readonly token: string;
  }) => Promise<Result<Space, AcceptanceFailure>>;
  readonly inviteMember: (invitation: {
    readonly spaceId: string;
    readonly email: string;
  }) => Promise<Result<SentInvitation, InvitationFailure>>;
  readonly listMembers: (space: {
    readonly spaceId: string;
  }) => Promise<Result<readonly SpaceMember[], MembersFailure>>;
  readonly changeRole: (change: {
    readonly spaceId: string;
    readonly memberId: string;
    readonly role: AssignableRole;
  }) => Promise<Result<ChangedRole, RoleChangeFailure>>;
  readonly removeMember: (removal: {
    readonly spaceId: string;
    readonly memberId: string;
  }) => Promise<Result<undefined, RemovalFailure>>;
};
