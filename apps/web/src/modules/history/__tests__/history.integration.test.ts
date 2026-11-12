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
  return { ...ada, projectId: CreatedProjectOutput.parse(await created.json()).id };
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
      });
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
