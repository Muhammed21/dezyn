import { err, ok, type Result } from "@repo/result";

import { can } from "../domain/can.ts";
import type { MySpace, Plan } from "../domain/space.ts";
import type { MembershipKey, MembershipReader } from "./membership-reader.ts";

export type SpaceFinder = {
  readonly find: (
    spaceId: string,
  ) => Promise<{ readonly id: string; readonly name: string; readonly plan: Plan }>;
};

export const readSpace =
  ({
    memberships,
    spaces,
  }: {
    readonly memberships: MembershipReader;
    readonly spaces: SpaceFinder;
  }) =>
  async (key: MembershipKey): Promise<Result<MySpace, "not_found">> => {
    const membership = await memberships.activeMembership(key);
    if (membership === undefined || !can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok({ ...(await spaces.find(key.spaceId)), role: membership.role });
  };
