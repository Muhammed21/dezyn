import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  makeClientIp,
  obtainAccessToken,
  signUp,
  withIdentityApp,
} from "@repo/api/testing/authorization-flow.ts";
import { personalSpaceOf } from "@repo/api/testing/space-fixtures.ts";
import { makeColorToken } from "@repo/api/testing/token-fixtures.ts";
import { CreatedProjectOutput } from "@repo/contracts";
import { err, ok } from "@repo/result";

import { makeApiBrowser } from "../../../testing/api-browser.ts";
import { createProposals } from "../proposal-module.ts";

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
  return { userId, fetch, proposals: createProposals({ apiUrl: BASE_URL, fetch }) };
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

const proposeByAi = async (
  app: App,
  { userId, projectId, tokens }: { userId: string; projectId: string; tokens: readonly object[] },
) => {
  const { accessToken } = await obtainAccessToken(app, { user: ADA, registeredId: userId });
  await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });
};

describe("lecture des lots de propositions par l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("après deux propositions de l'IA, le membre voit un lot ouvert avec 2 à relire", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals } = await projectOf(app, db);
      await proposeByAi(app, {
        userId,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.700" }),
        ],
      });

      expect(await proposals.listBatches({ projectId })).toEqual(
        ok([{ id: expect.any(String), intent: undefined, state: "open", toReview: 2 }]),
      );
    }));

  it("un projet sans proposition n'a aucun lot", () =>
    withIdentityApp(async (app, db) => {
      const { projectId, proposals } = await projectOf(app, db);

      expect(await proposals.listBatches({ projectId })).toEqual(ok([]));
    }));

  it("un non-membre reçoit not_found", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await projectOf(app, db);
      const grace = await signedIn(app, GRACE);

      expect(await grace.proposals.listBatches({ projectId })).toEqual(err("not_found"));
    }));

  it("sans session, la lecture donne unauthenticated", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await projectOf(app, db);
      const anonymous = createProposals({
        apiUrl: BASE_URL,
        fetch: makeApiBrowser(app, { ip: makeClientIp() }),
      });

      expect(await anonymous.listBatches({ projectId })).toEqual(err("unauthenticated"));
    }));
});
