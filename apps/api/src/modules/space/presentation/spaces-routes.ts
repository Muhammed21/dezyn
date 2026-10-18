import { Hono } from "hono";

import type { AuthenticatedEnv } from "../../../platform/access-token.ts";
import type { MySpace } from "../domain/space.ts";

export const spacesRoutes = ({
  listMySpaces,
}: {
  readonly listMySpaces: (userId: string) => Promise<readonly MySpace[]>;
}) =>
  new Hono<AuthenticatedEnv>().get("/", async (c) =>
    c.json({ spaces: await listMySpaces(c.get("identity").userId) }),
  );
