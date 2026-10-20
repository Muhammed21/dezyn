import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import type { TokenDefinition } from "#modules/token/contracts/token-definition.ts";
import type {
  ValidatedTokenFailure,
  ValidatedTokenWriter,
} from "#modules/token/contracts/token-issues.ts";
import { err, ok, type Result } from "@repo/result";

import { planBatchValidation } from "../domain/batch-validation.ts";
import { batchStateAt } from "../domain/proposal-batch.ts";
import {
  type Decision,
  type Proposal,
  type ProposalBatch,
  type ProposalStatus,
  review,
} from "../domain/proposal.ts";
import type { ValidatedDefinition, ValidatedTokensOf } from "./write-tokens.ts";

export type BatchSummary = Pick<ProposalBatch, "id" | "intent" | "state"> & {
  readonly toReview: number;
};

export type StoredBatchSummary = BatchSummary & Pick<ProposalBatch, "lastWrittenAt">;

export type StoredBatch = ProposalBatch & { readonly proposals: readonly Proposal[] };

export type Batch = ProposalBatch & {
  readonly proposals: readonly (Proposal & {
    readonly validated: ValidatedDefinition | null;
  })[];
};

export interface ProposalReader {
  batchesOf(projectId: string): Promise<readonly StoredBatchSummary[]>;
  batch(batchId: string): Promise<StoredBatch | undefined>;
  pendingTokensOf(
    projectId: string,
  ): Promise<readonly { readonly name: string; readonly $type: string }[]>;
  pendingProposalsOf(projectId: string): Promise<
    readonly (Proposal & {
      readonly batch: Pick<ProposalBatch, "id" | "state" | "lastWrittenAt">;
    })[]
  >;
  proposal(
    proposalId: string,
  ): Promise<{ readonly proposal: Proposal; readonly projectId: string } | undefined>;
}

export interface FigmaStateSynchronizer {
  proposalValidated(proposalId: string): Promise<void>;
  proposalRejected(rejected: {
    readonly proposalId: string;
    readonly token: TokenDefinition;
  }): Promise<void>;
}

export type ReviewUnit = {
  readonly proposals: {
    lock(proposalId: string): Promise<ProposalStatus>;
    lockBatch(
      batchId: string,
    ): Promise<readonly { readonly id: string; readonly status: ProposalStatus }[]>;
    settle(proposalId: string, status: "validated" | "rejected"): Promise<void>;
  };
  readonly tokens: ValidatedTokenWriter;
  readonly figmaStates: FigmaStateSynchronizer;
  readonly history: HistoryWriter;
};

export interface ReviewUnitOfWork {
  run<T, E>(work: (unit: ReviewUnit) => Promise<Result<T, E>>): Promise<Result<T, E>>;
}

export type ReviewFailure = "not_found" | "already_reviewed" | ValidatedTokenFailure;

type Access = { readonly access: ProjectAccess };

type Clocked = { readonly now: () => Date };

