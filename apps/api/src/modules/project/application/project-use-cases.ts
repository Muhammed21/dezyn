import type { createProject } from "./create-project.ts";
import type { listProjects } from "./list-projects.ts";

export type ProjectUseCases = {
  readonly createProject: ReturnType<typeof createProject>;
  readonly listProjects: ReturnType<typeof listProjects>;
};
