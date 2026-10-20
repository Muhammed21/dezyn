import { can, type MembershipReader } from "#modules/space/contracts/membership.ts";
import { err, ok, type Result } from "@repo/result";

import type { Project } from "../domain/project.ts";

export type ListedProject = Omit<Project, "spaceId">;

export interface ProjectLister {
  projectsOf(spaceId: string): Promise<readonly ListedProject[]>;
}

export const listProjects =
  ({
    memberships,
    projects,
  }: {
    readonly memberships: MembershipReader;
    readonly projects: ProjectLister;
  }) =>
  async ({
    spaceId,
    userId,
  }: {
    readonly spaceId: string;
    readonly userId: string;
  }): Promise<Result<readonly ListedProject[], "not_found">> => {
    const membership = await memberships.activeMembership({ spaceId, userId });
    if (!can({ membership, action: "space.read" })) {
      return err("not_found");
    }
    return ok(await projects.projectsOf(spaceId));
  };
