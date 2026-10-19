import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  BASE_URL,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "../../testing/authorization-flow.ts";
import { seedProject, seedProjectAsEditor } from "../../testing/project-fixtures.ts";
import {
  addToken,
  historyOf,
  makeColorToken,
  PRIMARY_BLUE,
  seedValidatedToken,
} from "../../testing/token-fixtures.ts";

const REVIEW_CORRELATION_ID = "relecture-1";

const callTool = async (
  app: App,
  { accessToken, name, args }: { accessToken: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const { result } = await response.json();
  return result;
};

const proposeTokens = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => {
  const result = await callTool(app, {
    accessToken,
    name: "write_tokens",
    args: { projectId, tokens },
  });
  return result.structuredContent;
};

const request = (
  app: App,
  { accessToken, path, method = "GET" }: { accessToken: string; path: string; method?: string },
) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, "x-correlation-id": REVIEW_CORRELATION_ID },
  });

const readTokens = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (await callTool(app, { accessToken, name: "read_tokens", args: { projectId } }))
    .structuredContent;

describe("l'éditeur relit les propositions de l'IA, lot par lot (ADR 0012 §1, ADR 0013 §4)", () => {
  it("la liste des lots d'un projet donne l'intention, l'état et le nombre de propositions à relire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.700" }),
        ],
      });

      const response = await request(app, {
        accessToken,
        path: `/projects/${projectId}/proposal-batches`,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        batches: [{ id: batch.id, intent: null, state: "open", toReview: 2 }],
      });
    }));

  it("un lot montre chaque proposition avec sa valeur proposée, sans valeur validée pour une création", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ $description: "Fond des boutons" })],
      });

      const response = await request(app, { accessToken, path: `/proposal-batches/${batch.id}` });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: batch.id,
        projectId,
        intent: null,
        state: "open",
        proposals: [
          {
            id: proposals[0].id,
            name: "couleur.fond.primaire",
            kind: "create",
            status: "proposed",
            validated: null,
            proposed: { $type: "color", $value: PRIMARY_BLUE, $description: "Fond des boutons" },
          },
        ],
      });
    }));

  it("valider une proposition de création fait du token une donnée validée, lue par read_tokens", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        id: proposals[0].id,
        name: "couleur.fond.primaire",
        kind: "create",
        status: "validated",
      });
      expect((await readTokens(app, { accessToken, projectId })).tokens).toEqual([
        {
          id: expect.any(String),
          name: "couleur.fond.primaire",
          $type: "color",
          $value: PRIMARY_BLUE,
          status: "validated",
        },
      ]);
    }));

  it("rejeter une proposition laisse le projet sans le token, et le lot la montre Rejetée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/reject`,
        method: "POST",
      });
      const reviewed = await (
        await request(app, { accessToken, path: `/proposal-batches/${batch.id}` })
      ).json();

      expect(await response.json()).toMatchObject({ status: "rejected" });
      expect(reviewed.proposals).toMatchObject([{ status: "rejected" }]);
      expect((await readTokens(app, { accessToken, projectId })).tokens).toEqual([]);
    }));
});

