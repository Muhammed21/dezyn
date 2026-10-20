import type { ProjectAccess, ProjectInSpace } from "#modules/space/contracts/membership.ts";
import type { RecordFailure } from "#platform/project-call.ts";
import { err, type Result } from "@repo/result";

import type { HistoryWriter } from "../domain/history-writer.ts";

export const recordProjectCall =
  ({
    access,
    history,
    now,
  }: {
    readonly access: ProjectAccess;
    readonly history: HistoryWriter;
    readonly now: () => Date;
  }) =>
  async <T, E>({
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
    readonly run: (project: ProjectInSpace) => Promise<Result<T, E>>;
  }): Promise<Result<T, E | RecordFailure>> => {
    const project = await access({ projectId, userId, action: "space.read" });
    if (project === undefined) {
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
