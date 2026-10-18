import type { Plan } from "./space.ts";

export type PlanRequired = { readonly code: "plan_required"; readonly requiredPlan: Plan };

export const invitationRefusalOn = (plan: Plan): PlanRequired | undefined =>
  plan === "team" ? undefined : { code: "plan_required", requiredPlan: "team" };

const INVITATION_LIFETIME_MS = 7 * 86_400_000;

export type Invitation = {
  readonly id: string;
  readonly spaceId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly invitedBy: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
};

export const invitationOf = ({
  id,
  spaceId,
  email,
  tokenHash,
  invitedBy,
  now,
}: {
  readonly id: string;
  readonly spaceId: string;
  readonly email: string;
  readonly tokenHash: string;
  readonly invitedBy: string;
  readonly now: Date;
}): Invitation => ({
  id,
  spaceId,
  email,
  tokenHash,
  invitedBy,
  createdAt: now,
  expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
});
