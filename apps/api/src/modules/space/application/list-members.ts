import { err, ok, type Result } from "@repo/result";

import { can } from "../domain/can.ts";
import type { Role } from "../domain/space.ts";
import type { MembershipKey, MembershipReader } from "./membership-reader.ts";

export type SpaceMember = {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
};

export type MemberList = {
  readonly activeMembers: (spaceId: string) => Promise<readonly SpaceMember[]>;
};

export const listMembers =
  ({
    memberships,
    members,
  }: {
    readonly memberships: MembershipReader;
    readonly members: MemberList;
  }) =>
  async (key: MembershipKey): Promise<Result<readonly SpaceMember[], "not_found">> => {
    const membership = await memberships.activeMembership(key);
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok(await members.activeMembers(key.spaceId));
  };
