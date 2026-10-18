import { err, type Result } from "@repo/result";

import type { ProjectFinder, ProjectRef } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";
import type { HistoryWriter } from "../domain/history-writer.ts";

export type RecordFailure = "not_found" | "history_unavailable";

export const recordProjectCall =
  ({
    projects,
    memberships,
    history,
    now,
  }: {
    readonly projects: ProjectFinder;
    readonly memberships: MembershipReader;
    readonly history: HistoryWriter;
    readonly now: () => Date;
  }) =>
  async <T, E extends string>({
    tool,
    projectId,
    userId,
    clientId,
    correlationId,
    input,
    run,
  }: {
    readonly tool: string;
    readonly projectId: string;
    readonly userId: string;
    readonly clientId: string;
    readonly correlationId: string;
    readonly input: Readonly<Record<string, unknown>>;
    readonly run: (project: ProjectRef) => Promise<Result<T, E>>;
  }): Promise<Result<T, E | RecordFailure>> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    const outcome = await run(project);
    const written = await history
      .append({
        spaceId: project.spaceId,
        projectId,
        action: `mcp.${tool}`,
        userId,
        clientId,
        before: null,
        after: { outcome: outcome.ok ? "success" : "error", input },
        correlationId,
        occurredAt: now(),
      })
      .then(
        () => true,
        () => false,
      );
    return written ? outcome : err("history_unavailable");
  };
