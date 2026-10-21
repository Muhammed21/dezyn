import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import {
  type Plan,
  type ProjectLimitReached,
  projectLimitRefusal,
} from "#modules/space/contracts/plan.ts";
import { err, ok, type Result } from "@repo/result";

import type { Project } from "../domain/project.ts";

export type SpaceProjects = { readonly plan: Plan; readonly projects: number };

export interface ProjectWriter {
  lockSpace(spaceId: string): Promise<SpaceProjects>;
  create(project: Project): Promise<void>;
}

export interface ProjectUnitOfWork {
  run<T>(
    work: (unit: {
      readonly projects: ProjectWriter;
      readonly history: HistoryWriter;
    }) => Promise<T>,
  ): Promise<T>;
}

export type ProjectCreationFailure = "not_found" | "forbidden" | ProjectLimitReached;

export const createProject =
  ({
    memberships,
    unitOfWork,
    newId,
    now,
  }: {
    readonly memberships: MembershipReader;
    readonly unitOfWork: ProjectUnitOfWork;
    readonly newId: () => string;
    readonly now: () => Date;
  }) =>
  async ({
    spaceId,
    userId,
    name,
    correlationId,
  }: {
    readonly spaceId: string;
    readonly userId: string;
    readonly name: string;
    readonly correlationId: string;
  }): Promise<Result<Project, ProjectCreationFailure>> => {
    const membership = await memberships.activeMembership({ spaceId, userId });
    if (membership === undefined) {
      return err("not_found");
    }
    if (!can({ membership, action: "project.create" })) {
      return err("forbidden");
    }
    const project = { id: newId(), spaceId, name, createdAt: now() };
    return unitOfWork.run(async ({ projects, history }) => {
      const refusal = projectLimitRefusal(await projects.lockSpace(spaceId));
      if (refusal !== undefined) {
        return err(refusal);
      }
      await projects.create(project);
      await history.append({
        spaceId,
        projectId: project.id,
        action: "project.created",
        userId,
        clientId: null,
        before: null,
        after: { name },
        correlationId,
        occurredAt: project.createdAt,
      });
      return ok(project);
    });
  };
