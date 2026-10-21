import { err, ok, type Result } from "@repo/result";

import { can, type Membership } from "../domain/can.ts";
import type { DepartureRefusal } from "../domain/departure.ts";
import {
  type RemovalRefusal,
  removalRefusal,
  roleChangeRefusal,
} from "../domain/member-management.ts";
import type { Role } from "../domain/space.ts";

export type ClosedReason = "role_changed" | "removed";

export interface LockedMembers {
  readonly members: readonly Membership[];
  readonly close: (closed: {
    readonly userId: string;
    readonly reason: ClosedReason;
    readonly closedAt: Date;
  }) => Promise<void>;
  readonly open: (opened: {
    readonly id: string;
    readonly userId: string;
    readonly role: Role;
    readonly joinedAt: Date;
  }) => Promise<void>;
}

export interface MemberManagement {
  run<T>(spaceId: string, work: (locked: LockedMembers) => Promise<T>): Promise<T>;
}

export type ManagementFailure = "not_found" | "forbidden";

export type RoleChangeFailure = ManagementFailure | DepartureRefusal;

export type RemovalFailure = ManagementFailure | RemovalRefusal;

type Request = {
  readonly spaceId: string;
  readonly userId: string;
  readonly memberId: string;
};

const managedMember = (
  members: readonly Membership[],
  { userId, memberId }: Request,
): Result<Membership, ManagementFailure> => {
  const actor = members.find((member) => member.userId === userId);
  if (actor === undefined) {
    return err("not_found");
  }
  if (!can({ membership: actor, action: "member.manage" })) {
    return err("forbidden");
  }
  const target = members.find((member) => member.userId === memberId);
  return target === undefined ? err("not_found") : ok(target);
};

const ownersAmong = (members: readonly Membership[]) =>
  members.filter((member) => member.role === "owner").length;

export const changeRole =
  ({
    management,
    newId,
    now,
  }: {
    readonly management: MemberManagement;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  (
    request: Request & { readonly role: Role },
  ): Promise<Result<{ readonly userId: string; readonly role: Role }, RoleChangeFailure>> =>
    management.run(request.spaceId, async ({ members, close, open }) => {
      const target = managedMember(members, request);
      if (!target.ok) {
        return target;
      }
      const changed = { userId: target.value.userId, role: request.role };
      if (target.value.role === request.role) {
        return ok(changed);
      }
      const refusal = roleChangeRefusal({
        current: target.value.role,
        next: request.role,
        openOwners: ownersAmong(members),
      });
      if (refusal !== undefined) {
        return err(refusal);
      }
      const at = now();
      await close({ userId: changed.userId, reason: "role_changed", closedAt: at });
      await open({ id: newId(), userId: changed.userId, role: changed.role, joinedAt: at });
      return ok(changed);
    });

export const removeMember =
  ({ management, now }: { readonly management: MemberManagement; readonly now: () => Date }) =>
  (request: Request): Promise<Result<void, RemovalFailure>> =>
    management.run(request.spaceId, async ({ members, close }) => {
      const target = managedMember(members, request);
      if (!target.ok) {
        return target;
      }
      const refusal = removalRefusal({ actorId: request.userId, targetId: target.value.userId });
      if (refusal !== undefined) {
        return err(refusal);
      }
      await close({ userId: target.value.userId, reason: "removed", closedAt: now() });
      return ok(undefined);
    });
