const PLANS = ["free", "team"] as const;

const ROLES = ["owner", "editor"] as const;

const ACTIONS = [
  "space.read",
  "project.create",
  "member.invite",
  "member.leave",
  "member.manage",
  "token.create",
  "token.declareFigmaState",
  "proposal.review",
] as const;

export type Plan = (typeof PLANS)[number] | "unknown";

export type Role = (typeof ROLES)[number] | "unknown";

export type Action = (typeof ACTIONS)[number];

export type Space = {
  readonly id: string;
  readonly name: string;
  readonly plan: Plan;
  readonly role: Role;
  readonly allowedActions: readonly Action[];
};

export type SpaceFailure = "unauthenticated" | "not_found" | "unavailable" | "invalid_response";

export const planOf = (value: string): Plan => PLANS.find((plan) => plan === value) ?? "unknown";

export const roleOf = (value: string): Role => ROLES.find((role) => role === value) ?? "unknown";

export const knownActionsOf = (values: readonly string[]): readonly Action[] =>
  ACTIONS.filter((action) => values.includes(action));
