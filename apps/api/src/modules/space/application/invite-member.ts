import { err, ok, type Result } from "@repo/result";

import type { Mailer } from "../../../platform/mailer.ts";
import { can } from "../domain/can.ts";
import {
  type Invitation,
  invitationOf,
  invitationRefusalOn,
  type PlanRequired,
} from "../domain/invitation.ts";
import type { MembershipReader } from "./membership-reader.ts";
import type { SpaceFinder } from "./read-space.ts";

export interface InvitationStore {
  create(invitation: Invitation): Promise<void>;
}

export type InvitationFailure = "not_found" | "forbidden" | PlanRequired;

export type SentInvitation = {
  readonly id: string;
  readonly email: string;
  readonly expiresAt: Date;
};

const invitationEmail = ({
  to,
  spaceName,
  link,
}: {
  readonly to: string;
  readonly spaceName: string;
  readonly link: string;
}) => ({
  to,
  subject: `Invitation à rejoindre « ${spaceName} » sur dezyn`,
  text: [
    `Vous êtes invité à rejoindre l'espace « ${spaceName} » sur dezyn, en tant qu'éditeur.`,
    "",
    `Acceptez l'invitation dans les 7 jours : ${link}`,
    "",
    "Ce lien ne sert qu'une fois.",
  ].join("\n"),
});

export const inviteMember =
  ({
    memberships,
    spaces,
    invitations,
    mailer,
    newId,
    newToken,
    hashToken,
    now,
    webUrl,
  }: {
    readonly memberships: MembershipReader;
    readonly spaces: SpaceFinder;
    readonly invitations: InvitationStore;
    readonly mailer: Mailer;
    readonly newId: () => string;
    readonly newToken: () => string;
    readonly hashToken: (token: string) => string;
    readonly now: () => Date;
    readonly webUrl: string;
  }) =>
  async ({
    spaceId,
    userId,
    email,
  }: {
    readonly spaceId: string;
    readonly userId: string;
    readonly email: string;
  }): Promise<Result<SentInvitation, InvitationFailure>> => {
    const membership = await memberships.activeMembership({ spaceId, userId });
    if (membership === undefined) {
      return err("not_found");
    }
    if (!can({ membership, action: "member.invite" })) {
      return err("forbidden");
    }
    const space = await spaces.find(spaceId);
    const refusal = invitationRefusalOn(space.plan);
    if (refusal !== undefined) {
      return err(refusal);
    }
    const token = newToken();
    const invitation = invitationOf({
      id: newId(),
      spaceId,
      email,
      tokenHash: hashToken(token),
      invitedBy: userId,
      now: now(),
    });
    await invitations.create(invitation);
    await mailer.send(
      invitationEmail({
        to: email,
        spaceName: space.name,
        link: new URL(`/invitations/${token}`, webUrl).href,
      }),
    );
    return ok({ id: invitation.id, email, expiresAt: invitation.expiresAt });
  };
