import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import type { Project } from "../domain/project.ts";

export interface ProjectWriter {
  create(project: Project): Promise<void>;
}

export interface ProjectUnitOfWork {
  run(
    work: (unit: {
      readonly projects: ProjectWriter;
      readonly history: HistoryWriter;
    }) => Promise<void>,
  ): Promise<void>;
}

export type ProjectCreationFailure = "not_found" | "forbidden";

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
    await unitOfWork.run(async ({ projects, history }) => {
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
    });
    return ok(project);
  };
