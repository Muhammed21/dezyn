import { Hono } from "hono";
import { z } from "zod";

import type { AuthenticatedEnv } from "#platform/access-token.ts";
import { problemResponse } from "#platform/problem.ts";
import { validate } from "#platform/validate.ts";
import { Uuid } from "@repo/contracts";

import type { ProjectUseCases } from "../application/create-project.ts";

const ProjectRequest = z.object({ name: z.string().trim().min(1).max(100) });

export const projectsRoutes = ({ createProject }: ProjectUseCases) =>
  new Hono<AuthenticatedEnv>().post(
    "/:spaceId/projects",
    validate("json", ProjectRequest),
    async (c) => {
      const spaceId = Uuid.safeParse(c.req.param("spaceId")).data;
      if (spaceId === undefined) {
        return c.notFound();
      }
      const created = await createProject({
        spaceId,
        userId: c.get("identity").userId,
        name: c.req.valid("json").name,
        correlationId: c.get("correlationId"),
      });
      if (created.ok) {
        return c.json(created.value, 201);
      }
      return created.error === "not_found"
        ? c.notFound()
        : problemResponse(c, { type: "about:blank", title: "Accès refusé", status: 403 });
    },
  );
