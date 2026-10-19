import type { TokenDefinition } from "../../token/contracts/token-definition.ts";

export type PropositionLot = {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly intention: string | null;
  readonly state: "open";
  readonly openedAt: Date;
};

export type Proposition = {
  readonly id: string;
  readonly lotId: string;
  readonly name: string;
  readonly kind: "create";
  readonly token: TokenDefinition;
  readonly status: "proposed";
  readonly createdAt: Date;
};
