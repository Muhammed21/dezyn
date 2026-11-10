import type { Plan } from "#modules/space/contracts/plan.ts";
import { storageLimitOf } from "#modules/space/contracts/storage-limit.ts";

import {
  entriesToPurge,
  PURGE_BATCH_SIZE,
  type PurgeableEntry,
  purgeTargetOf,
} from "../domain/history-purge.ts";

export type SpaceStorage = { readonly plan: Plan; readonly storedBytes: number };

export type PurgeCandidate = SpaceStorage & {
  readonly spaceId: string;
  readonly projectIds: readonly string[];
};

export type PurgedProject = {
  readonly projectId: string;
  readonly deletedEntries: number;
  readonly purgedBefore: Date;
};

export type PurgedSpace = {
  readonly spaceId: string;
  readonly projects: readonly PurgedProject[];
};

export interface PurgeCandidates {
  list(): Promise<readonly PurgeCandidate[]>;
}

export interface PurgeBatch {
  storage(): Promise<SpaceStorage>;
  oldestEntriesOf(projectId: string, count: number): Promise<readonly PurgeableEntry[]>;
  purge(input: {
    readonly projectId: string;
    readonly entryIds: readonly string[];
    readonly purgedBefore: Date;
    readonly purgedAt: Date;
  }): Promise<void>;
}

export interface PurgeUnitOfWork {
  batch(
    spaceId: string,
    work: (unit: PurgeBatch) => Promise<PurgedProject | undefined>,
  ): Promise<PurgedProject | undefined>;
}

const excessOf = ({ plan, storedBytes }: SpaceStorage) =>
  storedBytes - purgeTargetOf(storageLimitOf(plan));

const reachesLimit = ({ plan, storedBytes }: SpaceStorage) => storedBytes >= storageLimitOf(plan);

const oldestOfFirstWithEntries = async (
  unit: PurgeBatch,
  [projectId, ...others]: readonly string[],
): Promise<
  | { readonly projectId: string; readonly oldest: readonly [PurgeableEntry, ...PurgeableEntry[]] }
  | undefined
> => {
  if (projectId === undefined) {
    return undefined;
  }
  const [first, ...rest] = await unit.oldestEntriesOf(projectId, PURGE_BATCH_SIZE);
  return first === undefined
    ? oldestOfFirstWithEntries(unit, others)
    : { projectId, oldest: [first, ...rest] };
};

const purgeBatch = async (
  unit: PurgeBatch,
  { projectIds, purgedAt }: { readonly projectIds: readonly string[]; readonly purgedAt: Date },
): Promise<PurgedProject | undefined> => {
  const excess = excessOf(await unit.storage());
  if (excess <= 0) {
    return undefined;
  }
  const found = await oldestOfFirstWithEntries(unit, projectIds);
  if (found === undefined) {
    return undefined;
  }
  const { ids, purgedBefore } = entriesToPurge({ oldest: found.oldest, excess });
  await unit.purge({ projectId: found.projectId, entryIds: ids, purgedBefore, purgedAt });
  return { projectId: found.projectId, deletedEntries: ids.length, purgedBefore };
};

const withBatch = (purged: readonly PurgedProject[], batch: PurgedProject) => {
  const last = purged.at(-1);
  return last?.projectId === batch.projectId
    ? [
        ...purged.slice(0, -1),
        { ...batch, deletedEntries: last.deletedEntries + batch.deletedEntries },
      ]
    : [...purged, batch];
};

export const purgeHistory =
  ({
    candidates,
    unitOfWork,
    now,
    budgetMs,
  }: {
    readonly candidates: PurgeCandidates;
    readonly unitOfWork: PurgeUnitOfWork;
    readonly now: () => Date;
    readonly budgetMs: number;
  }) =>
  async (): Promise<readonly PurgedSpace[]> => {
    const startedAt = now();
    const withinBudget = () => now().getTime() - startedAt.getTime() < budgetMs;
    const purgeSpace = async (
      { spaceId, projectIds }: Pick<PurgeCandidate, "spaceId" | "projectIds">,
      purged: readonly PurgedProject[],
    ): Promise<readonly PurgedProject[]> => {
      if (!withinBudget()) {
        return purged;
      }
      const batch = await unitOfWork.batch(spaceId, (unit) =>
        purgeBatch(unit, { projectIds, purgedAt: startedAt }),
      );
      return batch === undefined
        ? purged
        : purgeSpace({ spaceId, projectIds }, withBatch(purged, batch));
    };
    const spaces = (await candidates.list()).filter(reachesLimit);
    return spaces.reduce<Promise<readonly PurgedSpace[]>>(async (previous, candidate) => {
      const report = await previous;
      const projects = await purgeSpace(candidate, []);
      return projects.length === 0 ? report : [...report, { spaceId: candidate.spaceId, projects }];
    }, Promise.resolve([]));
  };
