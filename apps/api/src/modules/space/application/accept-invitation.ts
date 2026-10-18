import { err, ok, type Result } from "@repo/result";

import {
  type AcceptanceFacts,
  type AcceptanceRefusal,
  acceptanceRefusal,
} from "../domain/acceptance.ts";
import type { MySpace } from "../domain/space.ts";

export type NewMember = { readonly id: string; readonly joinedAt: Date };

export type AcceptanceDecision = (
  facts: Omit<AcceptanceFacts, "now">,
) => Result<NewMember, AcceptanceRefusal>;

export interface InvitationAcceptance {
  accept(
    request: { readonly tokenHash: string; readonly userId: string },
    decide: AcceptanceDecision,
  ): Promise<Result<MySpace, AcceptanceRefusal>>;
}

export const acceptInvitation =
  ({
    acceptance,
    hashToken,
    newId,
    now,
  }: {
    readonly acceptance: InvitationAcceptance;
    readonly hashToken: (token: string) => string;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  ({ token, userId }: { readonly token: string; readonly userId: string }) => {
    const at = now();
    return acceptance.accept({ tokenHash: hashToken(token), userId }, (facts) => {
      const refusal = acceptanceRefusal({ ...facts, now: at });
      return refusal === undefined ? ok({ id: newId(), joinedAt: at }) : err(refusal);
    });
  };
