import { randomUUID } from "node:crypto";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../platform/postgres-database.ts";
import { type App, BASE_URL } from "./authorization-flow.ts";

export const ADDITION_CORRELATION_ID = "ajout-du-token-1";

export const PRIMARY_BLUE = {
  colorSpace: "srgb",
  components: [0.2, 0.4, 0.8],
  alpha: 1,
  hex: "#3366cc",
};

export const makeColorToken = (overrides: Record<string, unknown> = {}) => ({
  name: "couleur.fond.primaire",
  $type: "color",
  $value: PRIMARY_BLUE,
  ...overrides,
});

export const addToken = (
  app: App,
  {
    accessToken,
    projectId,
    token = makeColorToken(),
  }: { accessToken: string; projectId: string; token?: unknown },
) =>
  app.request(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-correlation-id": ADDITION_CORRELATION_ID,
    },
    body: JSON.stringify(token),
  });

export const historyOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/history`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const { entries } = await response.json();
  return entries;
};

export const seedProposedToken = (
  db: PostgresDatabase,
  { projectId, name }: { readonly projectId: string; readonly name: string },
) =>
  db.orm.insert(schema.token).values({
    id: randomUUID(),
    projectId,
    name,
    type: "color",
    description: null,
    status: "proposed",
    createdAt: new Date(),
  });

export const seedValidatedToken = (
  db: PostgresDatabase,
  { projectId, name }: { readonly projectId: string; readonly name: string },
) =>
  db.orm.insert(schema.token).values({
    id: randomUUID(),
    projectId,
    name,
    type: "color",
    description: null,
    status: "validated",
    createdAt: new Date(),
  });
