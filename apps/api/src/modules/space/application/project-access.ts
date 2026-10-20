import { can } from "../domain/can.ts";
import type { MembershipReader } from "../domain/membership.ts";
import type { ProjectAccess, ProjectLocator } from "../domain/project-access.ts";

export const projectAccess =
  ({
    projects,
    memberships,
  }: {
    readonly projects: ProjectLocator;
    readonly memberships: MembershipReader;
  }): ProjectAccess =>
  async ({ projectId, userId, action }) => {
    const project = await projects.find(projectId);
    if (project === undefined) {
      return undefined;
    }
    const membership = await memberships.activeMembership({ spaceId: project.spaceId, userId });
    return can({ membership, action }) ? project : undefined;
  };
