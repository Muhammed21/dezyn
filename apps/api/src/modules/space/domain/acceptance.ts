import { invitationRefusalOn, type PlanRequired } from "./invitation.ts";
import type { Plan } from "./space.ts";

export type AcceptanceRefusal = "gone" | "email_mismatch" | "already_member" | PlanRequired;

export type AcceptanceFacts = {
  readonly invitation: {
    readonly email: string;
    readonly expiresAt: Date;
    readonly acceptedAt: Date | null;
  };
  readonly plan: Plan;
  readonly alreadyMember: boolean;
  readonly email: string;
  readonly now: Date;
};

const sameEmail = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

export const acceptanceRefusal = ({
  invitation,
  plan,
  alreadyMember,
  email,
  now,
}: AcceptanceFacts): AcceptanceRefusal | undefined => {
  if (invitation.acceptedAt !== null || now >= invitation.expiresAt) {
    return "gone";
  }
  if (!sameEmail(invitation.email, email)) {
    return "email_mismatch";
  }
  if (alreadyMember) {
    return "already_member";
  }
  return invitationRefusalOn(plan);
};
