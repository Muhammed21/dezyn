import { err, ok, type Result } from "@repo/result";

import type { HistoryWriter } from "../../history/contracts/history-writer.ts";
import type { ProjectFinder } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";
import type {
  ValidatedTokenFailure,
  ValidatedTokenWriter,
} from "../../token/contracts/token-issues.ts";
import { lotStateAt } from "../domain/proposition-lot.ts";
import {
  type Decision,
  type Proposition,
  type PropositionLot,
  type PropositionStatus,
  review,
} from "../domain/proposition.ts";
import type { ValidatedDefinition, ValidatedTokensOf } from "./write-tokens.ts";

export type BatchSummary = Pick<PropositionLot, "id" | "intention" | "state"> & {
  readonly toReview: number;
};

export type StoredBatchSummary = BatchSummary & Pick<PropositionLot, "lastWrittenAt">;

export type StoredBatch = PropositionLot & { readonly propositions: readonly Proposition[] };

export type Batch = PropositionLot & {
  readonly propositions: readonly (Proposition & {
    readonly validated: ValidatedDefinition | null;
  })[];
};

export interface PropositionReader {
  batchesOf(projectId: string): Promise<readonly StoredBatchSummary[]>;
  batch(batchId: string): Promise<StoredBatch | undefined>;
  pendingTokensOf(
    projectId: string,
  ): Promise<readonly { readonly name: string; readonly $type: string }[]>;
  proposition(
    propositionId: string,
  ): Promise<{ readonly proposition: Proposition; readonly projectId: string } | undefined>;
}

export interface ReviewUnitOfWork {
  run<T>(
    work: (unit: {
      readonly propositions: {
        lock(propositionId: string): Promise<PropositionStatus>;
        settle(propositionId: string, status: "validated" | "rejected"): Promise<void>;
      };
      readonly tokens: ValidatedTokenWriter;
      readonly history: HistoryWriter;
    }) => Promise<T>,
  ): Promise<T>;
}

export type ReviewFailure = "not_found" | "already_reviewed" | ValidatedTokenFailure;

type Access = {
  readonly projects: ProjectFinder;
  readonly memberships: MembershipReader;
};

type Clocked = { readonly now: () => Date };

const spaceOf = async (
  { projects, memberships }: Access,
  {
    projectId,
    userId,
    action,
  }: {
    readonly projectId: string;
    readonly userId: string;
    readonly action: "space.read" | "proposal.review";
  },
): Promise<string | undefined> => {
  const project = await projects.find(projectId);
  if (project === undefined) {
    return undefined;
  }
  const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
  return can({ membership, action }) ? project.spaceId : undefined;
};

export const listBatches =
  ({
    propositions,
    now,
    ...access
  }: Access & Clocked & { readonly propositions: PropositionReader }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<readonly BatchSummary[], "not_found">> => {
    if ((await spaceOf(access, { projectId, userId, action: "space.read" })) === undefined) {
      return err("not_found");
    }
    const at = now();
    return ok(
      (await propositions.batchesOf(projectId)).map(({ id, intention, toReview, ...lot }) => ({
        id,
        intention,
        state: lotStateAt({ lot, now: at }),
        toReview,
      })),
    );
  };

const definitionOf = ({ name, $type, $value, modes, $description }: ValidatedDefinition) => ({
  name,
  $type,
  $value,
  modes,
  $description,
});

const validatedOf = (
  validated: readonly ValidatedDefinition[],
  { name }: Proposition,
): ValidatedDefinition | null => validated.find((token) => token.name === name) ?? null;

export const batchOf =
  ({
    propositions,
    validatedTokensOf,
    now,
    ...access
  }: Access &
    Clocked & {
      readonly propositions: PropositionReader;
      readonly validatedTokensOf: ValidatedTokensOf;
    }) =>
  async ({
    batchId,
    userId,
  }: {
    readonly batchId: string;
    readonly userId: string;
  }): Promise<Result<Batch, "not_found">> => {
    const batch = await propositions.batch(batchId);
    if (
      batch === undefined ||
      (await spaceOf(access, { projectId: batch.projectId, userId, action: "space.read" })) ===
        undefined
    ) {
      return err("not_found");
    }
    const validated = await validatedTokensOf(batch.projectId);
    return ok({
      ...batch,
      state: lotStateAt({ lot: batch, now: now() }),
      propositions: batch.propositions.map((proposition) => ({
        ...proposition,
        validated: validatedOf(validated, proposition),
      })),
    });
  };

export const reviewProposition =
  ({
    propositions,
    validatedTokensOf,
    unitOfWork,
    now,
    ...access
  }: Access & {
    readonly propositions: PropositionReader;
    readonly validatedTokensOf: ValidatedTokensOf;
    readonly unitOfWork: ReviewUnitOfWork;
    readonly now: () => Date;
  }) =>
  async ({
    propositionId,
    userId,
    decision,
    correlationId,
  }: {
    readonly propositionId: string;
    readonly userId: string;
    readonly decision: Decision;
    readonly correlationId: string;
  }): Promise<Result<Proposition, ReviewFailure>> => {
    const found = await propositions.proposition(propositionId);
    const spaceId =
      found === undefined
        ? undefined
        : await spaceOf(access, { projectId: found.projectId, userId, action: "proposal.review" });
    if (found === undefined || spaceId === undefined) {
      return err("not_found");
    }
    const { proposition, projectId } = found;
    return unitOfWork.run(async (unit): Promise<Result<Proposition, ReviewFailure>> => {
      const reviewed = review({ status: await unit.propositions.lock(propositionId), decision });
      if ("refusal" in reviewed) {
        return err("already_reviewed");
      }
      const occurredAt = now();
      const before = validatedOf(await validatedTokensOf(projectId), proposition);
      if (reviewed.status === "validated") {
        const validated = {
          projectId,
          token: proposition.token,
          pending: await propositions.pendingTokensOf(projectId),
          createdAt: occurredAt,
        };
        const failure =
          proposition.kind === "create"
            ? await unit.tokens.create(validated)
            : await unit.tokens.replace(validated);
        if (failure !== undefined) {
          return err(failure);
        }
      }
      await unit.propositions.settle(propositionId, reviewed.status);
      await unit.history.append({
        spaceId,
        projectId,
        action: `proposition.${reviewed.status}`,
        userId,
        clientId: null,
        before: before === null ? null : definitionOf(before),
        after: { propositionId, token: proposition.token },
        correlationId,
        occurredAt,
      });
      return ok({ ...proposition, status: reviewed.status });
    });
  };
