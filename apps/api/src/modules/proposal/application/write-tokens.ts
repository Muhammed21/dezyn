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

export type Replaced = { readonly id: string; readonly name: string; readonly lotId: string };

export interface PropositionStore {
  pendingOf(projectId: string, names: readonly string[]): Promise<readonly Proposition[]>;
  replace(propositionIds: readonly string[]): Promise<void>;
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
  readonly replaced: readonly Replaced[];
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
    return unitOfWork.run(async (store) => {
      const pending = await store.pendingOf(
        writer.projectId,
        tokens.map(({ name }) => name),
      );
      const written = tokens.map((token) => {
        const current = validated.find(({ name }) => name === token.name);
        const waiting = pending.find(({ name }) => name === token.name);
        const sameAsWaiting = waiting !== undefined && sameDefinition(waiting.token, token);
        const sameAsValidated = current !== undefined && sameDefinition(current, token);
        return {
          token,
          current,
          replaces: sameAsWaiting ? undefined : waiting,
          unchanged: sameAsWaiting || sameAsValidated,
        };
      });
      const replaced = written.flatMap(({ replaces }): readonly Replaced[] =>
        replaces === undefined
          ? []
          : [{ id: replaces.id, name: replaces.name, lotId: replaces.lotId }],
      );
      await store.replace(replaced.map(({ id }) => id));
      const unchanged = written.filter((entry) => entry.unchanged).map(({ token }) => token.name);
      const changed = written.filter((entry) => !entry.unchanged);
      if (changed.length === 0) {
        return ok({
          lot: (await store.findOpenLot(writer)) ?? null,
          propositions: [],
          unchanged,
          replaced,
        });
      }
      const createdAt = now();
      const lot = await store.openLotOf({
        id: newId(),
        ...writer,
        intention: null,
        state: "open",
        openedAt: createdAt,
      });
      const propositions = changed.map(({ token, current }): Proposition => ({
        id: newId(),
        lotId: lot.id,
        name: token.name,
        kind: current === undefined ? "create" : "update",
        token,
        status: "proposed",
        createdAt,
      }));
      await store.propose(propositions);
      return ok({ lot, propositions, unchanged, replaced });
    });
  };
