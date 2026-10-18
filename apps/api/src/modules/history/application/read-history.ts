import { err, ok, type Result } from "@repo/result";

import type { ProjectFinder } from "../../project/contracts/project.ts";
import { can, type MembershipReader } from "../../space/contracts/membership.ts";
import { encodeCursor, type HistoryPosition } from "./history-cursor.ts";

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

export type HistoryPage = {
  readonly entries: readonly HistoryEntry[];
  readonly nextCursor: string | null;
};

export interface HistoryReader {
  entriesOf(
    projectId: string,
    page: { readonly after: HistoryPosition | undefined; readonly take: number },
  ): Promise<readonly HistoryEntry[]>;
}

const pageOf = (rows: readonly HistoryEntry[], limit: number): HistoryPage => {
  const entries = rows.slice(0, limit);
  const last = entries.at(-1);
  return {
    entries,
    nextCursor: rows.length > limit && last !== undefined ? encodeCursor(last) : null,
  };
};

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
    after,
    limit,
  }: {
    readonly projectId: string;
    readonly userId: string;
    readonly after: HistoryPosition | undefined;
    readonly limit: number;
  }): Promise<Result<HistoryPage, "not_found">> => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return err("not_found");
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok(pageOf(await history.entriesOf(projectId, { after, take: limit + 1 }), limit));
  };
