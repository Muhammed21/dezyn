import type { Membership } from "../domain/can.ts";

export type MembershipKey = { readonly spaceId: string; readonly userId: string };

export interface MembershipReader {
  activeMembership(key: MembershipKey): Promise<Membership | undefined>;
}

export const inMemoryMembershipReader = (memberships: readonly Membership[]): MembershipReader => ({
  activeMembership: async ({ spaceId, userId }) =>
    memberships.find(
      (membership) => membership.spaceId === spaceId && membership.userId === userId,
    ),
});
