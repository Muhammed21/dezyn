export type Plan = "free" | "team";

export type Role = "owner" | "editor";

export type MySpace = {
  readonly id: string;
  readonly name: string;
  readonly plan: Plan;
  readonly role: Role;
};

export type PersonalSpace = {
  readonly space: { readonly id: string; readonly name: string; readonly plan: Plan };
  readonly owner: { readonly id: string; readonly userId: string; readonly role: Role };
  readonly at: Date;
};

export const personalSpaceOf = ({
  user,
  ids,
  now,
}: {
  readonly user: { readonly id: string; readonly name: string };
  readonly ids: { readonly space: string; readonly member: string };
  readonly now: Date;
}): PersonalSpace => ({
  space: { id: ids.space, name: user.name, plan: "free" },
  owner: { id: ids.member, userId: user.id, role: "owner" },
  at: now,
});
