import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { bytesOfProjectRows, bytesOfTokenRows, storedBytesOf } from "#testing/project-storage.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";

const PRECISE_RED = {
  colorSpace: "srgb",
  components: [0.812345678, 0.123456789, 0.198765432],
  alpha: 1,
  hex: "#cf1f33",
};

const LONG_DESCRIPTION = "Fond des alertes critiques. ".repeat(100);

const ROUND_RED = { colorSpace: "srgb", components: [0.8, 0.1, 0.2] };

const BODY_SIZE = { name: "taille.corps", $type: "dimension", $value: { value: 16, unit: "px" } };

const bodyTextWith = (fontSize: unknown) => ({
  name: "texte.corps",
  $type: "typography",
  $value: {
    fontFamily: ["Inter", "sans-serif"],
    fontSize,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: { value: 0, unit: "px" },
  },
});

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
  return result.structuredContent;
};

const seedClosedBatch = async (
  app: App,
  {
    accessToken,
    projectId,
    tokens,
  }: { accessToken: string; projectId: string; tokens: readonly object[] },
) => {
  const written = await callTool(app, {
    accessToken,
    name: "write_tokens",
    args: { projectId, tokens },
  });
  await callTool(app, { accessToken, name: "close_proposal_batch", args: { projectId } });
  return written;
};

const post = (app: App, { accessToken, path }: { accessToken: string; path: string }) =>
  app.request(`${BASE_URL}/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });

describe("le compteur d'un projet suit la relecture des propositions (ADR 0032 §1 à §3)", () => {
  it("la validation d'un lot qui crée un token et en remplace un autre garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken() });
      const written = await seedClosedBatch(app, {
        ...seeded,
        tokens: [
          makeColorToken({ $value: ROUND_RED }),
          makeColorToken({ name: "couleur.fond.second" }),
        ],
      });

      const response = await post(app, {
        ...seeded,
        path: `/proposal-batches/${written.batch.id}/validate`,
      });

      expect(response.status).toBe(200);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("le rejet d'une proposition garde le compteur exact", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const written = await seedClosedBatch(app, { ...seeded, tokens: [makeColorToken()] });

      const response = await post(app, {
        ...seeded,
        path: `/proposals/${written.proposals[0].id}/reject`,
      });

      expect(response.status).toBe(200);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("le remplacement d'un token par une définition plus petite retire la taille de ses anciennes lignes", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, {
        ...seeded,
        token: makeColorToken({ $value: PRECISE_RED, $description: LONG_DESCRIPTION }),
      });
      const written = await seedClosedBatch(app, {
        ...seeded,
        tokens: [makeColorToken({ $value: ROUND_RED })],
      });
      const tokenBytesBefore = await bytesOfTokenRows(db, seeded.projectId);

      await post(app, { ...seeded, path: `/proposals/${written.proposals[0].id}/validate` });

      expect(await bytesOfTokenRows(db, seeded.projectId)).toBeLessThan(tokenBytesBefore);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("le remplacement d'un champ qui référence un token par une valeur en dur retire la référence", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: BODY_SIZE });
      await addToken(app, { ...seeded, token: bodyTextWith("{taille.corps}") });
      const written = await seedClosedBatch(app, {
        ...seeded,
        tokens: [bodyTextWith({ value: 16, unit: "px" })],
      });

      await post(app, { ...seeded, path: `/proposals/${written.proposals[0].id}/validate` });

      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));
});
