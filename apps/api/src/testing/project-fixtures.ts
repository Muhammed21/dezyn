import { randomUUID } from "node:crypto";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../platform/postgres-database.ts";
import { ADA, type App, BASE_URL, obtainAccessToken } from "./authorization-flow.ts";
import { personalSpaceOf, seedTeamSpaceWith } from "./space-fixtures.ts";

export const seedProject = async (app: App, db: PostgresDatabase) => {
  const owner = await obtainAccessToken(app);
  const spaceId = await personalSpaceOf(db, owner.userId);
  const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${owner.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Site vitrine" }),
  });
  const { id } = await created.json();
  return { ...owner, spaceId, projectId: String(id) };
};

export const seedProjectAsEditor = async (
  app: App,
  db: PostgresDatabase,
  { user = ADA }: { readonly user?: typeof ADA } = {},
) => {
  const editor = await obtainAccessToken(app, { user });
  const spaceId = await seedTeamSpaceWith(db, { userId: editor.userId, role: "editor" });
  const projectId = randomUUID();
  await db.orm
    .insert(schema.project)
    .values({ id: projectId, spaceId, name: "Site vitrine", createdAt: new Date() });
  return { ...editor, spaceId, projectId };
};
