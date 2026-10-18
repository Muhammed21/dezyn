import { describe, expect, it } from "vitest";

import { schema } from "@repo/db";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import {
  type App,
  BASE_URL,
  obtainAccessToken,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import { personalSpaceOf } from "../../testing/space-fixtures.ts";

const SAME_INSTANT = new Date("2026-10-01T09:00:00.000Z");

const idOf = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

const minutesBefore = (index: number) => new Date(SAME_INSTANT.getTime() - index * 60_000);

const seedProject = async (app: App, db: PostgresDatabase) => {
  const { accessToken, userId } = await obtainAccessToken(app);
  const spaceId = await personalSpaceOf(db, userId);
  const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Site vitrine" }),
  });
  const { id: projectId } = await created.json();
  const [author] = await db.orm.select({ id: schema.historyAuthor.id }).from(schema.historyAuthor);
  return { accessToken, spaceId, projectId: String(projectId), authorId: author?.id ?? "" };
};

const seedEntries = (
  db: PostgresDatabase,
  {
    spaceId,
    projectId,
    authorId,
    entries,
  }: {
    spaceId: string;
    projectId: string;
    authorId: string;
    entries: readonly { id: string; occurredAt: Date }[];
  },
) =>
  db.orm.insert(schema.historyEntry).values(
    entries.map(({ id, occurredAt }) => ({
      id,
      spaceId,
      projectId,
      action: "project.created",
      authorId,
      clientId: null,
      before: null,
      after: null,
      correlationId: "semis",
      occurredAt,
    })),
  );

const readPage = async (
  app: App,
  {
    accessToken,
    projectId,
    query = "",
  }: { accessToken: string; projectId: string; query?: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/history${query}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return { status: response.status, body: await response.json() };
};

const readAllPages = async (
  app: App,
  { accessToken, projectId, limit }: { accessToken: string; projectId: string; limit: number },
  cursor?: string,
): Promise<readonly { entries: { id: string }[]; nextCursor: string | null }[]> => {
  const query = `?limit=${limit}${cursor === undefined ? "" : `&cursor=${cursor}`}`;
  const { body } = await readPage(app, { accessToken, projectId, query });
  return typeof body.nextCursor !== "string"
    ? [body]
    : [body, ...(await readAllPages(app, { accessToken, projectId, limit }, body.nextCursor))];
};

describe("un membre lit l'historique d'un projet page par page (ADR 0004 §3)", () => {
  it("des plus récentes aux plus anciennes, sans perdre ni répéter deux entrées à la même date", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId, ...seed } = await seedProject(app, db);
      await seedEntries(db, {
        ...seed,
        projectId,
        entries: [
          { id: idOf(1), occurredAt: minutesBefore(1) },
          { id: idOf(2), occurredAt: SAME_INSTANT },
          { id: idOf(3), occurredAt: SAME_INSTANT },
          { id: idOf(4), occurredAt: SAME_INSTANT },
          { id: idOf(5), occurredAt: minutesBefore(2) },
        ],
      });

      const pages = await readAllPages(app, { accessToken, projectId, limit: 2 });
      const ids = pages.flatMap((page) => page.entries.map((entry) => entry.id));

      expect(pages.map((page) => page.entries.length)).toEqual([2, 2, 2]);
      expect(ids.slice(1)).toEqual([idOf(4), idOf(3), idOf(2), idOf(1), idOf(5)]);
      expect(pages.at(-1)?.nextCursor).toBeNull();
    }));

  it("une page pleine qui est la dernière ne rend pas de curseur", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId, ...seed } = await seedProject(app, db);
      await seedEntries(db, {
        ...seed,
        projectId,
        entries: [{ id: idOf(1), occurredAt: SAME_INSTANT }],
      });

      const { body } = await readPage(app, { accessToken, projectId, query: "?limit=2" });

      expect(body.entries).toHaveLength(2);
      expect(body.nextCursor).toBeNull();
    }));

  it("sans limit, une page rend 50 entrées", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId, ...seed } = await seedProject(app, db);
      await seedEntries(db, {
        ...seed,
        projectId,
        entries: Array.from({ length: 50 }, (_, index) => ({
          id: idOf(index + 1),
          occurredAt: minutesBefore(index + 1),
        })),
      });

      const first = await readPage(app, { accessToken, projectId });
      const second = await readPage(app, {
        accessToken,
        projectId,
        query: `?cursor=${first.body.nextCursor}`,
      });

      expect(first.body.entries).toHaveLength(50);
      expect(second.body.entries.map((entry: { id: string }) => entry.id)).toEqual([idOf(50)]);
      expect(second.body.nextCursor).toBeNull();
    }));

  it("limit vaut au plus 100", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const largest = await readPage(app, { accessToken, projectId, query: "?limit=100" });
      const smallest = await readPage(app, { accessToken, projectId, query: "?limit=1" });

      expect(largest.status).toBe(200);
      expect(smallest.status).toBe(200);
    }));

  it("un curseur mal formé répond 400 en nommant le curseur", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const { status, body } = await readPage(app, {
        accessToken,
        projectId,
        query: "?cursor=e30",
      });

      expect(status).toBe(400);
      expect(body).toMatchObject({ errors: [{ path: "cursor", message: "Curseur invalide" }] });
    }));

  it.each([
    ["?cursor=pas-un-curseur!"],
    ["?cursor=e30"],
    ["?limit=0"],
    ["?limit=101"],
    ["?limit=dix"],
  ])("%s répond 400 problem+json", (query) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const { status, body } = await readPage(app, { accessToken, projectId, query });

      expect(status).toBe(400);
      expect(body).toMatchObject({ status: 400 });
    }),
  );
});
