import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import {
  addToken,
  historyOf,
  makeColorToken,
  PRIMARY_BLUE,
  seedProposedToken,
} from "#testing/token-fixtures.ts";

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const seedBaseColors = async (app: App, db: PostgresDatabase) => {
  const project = await seedProject(app, db);
  const { accessToken, projectId } = project;
  await addToken(app, {
    accessToken,
    projectId,
    token: makeColorToken({ name: "couleur.bleu.500" }),
  });
  await addToken(app, {
    accessToken,
    projectId,
    token: makeColorToken({ name: "couleur.bleu.700", $value: NIGHT_BLUE }),
  });
  return project;
};

describe("un token référence un token validé du même type (ADR 0010 §1)", () => {
  it("un token sémantique sur un token de base est Validé, et l'historique garde l'alias", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedBaseColors(app, db);
      const token = makeColorToken({ $value: "{couleur.bleu.500}" });

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ ...token, status: "validated" });
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "token.created",
        after: token,
      });
    }));

  it("un alias peut viser un autre alias", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedBaseColors(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.marque", $value: "{couleur.bleu.500}" }),
      });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ $value: "{couleur.marque}" }),
      });

      expect(response.status).toBe(201);
    }));

  it("chaque mode référence son propre token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });
      await addToken(app, {
        accessToken,
        projectId,
        token: {
          name: "couleur.bleu",
          $type: "color",
          modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
        },
      });
      const token = {
        name: "couleur.fond.primaire",
        $type: "color",
        modes: { clair: "{couleur.bleu}", sombre: NIGHT_BLUE },
      };

      const response = await addToken(app, { accessToken, projectId, token });

      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject(token);
    }));
});

describe("une référence invalide répond 400 avec la raison", () => {
  it.each([
    ["un token inexistant", "{couleur.rouge}", "Référence vers un token inexistant"],
    ["un token d'un autre type", "{espacement.moyen}", "Référence vers un token d'un autre type"],
    ["un token non validé", "{couleur.proposee}", "Référence vers un token non validé"],
    ["un alias mal formé", "{couleur..bleu}", "Référence attendue au format {nom.du.token}"],
    ["un texte qui n'est pas un alias", "bleu", "Référence attendue au format {nom.du.token}"],
  ])("%s", (_case, $value, message) =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedBaseColors(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: {
          name: "espacement.moyen",
          $type: "dimension",
          $value: { value: 16, unit: "px" },
        },
      });
      await seedProposedToken(db, { projectId, name: "couleur.proposee" });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond.primaire", $value }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ errors: [{ path: "$value", message }] });
    }),
  );

  it("une référence invalide dans un mode nomme le mode", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });

      const response = await addToken(app, {
        accessToken,
        projectId,
        token: {
          name: "couleur.fond.primaire",
          $type: "color",
          modes: { clair: PRIMARY_BLUE, sombre: "{couleur.rouge}" },
        },
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [{ path: "modes.sombre", message: "Référence vers un token inexistant" }],
      });
    }));
});
