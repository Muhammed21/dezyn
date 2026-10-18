import type { Role } from "./space.ts";

export type Action = "space.read" | "project.create" | "member.invite" | "member.leave";

export type Membership = {
  readonly spaceId: string;
  readonly userId: string;
  readonly role: Role;
};

const PERMISSIONS: Readonly<Record<Role, ReadonlySet<Action>>> = {
  owner: new Set(["space.read", "project.create", "member.invite", "member.leave"]),
  editor: new Set(["space.read", "member.leave"]),
};

export const can = ({
  membership,
  action,
}: {
  readonly membership: Membership | undefined;
  readonly action: Action;
}): boolean => membership !== undefined && PERMISSIONS[membership.role].has(action);
