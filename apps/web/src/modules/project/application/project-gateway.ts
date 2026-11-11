import type { Result } from "@repo/result";

import type {
  ListedProject,
  Project,
  ProjectCreationFailure,
  ProjectsFailure,
} from "../domain/project.ts";

export type ProjectToCreate = { readonly spaceId: string; readonly name: string };

export type ProjectGateway = {
  readonly createProject: (
    project: ProjectToCreate,
  ) => Promise<Result<Project, ProjectCreationFailure>>;
  readonly listProjects: (space: {
    readonly spaceId: string;
  }) => Promise<Result<readonly ListedProject[], ProjectsFailure>>;
};
