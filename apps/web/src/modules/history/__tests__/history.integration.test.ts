import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  GRACE,
  makeClientIp,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { seedHistoryEntries } from "@repo/api/testing/history-fixtures.ts";
import { personalSpaceOf } from "@repo/api/testing/space-fixtures.ts";
import { CreatedProjectOutput } from "@repo/contracts";
import { err } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createHistory } from "../history-module.ts";

type Database = Parameters<typeof personalSpaceOf>[0];

const signedIn = async (app: App, user: typeof ADA) => {
  const ip = makeClientIp();
  const userId = await signUp(app, ip, user);
  const fetch = makeApiBrowser(app, { ip });
  await fetch(`${BASE_URL}/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  return { userId, fetch, history: createHistory({ apiUrl: BASE_URL, fetch }) };
};

const projectOf = async (app: App, db: Database) => {
  const ada = await signedIn(app, ADA);
  const spaceId = await personalSpaceOf(db, ada.userId);
  const created = await ada.fetch(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Site vitrine" }),
  });
  return { ...ada, spaceId, projectId: CreatedProjectOutput.parse(await created.json()).id };
};

describe("lecture de l'historique d'un projet par l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("le propriétaire lit la création de son projet, par lui, sans purge", () =>
    withIdentityApp(async (app, db) => {
      const { projectId, history } = await projectOf(app, db);

      const page = await history.readHistory({ projectId });

      expect(page.ok && page.value).toEqual({
        entries: [
          {
            id: expect.any(String),
            action: "project.created",
            author: { kind: "member", name: ADA.name, left: false },
            clientId: undefined,
            occurredAt: expect.any(Date),
          },
        ],
        purgedBefore: undefined,
        nextCursor: undefined,
      });
    }));

  it("au-delà d'une page, le membre lit tout l'historique de curseur en curseur, sans doublon", () =>
    withIdentityApp(async (app, db) => {
      const { spaceId, projectId, history } = await projectOf(app, db);
      const seeded = Array.from({ length: 60 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        occurredAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      }));
      await seedHistoryEntries(db, { spaceId, projectId, entries: seeded });

      const readFrom = async (cursor?: string): Promise<readonly string[]> => {
        const page = await history.readHistory({ projectId, cursor });
        if (!page.ok) {
          throw new Error(page.error);
        }
        const ids = page.value.entries.map(({ id }) => id);
        return page.value.nextCursor === undefined
          ? ids
          : [...ids, ...(await readFrom(page.value.nextCursor))];
      };
      const ids = await readFrom();

      expect(ids).toHaveLength(61);
      expect(new Set(ids).size).toBe(61);
      expect(ids.slice(1)).toEqual(seeded.map(({ id }) => id).toReversed());
    }));

  it("un non-membre reçoit not_found", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await projectOf(app, db);
      const grace = await signedIn(app, GRACE);

      expect(await grace.history.readHistory({ projectId })).toEqual(err("not_found"));
    }));

  it("sans session, la lecture donne unauthenticated", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await projectOf(app, db);
      const anonymous = createHistory({
        apiUrl: BASE_URL,
        fetch: makeApiBrowser(app, { ip: makeClientIp() }),
      });

      expect(await anonymous.readHistory({ projectId })).toEqual(err("unauthenticated"));
    }));
});