describe("seul un membre relit, et une proposition ne se relit qu'une fois (ADR 0013 §9)", () => {
  it("un éditeur valide une proposition", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProjectAsEditor(app, db);
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });

      expect(response.status).toBe(200);
    }));

  it("un non-membre reçoit 404 sur les lots, le lot et la relecture, sans rien relire", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      const grace = await obtainAccessToken(app, { user: GRACE });

      const statuses = await Promise.all(
        [
          { path: `/projects/${projectId}/proposal-batches` },
          { path: `/proposal-batches/${batch.id}` },
          { path: `/proposals/${proposals[0].id}/validate`, method: "POST" },
          { path: `/proposals/${proposals[0].id}/reject`, method: "POST" },
        ].map(
          async (call) => (await request(app, { accessToken: grace.accessToken, ...call })).status,
        ),
      );
      const reviewed = await (
        await request(app, { accessToken, path: `/proposal-batches/${batch.id}` })
      ).json();

      expect(statuses).toEqual([404, 404, 404, 404]);
      expect(reviewed.proposals).toMatchObject([{ status: "proposed" }]);
    }));

  it("un projet ou un lot inconnu répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);
      const unknown = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

      const statuses = await Promise.all(
        [`/projects/${unknown}/proposal-batches`, `/proposal-batches/${unknown}`].map(
          async (path) => (await request(app, { accessToken, path })).status,
        ),
      );

      expect(statuses).toEqual([404, 404]);
    }));

  it("un identifiant qui n'est pas un UUID répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const statuses = await Promise.all(
        [
          { path: "/projects/pas-un-uuid/proposal-batches" },
          { path: "/proposal-batches/pas-un-uuid" },
          { path: "/proposals/pas-un-uuid/validate", method: "POST" },
          { path: "/proposals/pas-un-uuid/reject", method: "POST" },
        ].map(async (call) => (await request(app, { accessToken, ...call })).status),
      );

      expect(statuses).toEqual([404, 404, 404, 404]);
    }));

  it("valider une proposition remplacée par l'ajout d'un membre répond 409, sans rien valider", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      await addToken(app, { accessToken, projectId, token: makeColorToken() });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });
      const reviewed = await (
        await request(app, { accessToken, path: `/proposal-batches/${batch.id}` })
      ).json();

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Proposition déjà relue",
      });
      expect(reviewed.proposals).toMatchObject([{ status: "replaced" }]);
    }));

  it("valider une création dont le nom a été pris par un ajout concurrent répond 409 sur name, sans rien valider", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { batch, proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      await seedValidatedToken(db, { projectId, name: "couleur.fond.primaire" });

      const response = await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });
      const reviewed = await (
        await request(app, { accessToken, path: `/proposal-batches/${batch.id}` })
      ).json();

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Proposition invalide",
        errors: [{ path: "name", message: "Nom déjà pris dans le projet" }],
      });
      expect(reviewed.proposals).toMatchObject([{ status: "proposed" }]);
    }));

  it("une proposition inconnue répond 404", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken } = await seedProject(app, db);

      const response = await request(app, {
        accessToken,
        path: "/proposals/4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b/validate",
        method: "POST",
      });

      expect(response.status).toBe(404);
    }));

  it.each([
    ["validate", "reject"],
    ["reject", "validate"],
    ["validate", "validate"],
  ])("après %s, %s répond 409 problem+json", (first, second) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken()],
      });
      const path = (decision: string) => `/proposals/${proposals[0].id}/${decision}`;
      await request(app, { accessToken, path: path(first), method: "POST" });

      const response = await request(app, { accessToken, path: path(second), method: "POST" });

      expect(response.status).toBe(409);
      expect(response.headers.get("content-type")).toContain("application/problem+json");
      expect(await response.json()).toMatchObject({
        type: "about:blank",
        title: "Proposition déjà relue",
        status: 409,
      });
    }),
  );

  it("valider un sémantique dont le primitif attend encore répond 409, puis passe une fois le primitif validé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" }),
        ],
      });
      const validate = (id: string) =>
        request(app, { accessToken, path: `/proposals/${id}/validate`, method: "POST" });

      const early = await validate(proposals[1].id);
      await validate(proposals[0].id);
      const late = await validate(proposals[1].id);

      expect(early.status).toBe(409);
      expect(await early.json()).toMatchObject({
        type: "about:blank",
        title: "Proposition invalide",
        errors: [{ path: "$value", message: "Référence vers un token non validé" }],
      });
      expect(late.status).toBe(200);
      expect((await readTokens(app, { accessToken, projectId })).tokens).toMatchObject([
        { name: "couleur.bleu.500" },
        { name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" },
      ]);
    }));
});

describe("chaque relecture entre dans l'historique avec l'éditeur (ADR 0012 §7)", () => {
  it("valider laisse une entrée proposition.validated avec l'éditeur et le token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, userId, spaceId, projectId } = await seedProject(app, db);
      const token = makeColorToken();
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [token],
      });

      await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toEqual({
        id: expect.any(String),
        action: "proposal.validated",
        spaceId,
        projectId,
        author: { kind: "member", userId, name: ADA.name },
        clientId: null,
        before: null,
        after: { proposalId: proposals[0].id, token },
        occurredAt: expect.any(String),
        correlationId: REVIEW_CORRELATION_ID,
      });
    }));

  it("rejeter laisse une entrée proposition.rejected", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const token = makeColorToken();
      const { proposals } = await proposeTokens(app, {
        accessToken,
        projectId,
        tokens: [token],
      });

      await request(app, {
        accessToken,
        path: `/proposals/${proposals[0].id}/reject`,
        method: "POST",
      });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "proposal.rejected",
        after: { proposalId: proposals[0].id, token },
      });
    }));

  it("si l'entrée ne peut pas être écrite, rien n'est validé", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);
        const { batch, proposals } = await proposeTokens(app, {
          accessToken,
          projectId,
          tokens: [makeColorToken()],
        });

        const response = await request(app, {
          accessToken,
          path: `/proposals/${proposals[0].id}/validate`,
          method: "POST",
        });
        const reviewed = await (
          await request(app, { accessToken, path: `/proposal-batches/${batch.id}` })
        ).json();

        expect(response.status).toBe(500);
        expect(reviewed.proposals).toMatchObject([{ status: "proposed" }]);
        expect((await readTokens(app, { accessToken, projectId })).tokens).toEqual([]);
      },
      {
        wrapHistoryWriter: (writer) => ({
          append: (entry) =>
            entry.action.startsWith("proposal.")
              ? Promise.reject(new Error("historique indisponible"))
              : writer.append(entry),
        }),
      },
    ));
});
