import type { Result } from "@repo/result";

import type { Project, ProjectCreationFailure } from "../domain/project.ts";

export type ProjectToCreate = { readonly spaceId: string; readonly name: string };

export type ProjectGateway = {
  readonly createProject: (
    project: ProjectToCreate,
  ) => Promise<Result<Project, ProjectCreationFailure>>;
};
