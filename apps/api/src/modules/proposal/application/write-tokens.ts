import { err, ok, type Result } from "@repo/result";

import type { TokenDefinition } from "../../token/contracts/token-definition.ts";
import type { CheckTokens, TokenCheck } from "../../token/contracts/token-issues.ts";
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

export type UncheckedTokens = {
  readonly code: "unchecked_tokens";
  readonly checks: readonly TokenCheck[];
};

export const writeTokens =
  ({
    checkTokens,
    unitOfWork,
    newId,
    now,
  }: {
    readonly checkTokens: CheckTokens;
    readonly unitOfWork: PropositionUnitOfWork;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  async ({
    tokens,
    ...writer
  }: Writer & { readonly tokens: readonly TokenDefinition[] }): Promise<
    Result<Written, UncheckedTokens>
  > => {
    const checks = await checkTokens({ projectId: writer.projectId, tokens });
    if (checks.length > 0) {
      return err({ code: "unchecked_tokens", checks });
    }
    return unitOfWork.run(async (store) => {
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
  };
