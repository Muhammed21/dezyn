import { CreateProjectInput } from "@repo/contracts";
import { err, type Result } from "@repo/result";

import type { Project, ProjectCreationFailure } from "../domain/project.ts";
import type { ProjectGateway, ProjectToCreate } from "./project-gateway.ts";

export const projectUseCases = ({ gateway }: { readonly gateway: ProjectGateway }) => ({
  createProject: async ({
    spaceId,
    name,
  }: ProjectToCreate): Promise<Result<Project, ProjectCreationFailure>> => {
    const input = CreateProjectInput.safeParse({ name });
    if (!input.success) {
      return err("invalid_name");
    }
    return gateway.createProject({ spaceId, name: input.data.name });
  },
});
