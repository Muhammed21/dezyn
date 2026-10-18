import type { Membership } from "./can.ts";

export type MembershipKey = { readonly spaceId: string; readonly userId: string };

export interface MembershipReader {
  activeMembership(key: MembershipKey): Promise<Membership | undefined>;
}
