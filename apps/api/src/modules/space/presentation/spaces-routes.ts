import { Hono } from "hono";

import { Uuid } from "@repo/contracts";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import type { SpaceUseCases } from "../application/spaces.ts";

export const spacesRoutes = ({ listMySpaces, readSpace }: SpaceUseCases) =>
  new Hono<AuthenticatedEnv>()
    .get("/", async (c) => c.json({ spaces: await listMySpaces(c.get("identity").userId) }))
    .get("/:spaceId", async (c) => {
      const spaceId = Uuid.safeParse(c.req.param("spaceId"));
      if (!spaceId.success) {
        return c.notFound();
      }
      const space = await readSpace({ spaceId: spaceId.data, userId: c.get("identity").userId });
      return space.ok ? c.json(space.value) : c.notFound();
    });
