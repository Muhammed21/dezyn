import { err, ok, type Result } from "@repo/result";

import { can, type Membership } from "../domain/can.ts";
import { type DepartureRefusal, departureRefusal } from "../domain/departure.ts";
import type { MembershipKey } from "./membership-reader.ts";

export type DepartureFailure = "not_found" | DepartureRefusal;

export type DepartureDecision = (facts: {
  readonly membership: Membership | undefined;
  readonly openOwners: number;
}) => Result<{ readonly closedAt: Date }, DepartureFailure>;

export interface Departures {
  leave(key: MembershipKey, decide: DepartureDecision): Promise<Result<void, DepartureFailure>>;
}

export const leaveSpace =
  ({ departures, now }: { readonly departures: Departures; readonly now: () => Date }) =>
  (key: MembershipKey) =>
    departures.leave(key, ({ membership, openOwners }) => {
      if (membership === undefined || !can({ membership, action: "member.leave" })) {
        return err("not_found");
      }
      const refusal = departureRefusal({ role: membership.role, openOwners });
      return refusal === undefined ? ok({ closedAt: now() }) : err(refusal);
    });
