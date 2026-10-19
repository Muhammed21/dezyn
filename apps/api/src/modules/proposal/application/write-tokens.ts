import { ok, type Result } from "@repo/result";

import type { TokenDefinition } from "../../token/contracts/token-definition.ts";
import type { Proposition, PropositionLot } from "../domain/proposition.ts";

export type Writer = {
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
};

export interface PropositionStore {
  openLotOf(candidate: PropositionLot): Promise<PropositionLot>;
  propose(propositions: readonly Proposition[]): Promise<void>;
}

export interface PropositionUnitOfWork {
  run<T>(work: (store: PropositionStore) => Promise<T>): Promise<T>;
}

export type Written = {
  readonly lot: PropositionLot;
  readonly propositions: readonly Proposition[];
};

export const writeTokens =
  ({
    unitOfWork,
    newId,
    now,
  }: {
    readonly unitOfWork: PropositionUnitOfWork;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  ({
    tokens,
    ...writer
  }: Writer & { readonly tokens: readonly TokenDefinition[] }): Promise<Result<Written, never>> =>
    unitOfWork.run(async (store) => {
      const createdAt = now();
      const lot = await store.openLotOf({
        id: newId(),
        ...writer,
        intention: null,
        state: "open",
        openedAt: createdAt,
      });
      const propositions = tokens.map((token): Proposition => ({
        id: newId(),
        lotId: lot.id,
        name: token.name,
        kind: "create",
        token,
        status: "proposed",
        createdAt,
      }));
      await store.propose(propositions);
      return ok({ lot, propositions });
    });
