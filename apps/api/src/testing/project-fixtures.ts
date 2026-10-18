import type { PostgresDatabase } from "../platform/postgres-database.ts";
import { type App, BASE_URL, obtainAccessToken } from "./authorization-flow.ts";
import { personalSpaceOf } from "./space-fixtures.ts";

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
