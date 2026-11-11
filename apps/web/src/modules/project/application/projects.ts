import { CreateProjectInput, Uuid } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type {
  ListedProject,
  Project,
  ProjectCreationFailure,
  ProjectsFailure,
} from "../domain/project.ts";
import type { ProjectGateway, ProjectToCreate } from "./project-gateway.ts";

const isSpaceId = (spaceId: string) => Uuid.safeParse(spaceId).success;

export const projectUseCases = ({ gateway }: { readonly gateway: ProjectGateway }) => ({
  createProject: async ({
    spaceId,
    name,
  }: ProjectToCreate): Promise<Result<Project, ProjectCreationFailure>> => {
    if (!isSpaceId(spaceId)) {
      return err("not_found");
    }
    const input = CreateProjectInput.safeParse({ name });
    if (!input.success) {
      return err("invalid_name");
    }
    return gateway.createProject({ spaceId, name: input.data.name });
  },
  listProjects: async ({
    spaceId,
  }: {
    readonly spaceId: string;
  }): Promise<Result<readonly ListedProject[], ProjectsFailure>> =>
    isSpaceId(spaceId) ? gateway.listProjects({ spaceId }) : err("not_found"),
});
