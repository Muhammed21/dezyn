const PLANS = ["free", "team"] as const;

const ROLES = ["owner", "editor"] as const;

export type Plan = (typeof PLANS)[number] | "unknown";

export type Role = (typeof ROLES)[number] | "unknown";

export type Space = {
  readonly id: string;
  readonly name: string;
  readonly plan: Plan;
  readonly role: Role;
};

export const planOf = (value: string): Plan => PLANS.find((plan) => plan === value) ?? "unknown";

export const roleOf = (value: string): Role => ROLES.find((role) => role === value) ?? "unknown";
