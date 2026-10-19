import { err, ok, type Result } from "@repo/result";

import {
  type ComparedDefinition,
  sameDefinition,
  type TokenDefinition,
} from "../../token/contracts/token-definition.ts";
import type { CheckTokens, TokenCheck } from "../../token/contracts/token-issues.ts";
import type { Proposition, PropositionLot } from "../domain/proposition.ts";

export type Writer = {
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
};

export type ValidatedDefinition = ComparedDefinition & {
  readonly name: string;
  readonly $type: string;
};

export type ValidatedTokensOf = (projectId: string) => Promise<readonly ValidatedDefinition[]>;

export interface PropositionStore {
  findOpenLot(writer: Writer): Promise<PropositionLot | undefined>;
  openLotOf(candidate: PropositionLot): Promise<PropositionLot>;
  propose(propositions: readonly Proposition[]): Promise<void>;
}

export interface PropositionUnitOfWork {
  run<T>(work: (store: PropositionStore) => Promise<T>): Promise<T>;
}

export type Written = {
  readonly lot: PropositionLot | null;
  readonly propositions: readonly Proposition[];
  readonly unchanged: readonly string[];
};

export type UncheckedTokens = {
  readonly code: "unchecked_tokens";
  readonly checks: readonly TokenCheck[];
};

export const writeTokens =
  ({
    checkTokens,
    validatedTokensOf,
    unitOfWork,
    newId,
    now,
  }: {
    readonly checkTokens: CheckTokens;
    readonly validatedTokensOf: ValidatedTokensOf;
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
    const validated = await validatedTokensOf(writer.projectId);
    const written = tokens.map((token) => ({
      token,
      validated: validated.find(({ name }) => name === token.name),
    }));
    const unchanged = written
      .filter(
        ({ token, validated: current }) => current !== undefined && sameDefinition(current, token),
      )
      .map(({ token }) => token.name);
    const changed = written.filter(({ token }) => !unchanged.includes(token.name));
    return unitOfWork.run(async (store) => {
      if (changed.length === 0) {
        return ok({ lot: (await store.findOpenLot(writer)) ?? null, propositions: [], unchanged });
      }
      const createdAt = now();
      const lot = await store.openLotOf({
        id: newId(),
        ...writer,
        intention: null,
        state: "open",
        openedAt: createdAt,
      });
      const propositions = changed.map(({ token, validated: current }): Proposition => ({
        id: newId(),
        lotId: lot.id,
        name: token.name,
        kind: current === undefined ? "create" : "update",
        token,
        status: "proposed",
        createdAt,
      }));
      await store.propose(propositions);
      return ok({ lot, propositions, unchanged });
    });
  };
