import type { Result } from "@repo/result";

import type { AcceptanceRefusal } from "../domain/acceptance.ts";
import { type MySpace, type PersonalSpace, personalSpaceOf } from "../domain/space.ts";
import type { InvitationFailure, SentInvitation } from "./invite-member.ts";
import type { MembershipKey } from "./membership-reader.ts";

export type SpaceUseCases = {
  readonly listMySpaces: (userId: string) => Promise<readonly MySpace[]>;
  readonly readSpace: (key: MembershipKey) => Promise<Result<MySpace, "not_found">>;
  readonly inviteMember: (request: {
    readonly spaceId: string;
    readonly userId: string;
    readonly email: string;
  }) => Promise<Result<SentInvitation, InvitationFailure>>;
  readonly acceptInvitation: (request: {
    readonly token: string;
    readonly userId: string;
  }) => Promise<Result<MySpace, AcceptanceRefusal>>;
};

export interface SpaceStore {
  createPersonal(personal: PersonalSpace): Promise<void>;
  listOpenMembershipsOf(userId: string): Promise<readonly MySpace[]>;
}

export const createPersonalSpace =
  ({
    store,
    newId,
    now,
  }: {
    readonly store: SpaceStore;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  (user: { readonly id: string; readonly name: string }) =>
    store.createPersonal(
      personalSpaceOf({ user, ids: { space: newId(), member: newId() }, now: now() }),
    );

export const listMySpaces =
  ({ store }: { readonly store: SpaceStore }) =>
  (userId: string) =>
    store.listOpenMembershipsOf(userId);
