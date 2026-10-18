import type { Membership } from "../domain/can.ts";
import type { MembershipReader } from "../domain/membership.ts";

export type { MembershipKey, MembershipReader } from "../domain/membership.ts";

export const inMemoryMembershipReader = (memberships: readonly Membership[]): MembershipReader => ({
  activeMembership: async ({ spaceId, userId }) =>
    memberships.find(
      (membership) => membership.spaceId === spaceId && membership.userId === userId,
    ),
});
