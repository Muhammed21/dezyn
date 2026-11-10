import type { Plan } from "#modules/space/contracts/plan.ts";
import { storageLimitOf } from "#modules/space/contracts/storage-limit.ts";

import {
  entriesToPurge,
  PURGE_BATCH_SIZE,
  type PurgeableEntry,
  purgeTargetOf,
} from "../domain/history-purge.ts";

export type SpaceStorage = { readonly plan: Plan; readonly storedBytes: number };

export type CandidateProject = { readonly id: string; readonly name: string };

export type PurgeCandidate = SpaceStorage & {
  readonly spaceId: string;
  readonly name: string;
  readonly projects: readonly CandidateProject[];
};

export type PurgedProject = {
  readonly projectId: string;
  readonly name: string;
  readonly deletedEntries: number;
  readonly purgedBefore: Date;
};

export type PurgedSpace = {
  readonly spaceId: string;
  readonly name: string;
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
  [project, ...others]: readonly CandidateProject[],
): Promise<
  | {
      readonly project: CandidateProject;
      readonly oldest: readonly [PurgeableEntry, ...PurgeableEntry[]];
    }
  | undefined
> => {
  if (project === undefined) {
    return undefined;
  }
  const [first, ...rest] = await unit.oldestEntriesOf(project.id, PURGE_BATCH_SIZE);
  return first === undefined
    ? oldestOfFirstWithEntries(unit, others)
    : { project, oldest: [first, ...rest] };
};

const purgeBatch = async (
  unit: PurgeBatch,
  {
    projects,
    purgedAt,
  }: { readonly projects: readonly CandidateProject[]; readonly purgedAt: Date },
): Promise<PurgedProject | undefined> => {
  const excess = excessOf(await unit.storage());
  if (excess <= 0) {
    return undefined;
  }
  const found = await oldestOfFirstWithEntries(unit, projects);
  if (found === undefined) {
    return undefined;
  }
  const { id: projectId, name } = found.project;
  const { ids, purgedBefore } = entriesToPurge({ oldest: found.oldest, excess });
  await unit.purge({ projectId, entryIds: ids, purgedBefore, purgedAt });
  return { projectId, name, deletedEntries: ids.length, purgedBefore };
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
    onPurged,
  }: {
    readonly candidates: PurgeCandidates;
    readonly unitOfWork: PurgeUnitOfWork;
    readonly now: () => Date;
    readonly budgetMs: number;
    readonly onPurged: (purged: PurgedSpace) => Promise<void>;
  }) =>
  async (): Promise<readonly PurgedSpace[]> => {
    const startedAt = now();
    const withinBudget = () => now().getTime() - startedAt.getTime() < budgetMs;
    const purgeSpace = async (
      { spaceId, projects }: Pick<PurgeCandidate, "spaceId" | "projects">,
      purged: readonly PurgedProject[],
    ): Promise<readonly PurgedProject[]> => {
      if (!withinBudget()) {
        return purged;
      }
      const batch = await unitOfWork.batch(spaceId, (unit) =>
        purgeBatch(unit, { projects, purgedAt: startedAt }),
      );
      return batch === undefined
        ? purged
        : purgeSpace({ spaceId, projects }, withBatch(purged, batch));
    };
    const spaces = (await candidates.list()).filter(reachesLimit);
    return spaces.reduce<Promise<readonly PurgedSpace[]>>(async (previous, candidate) => {
      const report = await previous;
      const projects = await purgeSpace(candidate, []);
      if (projects.length === 0) {
        return report;
      }
      const purged = { spaceId: candidate.spaceId, name: candidate.name, projects };
      await onPurged(purged);
      return [...report, purged];
    }, Promise.resolve([]));
  };
