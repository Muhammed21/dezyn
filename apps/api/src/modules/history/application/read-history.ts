import { err, ok, type Result } from "@repo/result";

import type { ProjectFinder } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";

export type HistoryAuthor = {
  readonly kind: "member";
  readonly userId: string;
  readonly name: string;
};

export type HistoryEntry = {
  readonly id: string;
  readonly action: string;
  readonly spaceId: string;
  readonly projectId: string;
  readonly author: HistoryAuthor;
  readonly clientId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly occurredAt: Date;
  readonly correlationId: string;
};

export interface HistoryReader {
  entriesOf(projectId: string): Promise<readonly HistoryEntry[]>;
}

export const readHistory =
  ({
    projects,
    memberships,
    history,
  }: {
    readonly projects: ProjectFinder;
    readonly memberships: MembershipReader;
    readonly history: HistoryReader;
  }) =>
  async ({
    projectId,
    userId,
  }: {
    readonly projectId: string;
    readonly userId: string;
  }): Promise<Result<readonly HistoryEntry[], "not_found">> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok(await history.entriesOf(projectId));
  };