export const listBatches =
  ({ proposals, now, access }: Access & Clocked & { readonly proposals: ProposalReader }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<readonly BatchSummary[], "not_found">> => {
    if ((await access({ projectId, userId, action: "space.read" })) === undefined) {
      return err("not_found");
    }
    const at = now();
    return ok(
      (await proposals.batchesOf(projectId)).map(({ id, intent, toReview, ...batch }) => ({
        id,
        intent,
        state: batchStateAt({ batch, now: at }),
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
  { name }: Proposal,
): ValidatedDefinition | null => validated.find((token) => token.name === name) ?? null;

export const batchOf =
  ({
    proposals,
    validatedTokensOf,
    now,
    access,
  }: Access &
    Clocked & {
      readonly proposals: ProposalReader;
      readonly validatedTokensOf: ValidatedTokensOf;
    }) =>
  async ({
    batchId,
    userId,
  }: {
    readonly batchId: string;
    readonly userId: string;
  }): Promise<Result<Batch, "not_found">> => {
    const batch = await proposals.batch(batchId);
    if (
      batch === undefined ||
      (await access({ projectId: batch.projectId, userId, action: "space.read" })) === undefined
    ) {
      return err("not_found");
    }
    const validated = await validatedTokensOf(batch.projectId);
    return ok({
      ...batch,
      state: batchStateAt({ batch: batch, now: now() }),
      proposals: batch.proposals.map((proposal) => ({
        ...proposal,
        validated: validatedOf(validated, proposal),
      })),
    });
  };

export const reviewProposal =
  ({
    proposals,
    validatedTokensOf,
    unitOfWork,
    now,
    access,
  }: Access & {
    readonly proposals: ProposalReader;
    readonly validatedTokensOf: ValidatedTokensOf;
    readonly unitOfWork: ReviewUnitOfWork;
    readonly now: () => Date;
  }) =>
  async ({
    proposalId,
    userId,
    decision,
    correlationId,
  }: {
    readonly proposalId: string;
    readonly userId: string;
    readonly decision: Decision;
    readonly correlationId: string;
  }): Promise<Result<Proposal, ReviewFailure>> => {
    const found = await proposals.proposal(proposalId);
    const spaceId =
      found === undefined
        ? undefined
        : (await access({ projectId: found.projectId, userId, action: "proposal.review" }))
            ?.spaceId;
    if (found === undefined || spaceId === undefined) {
      return err("not_found");
    }
    const { proposal, projectId } = found;
    return unitOfWork.run(async (unit): Promise<Result<Proposal, ReviewFailure>> => {
      const reviewed = review({ status: await unit.proposals.lock(proposalId), decision });
      if ("refusal" in reviewed) {
        return err("already_reviewed");
      }
      const occurredAt = now();
      const before = validatedOf(await validatedTokensOf(projectId), proposal);
      if (reviewed.status === "validated") {
        const validated = {
          projectId,
          token: proposal.token,
          pending: await proposals.pendingTokensOf(projectId),
          createdAt: occurredAt,
        };
        const failure =
          proposal.kind === "create"
            ? await unit.tokens.create(validated)
            : await unit.tokens.replace(validated);
        if (failure !== undefined) {
          return err(failure);
        }
        await unit.figmaStates.proposalValidated(proposalId);
      } else {
        await unit.figmaStates.proposalRejected({ proposalId, token: proposal.token });
      }
      await unit.proposals.settle(proposalId, reviewed.status);
      await unit.history.append({
        spaceId,
        projectId,
        action: `proposal.${reviewed.status}`,
        userId,
        clientId: null,
        before: before === null ? null : definitionOf(before),
        after: { proposalId, token: proposal.token },
        correlationId,
        occurredAt,
      });
      return ok({ ...proposal, status: reviewed.status });
    });
  };

export type InvalidProposal = {
  readonly code: "invalid_proposition";
  readonly proposalId: string;
  readonly failure: ValidatedTokenFailure;
};

export type BatchValidationFailure =
  | "not_found"
  | "batch_open"
  | { readonly code: "unknown_propositions"; readonly ids: readonly string[] }
  | InvalidProposal;

export type ValidatedBatch = {
  readonly id: string;
  readonly state: "closed";
  readonly validated: readonly string[];
  readonly rejected: readonly string[];
};

type Decided = {
  readonly proposal: Proposal;
  readonly status: "validated" | "rejected";
};

const inSequence = async <Item, Failure>(
  items: readonly Item[],
  step: (item: Item) => Promise<Failure | undefined>,
): Promise<Failure | undefined> =>
  items.reduce<Promise<Failure | undefined>>(
    async (previous, item) => (await previous) ?? step(item),
    Promise.resolve(undefined),
  );

export const validateBatch =
  ({
    proposals,
    validatedTokensOf,
    unitOfWork,
    now,
    access,
  }: Access & {
    readonly proposals: ProposalReader;
    readonly validatedTokensOf: ValidatedTokensOf;
    readonly unitOfWork: ReviewUnitOfWork;
    readonly now: () => Date;
  }) =>
  async ({
    batchId,
    userId,
    rejected,
    correlationId,
  }: {
    readonly batchId: string;
    readonly userId: string;
    readonly rejected: readonly string[];
    readonly correlationId: string;
  }): Promise<Result<ValidatedBatch, BatchValidationFailure>> => {
    const batch = await proposals.batch(batchId);
    const spaceId =
      batch === undefined
        ? undefined
        : (await access({ projectId: batch.projectId, userId, action: "proposal.review" }))
            ?.spaceId;
    if (batch === undefined || spaceId === undefined) {
      return err("not_found");
    }
    const { projectId } = batch;
    const occurredAt = now();
    const validated = await validatedTokensOf(projectId);
    const pending = await proposals.pendingTokensOf(projectId);
    return unitOfWork.run(async (unit): Promise<Result<ValidatedBatch, BatchValidationFailure>> => {
      const locked = await unit.proposals.lockBatch(batchId);
      const plan = planBatchValidation({
        batchState: batchStateAt({ batch: batch, now: occurredAt }),
        proposals: batch.proposals.map((proposal) => ({
          ...proposal,
          status: locked.find(({ id }) => id === proposal.id)?.status ?? proposal.status,
        })),
        rejected,
      });
      if ("refusal" in plan) {
        return err(
          plan.refusal === "batch_open"
            ? "batch_open"
            : { code: "unknown_propositions", ids: plan.ids },
        );
      }
      const invalid = await inSequence(
        plan.toValidate,
        async (proposal): Promise<InvalidProposal | undefined> => {
          const written = { projectId, token: proposal.token, pending, createdAt: occurredAt };
          const failure =
            proposal.kind === "create"
              ? await unit.tokens.create(written)
              : await unit.tokens.replace(written);
          return failure === undefined
            ? undefined
            : { code: "invalid_proposition", proposalId: proposal.id, failure };
        },
      );
      if (invalid !== undefined) {
        return err(invalid);
      }
      const decided = [
        ...plan.toValidate.map((proposal): Decided => ({ proposal, status: "validated" })),
        ...plan.toReject.map((proposal): Decided => ({ proposal, status: "rejected" })),
      ];
      await inSequence(decided, async ({ proposal, status }) => {
        const before = validatedOf(validated, proposal);
        await unit.proposals.settle(proposal.id, status);
        if (status === "validated") {
          await unit.figmaStates.proposalValidated(proposal.id);
        } else {
          await unit.figmaStates.proposalRejected({
            proposalId: proposal.id,
            token: proposal.token,
          });
        }
        await unit.history.append({
          spaceId,
          projectId,
          action: `proposal.${status}`,
          userId,
          clientId: null,
          before: before === null ? null : definitionOf(before),
          after: { proposalId: proposal.id, token: proposal.token },
          correlationId,
          occurredAt,
        });
        return undefined;
      });
      return ok({
        id: batchId,
        state: "closed",
        validated: plan.toValidate.map(({ id }) => id),
        rejected: plan.toReject.map(({ id }) => id),
      });
    });
  };

export const pendingProposalsOf =
  ({ proposals, now }: { readonly proposals: ProposalReader; readonly now: () => Date }) =>
  async (projectId: string) => {
    const at = now();
    return (await proposals.pendingProposalsOf(projectId)).map(
      ({ id, name, kind, status, token, batch }) => ({
        id,
        name,
        kind,
        status,
        batch: { id: batch.id, state: batchStateAt({ batch, now: at }) },
        token,
      }),
    );
  };
