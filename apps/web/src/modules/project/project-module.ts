import type { Fetch } from "../../platform/http.ts";
import { projectUseCases } from "./application/projects.ts";
import { createHttpProjectGateway } from "./infrastructure/http-project-gateway.ts";

export const createProjects = (options: { readonly apiUrl: string; readonly fetch: Fetch }) =>
  projectUseCases({ gateway: createHttpProjectGateway(options) });
