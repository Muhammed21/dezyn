import { describe, expect, it } from "vitest";

import { withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import { bytesOfProjectRows, storedBytesOf } from "#testing/project-storage.ts";
import { addToken, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const { tokenValueReference } = schema;

const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4], alpha: 1, hex: "#1a3366" };

const DAY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8], alpha: 1, hex: "#3366cc" };

const BODY_SIZE = { name: "taille.corps", $type: "dimension", $value: { value: 16, unit: "px" } };

const BODY_TEXT = {
  name: "texte.corps",
  $type: "typography",
  $value: {
    fontFamily: ["Inter", "sans-serif"],
    fontSize: "{taille.corps}",
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: { value: 0, unit: "px" },
  },
};

describe("le compteur d'un projet suit l'ajout d'un token (ADR 0032 §1 à §3)", () => {
  it("un token par mode compte le token, ses valeurs et son entrée d'historique", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await seedModes(db, { projectId: seeded.projectId, modes: ["clair", "sombre"] });

      const response = await addToken(app, {
        ...seeded,
        token: {
          name: "couleur.fond.primaire",
          $type: "color",
          modes: { clair: DAY_BLUE, sombre: NIGHT_BLUE },
        },
      });

      expect(response.status).toBe(201);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
      expect(await storedBytesOf(db, seeded.projectId)).toBeGreaterThan(0);
    }));

  it("un champ qui référence un token compte sa référence", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: BODY_SIZE });

      const response = await addToken(app, { ...seeded, token: BODY_TEXT });

      expect(response.status).toBe(201);
      expect(await db.orm.select().from(tokenValueReference)).toHaveLength(1);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("deux ajouts additionnent leurs tailles", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken() });
      const afterFirst = await storedBytesOf(db, seeded.projectId);

      await addToken(app, { ...seeded, token: makeColorToken({ name: "couleur.fond.second" }) });

      expect(await storedBytesOf(db, seeded.projectId)).toBeGreaterThan(afterFirst ?? 0);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(
        await bytesOfProjectRows(db, seeded.projectId),
      );
    }));

  it("un ajout refusé parce que le nom est pris ne change pas le compteur", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: makeColorToken() });
      const before = await storedBytesOf(db, seeded.projectId);

      const response = await addToken(app, { ...seeded, token: makeColorToken() });

      expect(response.status).toBe(400);
      expect(await storedBytesOf(db, seeded.projectId)).toBe(before);
    }));
});
