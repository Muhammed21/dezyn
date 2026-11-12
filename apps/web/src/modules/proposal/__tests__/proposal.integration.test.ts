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
import { addToken, makeColorToken, PRIMARY_BLUE } from "@repo/api/testing/token-fixtures.ts";
import { CreatedProjectOutput, TokensOutput } from "@repo/contracts";
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

const aiOf = async (app: App, { userId }: { userId: string }) =>
  (await obtainAccessToken(app, { user: ADA, registeredId: userId })).accessToken;

const proposeByAi = async (
  app: App,
  { userId, projectId, tokens }: { userId: string; projectId: string; tokens: readonly object[] },
) => {
  const accessToken = await aiOf(app, { userId });
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

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

describe("lecture d'un lot de propositions par l'app web, contre la vraie API (ADR 0044 §6)", () => {
  it("le membre lit une création et une modification, avec la valeur validée de la modification", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals } = await projectOf(app, db);
      await addToken(app, { accessToken: await aiOf(app, { userId }), projectId });
      await proposeByAi(app, {
        userId,
        projectId,
        tokens: [
          makeColorToken({ $value: NIGHT_BLUE }),
          makeColorToken({ name: "couleur.bleu.500" }),
        ],
      });
      const listed = await proposals.listBatches({ projectId });
      const batchId = listed.ok ? (listed.value[0]?.id ?? "") : "";

      expect(await proposals.readBatch({ batchId })).toEqual(
        ok({
          id: batchId,
          projectId,
          intent: undefined,
          state: "open",
          proposals: [
            {
              id: expect.any(String),
              name: "couleur.fond.primaire",
              kind: "update",
              status: "proposed",
              validated: { $type: "color", $value: PRIMARY_BLUE },
              proposed: { $type: "color", $value: NIGHT_BLUE },
            },
            {
              id: expect.any(String),
              name: "couleur.bleu.500",
              kind: "create",
              status: "proposed",
              validated: undefined,
              proposed: { $type: "color", $value: PRIMARY_BLUE },
            },
          ],
        }),
      );
    }));

  it("un non-membre reçoit not_found", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals } = await projectOf(app, db);
      await proposeByAi(app, { userId, projectId, tokens: [makeColorToken()] });
      const listed = await proposals.listBatches({ projectId });
      const batchId = listed.ok ? (listed.value[0]?.id ?? "") : "";
      const grace = await signedIn(app, GRACE);

      expect(await grace.proposals.readBatch({ batchId })).toEqual(err("not_found"));
    }));
});

const proposalIdsOf = async (
  proposals: ReturnType<typeof createProposals>,
  { projectId }: { projectId: string },
) => {
  const listed = await proposals.listBatches({ projectId });
  const batch = await proposals.readBatch({
    batchId: listed.ok ? (listed.value[0]?.id ?? "") : "",
  });
  return batch.ok ? batch.value.proposals.map(({ id }) => id) : [];
};

const validatedNamesOf = async (
  fetch: (url: string, init: RequestInit) => Promise<Response>,
  { projectId }: { projectId: string },
) => {
  const response = await fetch(`${BASE_URL}/v1/projects/${projectId}/tokens`, { method: "GET" });
  return TokensOutput.parse(await response.json()).tokens.map(({ name }) => name);
};

describe("relecture d'une proposition par l'app web, contre la vraie API (ADR 0012 §1, ADR 0044 §6)", () => {
  it("valider une proposition fait du token une donnée validée du projet", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals, fetch } = await projectOf(app, db);
      await proposeByAi(app, { userId, projectId, tokens: [makeColorToken()] });
      const [proposalId = ""] = await proposalIdsOf(proposals, { projectId });

      expect(await proposals.reviewProposal({ proposalId, decision: "validate" })).toEqual(
        ok({ id: proposalId, name: "couleur.fond.primaire", kind: "create", status: "validated" }),
      );
      expect(await validatedNamesOf(fetch, { projectId })).toEqual(["couleur.fond.primaire"]);
    }));

  it("relire une seconde fois la même proposition donne already_reviewed", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals } = await projectOf(app, db);
      await proposeByAi(app, { userId, projectId, tokens: [makeColorToken()] });
      const [proposalId = ""] = await proposalIdsOf(proposals, { projectId });
      await proposals.reviewProposal({ proposalId, decision: "validate" });

      expect(await proposals.reviewProposal({ proposalId, decision: "reject" })).toEqual(
        err("already_reviewed"),
      );
    }));

  it("valider une référence vers un token non validé donne invalid_proposal avec son erreur", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals } = await projectOf(app, db);
      await proposeByAi(app, {
        userId,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ $value: "{couleur.bleu.500}" }),
        ],
      });
      const [, semanticId = ""] = await proposalIdsOf(proposals, { projectId });

      expect(
        await proposals.reviewProposal({ proposalId: semanticId, decision: "validate" }),
      ).toEqual(
        err({
          reason: "invalid_proposal",
          errors: [{ path: "$value", message: "Référence vers un token non validé" }],
        }),
      );
    }));

  it("rejeter une proposition laisse le projet sans le token", () =>
    withIdentityApp(async (app, db) => {
      const { userId, projectId, proposals, fetch } = await projectOf(app, db);
      await proposeByAi(app, { userId, projectId, tokens: [makeColorToken()] });
      const [proposalId = ""] = await proposalIdsOf(proposals, { projectId });

      expect(await proposals.reviewProposal({ proposalId, decision: "reject" })).toEqual(
        ok({ id: proposalId, name: "couleur.fond.primaire", kind: "create", status: "rejected" }),
      );
      expect(await validatedNamesOf(fetch, { projectId })).toEqual([]);
    }));
});
