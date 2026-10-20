import type { Action } from "./can.ts";

export type ProjectInSpace = { readonly id: string; readonly spaceId: string };

export interface ProjectLocator {
  find(projectId: string): Promise<ProjectInSpace | undefined>;
}

export type ProjectAccess = (request: {
  readonly projectId: string;
  readonly userId: string;
  readonly action: Action;
}) => Promise<ProjectInSpace | undefined>;
