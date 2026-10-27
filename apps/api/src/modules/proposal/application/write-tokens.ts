import type {
  StorageAlertDecision,
  StorageAlertSender,
} from "#modules/space/contracts/storage-alert.ts";
import {
  type ComparedDefinition,
  sameDefinition,
  type TokenDefinition,
} from "#modules/token/contracts/token-definition.ts";
import {
  type CheckTokens,
  groupConflict,
  type TokenCheck,
} from "#modules/token/contracts/token-issues.ts";
import { err, ok, type Result } from "@repo/result";

import type { Proposal, ProposalBatch } from "../domain/proposal.ts";
import { liveBatchOf } from "./proposal-batches.ts";

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

export type Replaced = { readonly id: string; readonly name: string; readonly batchId: string };

export interface ProposalStore {
  pendingNamesOf(projectId: string): Promise<readonly string[]>;
  pendingOf(projectId: string, names: readonly string[]): Promise<readonly Proposal[]>;
  replace(proposalIds: readonly string[]): Promise<void>;
  findOpenBatch(writer: Writer): Promise<ProposalBatch | undefined>;
  openBatchOf(candidate: ProposalBatch): Promise<ProposalBatch>;
  closeBatch(batchId: string): Promise<void>;
  touchBatch(batchId: string, lastWrittenAt: Date): Promise<void>;
  propose(projectId: string, proposals: readonly Proposal[]): Promise<void>;
}

export interface ProposalUnitOfWork {
  run<T>(
    work: (store: ProposalStore, storageAlert: StorageAlertDecision) => Promise<T>,
  ): Promise<T>;
}

export type Written = {
  readonly batch: ProposalBatch | null;
  readonly proposals: readonly Proposal[];
  readonly unchanged: readonly string[];
  readonly replaced: readonly Replaced[];
};

export type UncheckedTokens = {
  readonly code: "unchecked_tokens";
  readonly checks: readonly TokenCheck[];
};

export type ProposedTokens = Writer & {
  readonly tokens: readonly TokenDefinition[];
  readonly validated: readonly ValidatedDefinition[];
  readonly createdAt: Date;
};

export const proposeTokens = async (
  store: ProposalStore,
  {
    tokens,
    validated,
    createdAt,
    newId,
    ...writer
  }: ProposedTokens & { readonly newId: () => string },
): Promise<Written> => {
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
      : [{ id: replaces.id, name: replaces.name, batchId: replaces.batchId }],
  );
  await store.replace(replaced.map(({ id }) => id));
  const unchanged = written.filter((entry) => entry.unchanged).map(({ token }) => token.name);
  const changed = written.filter((entry) => !entry.unchanged);
  const live = await liveBatchOf(store, { writer, now: createdAt });
  if (changed.length === 0) {
    return { batch: live ?? null, proposals: [], unchanged, replaced };
  }
  const batch =
    live ??
    (await store.openBatchOf({
      id: newId(),
      ...writer,
      intent: null,
      state: "open",
      openedAt: createdAt,
      lastWrittenAt: createdAt,
    }));
  await store.touchBatch(batch.id, createdAt);
  const proposals = changed.map(({ token, current }): Proposal => ({
    id: newId(),
    batchId: batch.id,
    name: token.name,
    kind: current === undefined ? "create" : "update",
    token,
    status: "proposed",
    createdAt,
  }));
  await store.propose(writer.projectId, proposals);
  return { batch, proposals, unchanged, replaced };
};

const nameConflicts = (
  tokens: readonly TokenDefinition[],
  projectNames: readonly string[],
): readonly TokenCheck[] =>
  tokens.flatMap((token, index): readonly TokenCheck[] => {
    const other = groupConflict(token.name, [...projectNames, ...tokens.map(({ name }) => name)]);
    return other === undefined ? [] : [{ index, failure: { code: "name_conflict", other } }];
  });

export const writeTokens =
  ({
    checkTokens,
    validatedTokensOf,
    unitOfWork,
    sendStorageAlert,
    newId,
    now,
  }: {
    readonly checkTokens: CheckTokens;
    readonly validatedTokensOf: ValidatedTokensOf;
    readonly unitOfWork: ProposalUnitOfWork;
    readonly sendStorageAlert: StorageAlertSender;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  async ({
    tokens,
    spaceId,
    ...writer
  }: Writer & {
    readonly spaceId: string;
    readonly tokens: readonly TokenDefinition[];
  }): Promise<Result<Written, UncheckedTokens>> => {
    const checks = await checkTokens({ projectId: writer.projectId, tokens });
    if (checks.length > 0) {
      return err({ code: "unchecked_tokens", checks });
    }
    const validated = await validatedTokensOf(writer.projectId);
    const outcome = await unitOfWork.run(async (store, storageAlert) => {
      const conflicts = nameConflicts(tokens, [
        ...validated.map(({ name }) => name),
        ...(await store.pendingNamesOf(writer.projectId)),
      ]);
      if (conflicts.length > 0) {
        const refused: UncheckedTokens = { code: "unchecked_tokens", checks: conflicts };
        return err(refused);
      }
      return ok({
        written: await proposeTokens(store, {
          ...writer,
          tokens,
          validated,
          createdAt: now(),
          newId,
        }),
        alert: await storageAlert(spaceId),
      });
    });
    if (!outcome.ok) {
      return outcome;
    }
    if (outcome.value.alert !== undefined) {
      await sendStorageAlert(outcome.value.alert);
    }
    return ok(outcome.value.written);
  };
