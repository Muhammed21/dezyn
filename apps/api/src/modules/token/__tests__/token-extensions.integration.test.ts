import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import { addToken, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";

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

const writeTokens = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) =>
  (await callTool(app, { accessToken, name: "write_tokens", args: { projectId, tokens } }))
    .structuredContent;

const request = (
  app: App,
  { accessToken, path, method = "GET" }: { accessToken: string; path: string; method?: string },
) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}` },
  });

const tokensOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) =>
  (await (await request(app, { accessToken, path: `/projects/${projectId}/tokens` })).json())
    .tokens;

const ITALIC = { "com.figma": { italic: true } };

const UPRIGHT = { "com.figma": { italic: false } };

const SERIALIZED_OVERHEAD = JSON.stringify({ "com.figma": { note: "" } }).length;

const makeExtensionsOfBytes = (bytes: number) => ({
  "com.figma": { note: "x".repeat(bytes - SERIALIZED_OVERHEAD) },
});

describe("un token porte des extensions conservées telles quelles (ADR 0030 §1, §2)", () => {
  it("un membre ajoute un token avec extensions et le relit à l'identique", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const token = makeColorToken({ $extensions: ITALIC });

      const response = await addToken(app, { ...seeded, token });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, seeded)).toEqual([
        { id: expect.any(String), ...token, status: "validated" },
      ]);
    }));

  it("sur un projet à modes, les extensions sont communes à tous les modes (ADR 0030 §3)", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await seedModes(db, { projectId: seeded.projectId, modes: ["clair", "sombre"] });
      const token = {
        name: "couleur.fond.primaire",
        $type: "color",
        modes: { clair: PRIMARY_BLUE, sombre: PRIMARY_BLUE },
        $extensions: ITALIC,
      };

      await addToken(app, { ...seeded, token });

      expect(await tokensOf(app, seeded)).toEqual([
        { id: expect.any(String), ...token, status: "validated" },
      ]);
    }));

  it("l'IA écrit un token avec extensions ; une fois validé, read_tokens le rend à l'identique", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const token = makeColorToken({ $extensions: ITALIC });
      const { proposals } = await writeTokens(app, { ...seeded, tokens: [token] });
      await request(app, {
        accessToken: seeded.accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });

      const read = await callTool(app, {
        accessToken: seeded.accessToken,
        name: "read_tokens",
        args: { projectId: seeded.projectId },
      });

      expect(read.structuredContent.tokens).toEqual([
        { id: expect.any(String), ...token, status: "validated" },
      ]);
    }));

  it.each(["figma", "com.", ".figma", "com..figma"])(
    "une clé %s, hors de la notation de domaine inversé, répond 400 en la nommant",
    (key) =>
      withIdentityApp(async (app, db) => {
        const seeded = await seedProject(app, db);

        const response = await addToken(app, {
          ...seeded,
          token: makeColorToken({ $extensions: { [key]: { italic: true } } }),
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({
          errors: [
            {
              path: `$extensions.${key}`,
              message:
                "Clé d'extension attendue en notation de domaine inversé, par exemple com.figma",
            },
          ],
        });
      }),
  );

  it("des extensions de 16 Ko sérialisés sont acceptées", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      const response = await addToken(app, {
        ...seeded,
        token: makeColorToken({ $extensions: makeExtensionsOfBytes(16 * 1024) }),
      });

      expect(response.status).toBe(201);
    }));

  it("des extensions de plus de 16 Ko sérialisés répondent 400 en donnant le plafond", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);

      const response = await addToken(app, {
        ...seeded,
        token: makeColorToken({ $extensions: makeExtensionsOfBytes(16 * 1024 + 1) }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "$extensions", message: "Extensions limitées à 16 Ko sérialisés" }],
      });
    }));

  it("le plafond compte les octets, pas les caractères", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const accented = { "com.figma": { note: "é".repeat(8 * 1024) } };

      const response = await addToken(app, {
        ...seeded,
        token: makeColorToken({ $extensions: accented }),
      });

      expect(response.status).toBe(400);
    }));
});

describe("les extensions comptent pour l'écriture identique (ADR 0030 §4)", () => {
  it("une écriture qui ne change que les extensions d'un token validé crée une proposition", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken({ $extensions: UPRIGHT }) });

      const written = await writeTokens(app, {
        ...seeded,
        tokens: [makeColorToken({ $extensions: ITALIC })],
      });

      expect(written).toMatchObject({ proposals: [{ kind: "update" }], unchanged: [] });
    }));

  it("valider la proposition remplace les extensions du token", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken({ $extensions: UPRIGHT }) });
      const { proposals } = await writeTokens(app, {
        ...seeded,
        tokens: [makeColorToken({ $extensions: ITALIC })],
      });

      const response = await request(app, {
        accessToken: seeded.accessToken,
        path: `/proposals/${proposals[0].id}/validate`,
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await tokensOf(app, seeded)).toMatchObject([{ $extensions: ITALIC }]);
    }));

  it("une écriture identique, extensions comprises, ne crée pas de proposition", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const token = makeColorToken({ $extensions: ITALIC });
      await addToken(app, { ...seeded, token });

      const written = await writeTokens(app, { ...seeded, tokens: [token] });

      expect(written).toMatchObject({ proposals: [], unchanged: [token.name] });
    }));

  it("la relecture d'une proposition montre les extensions proposées et validées", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken({ $extensions: UPRIGHT }) });
      const { batch } = await writeTokens(app, {
        ...seeded,
        tokens: [makeColorToken({ $extensions: ITALIC })],
      });

      const response = await request(app, {
        accessToken: seeded.accessToken,
        path: `/proposal-batches/${batch.id}`,
      });

      expect((await response.json()).proposals).toMatchObject([
        {
          validated: { $value: PRIMARY_BLUE, $extensions: UPRIGHT },
          proposed: { $value: PRIMARY_BLUE, $extensions: ITALIC },
        },
      ]);
    }));
});

describe("les extensions ne comptent pas pour le doublon (ADR 0030 §5)", () => {
  it("deux tokens identiques sauf par leurs extensions sont des doublons", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken({ $extensions: UPRIGHT }) });
      await addToken(app, {
        ...seeded,
        token: makeColorToken({ name: "couleur.fond.copie", $extensions: ITALIC }),
      });

      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({
          name: "couleur.fond.copie",
          duplicates: ["couleur.fond.primaire"],
        }),
      );
    }));
});

describe("une valeur Figma divergente garde les extensions du token (ADR 0030 §2)", () => {
  it("la proposition née de la divergence porte les extensions validées", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const token = makeColorToken({ $extensions: ITALIC });
      await addToken(app, { ...seeded, token });

      const declared = await callTool(app, {
        accessToken: seeded.accessToken,
        name: "declare_figma_states",
        args: {
          projectId: seeded.projectId,
          states: [
            {
              name: token.name,
              state: "diverged",
              figmaValue: {
                $value: { ...PRIMARY_BLUE, components: [0.2, 0.4, 0.6], hex: "#336699" },
              },
            },
          ],
        },
      });
      const proposalId = declared.structuredContent.states[0].proposal.id;
      const batches = await (
        await request(app, {
          accessToken: seeded.accessToken,
          path: `/projects/${seeded.projectId}/proposal-batches`,
        })
      ).json();
      const batch = await (
        await request(app, {
          accessToken: seeded.accessToken,
          path: `/proposal-batches/${batches.batches[0].id}`,
        })
      ).json();

      expect(batch.proposals).toMatchObject([
        { id: proposalId, proposed: { $extensions: ITALIC } },
      ]);
    }));
});
