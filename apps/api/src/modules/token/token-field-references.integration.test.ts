import { Client } from "pg";
import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import { addToken, seedProposedToken } from "#testing/token-fixtures.ts";

const BODY_TEXT = {
  fontFamily: ["Inter", "sans-serif"],
  fontSize: { value: 16, unit: "px" },
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: { value: 0, unit: "px" },
};

const makeTypographyToken = (fields: Record<string, unknown>) => ({
  name: "texte.corps",
  $type: "typography",
  $value: { ...BODY_TEXT, ...fields },
});

const tokensOf = async (
  app: App,
  { accessToken, projectId }: { accessToken: string; projectId: string },
) => {
  const response = await app.request(`${BASE_URL}/v1/projects/${projectId}/tokens`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return (await response.json()).tokens;
};

const seedBaseTokens = async (app: App, db: PostgresDatabase) => {
  const seeded = await seedProject(app, db);
  const base = [
    { name: "police.corps", $type: "fontFamily", $value: "Inter" },
    { name: "taille.corps", $type: "dimension", $value: { value: 18, unit: "px" } },
    { name: "graisse.corps", $type: "fontWeight", $value: 400 },
    { name: "interligne.corps", $type: "number", $value: 1.4 },
  ];
  for (const token of base) {
    await addToken(app, { ...seeded, token });
  }
  return seeded;
};

describe("un champ de typographie référence un token validé du type du champ (ADR 0029 §1)", () => {
  it("la typographie se relit avec l'alias du champ tel qu'écrit, les autres champs en dur", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedBaseTokens(app, db);
      const token = makeTypographyToken({ fontSize: "{taille.corps}" });

      const response = await addToken(app, { ...seeded, token });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({ ...token, status: "validated" }),
      );
    }));

  it.each([
    ["fontFamily", "{police.corps}"],
    ["fontSize", "{taille.corps}"],
    ["fontWeight", "{graisse.corps}"],
    ["lineHeight", "{interligne.corps}"],
    ["letterSpacing", "{taille.corps}"],
  ])("le champ %s accepte une référence vers un token validé de son type", (field, alias) =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedBaseTokens(app, db);

      const response = await addToken(app, {
        ...seeded,
        token: makeTypographyToken({ [field]: alias }),
      });

      expect(response.status).toBe(201);
    }),
  );

  it.each([
    [
      "inconnu",
      { fontSize: "{taille.absente}" },
      "$value.fontSize",
      "Référence vers un token inexistant",
    ],
    [
      "non validé",
      { letterSpacing: "{espacement.propose}" },
      "$value.letterSpacing",
      "Référence vers un token non validé",
    ],
    [
      "d'un autre type",
      { lineHeight: "{taille.corps}" },
      "$value.lineHeight",
      "Référence vers un token d'un autre type",
    ],
  ])(
    "une référence de champ vers un token %s répond 400 en nommant le champ",
    (_case, fields, path, message) =>
      withIdentityApp(async (app, db) => {
        const seeded = await seedBaseTokens(app, db);
        await seedProposedToken(db, { projectId: seeded.projectId, name: "espacement.propose" });

        const response = await addToken(app, { ...seeded, token: makeTypographyToken(fields) });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ errors: [{ path, message }] });
      }),
  );

  it("sur un projet à modes, le refus nomme le mode et le champ", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedBaseTokens(app, db);
      await seedModes(db, { projectId: seeded.projectId, modes: ["clair", "sombre"] });
      const token = {
        name: "texte.corps",
        $type: "typography",
        modes: { clair: BODY_TEXT, sombre: { ...BODY_TEXT, lineHeight: "{interligne.absent}" } },
      };

      const response = await addToken(app, { ...seeded, token });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        errors: [
          { path: "modes.sombre.lineHeight", message: "Référence vers un token inexistant" },
        ],
      });
    }));
});

const deleteTokenAsMigrator = async ({
  migratorUrl,
  name,
}: {
  readonly migratorUrl: string;
  readonly name: string;
}) => {
  const client = new Client({ connectionString: migratorUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      'DELETE FROM "token_value" WHERE "token_id" = (SELECT "id" FROM "token" WHERE "name" = $1)',
      [name],
    );
    await client.query('DELETE FROM "token" WHERE "name" = $1', [name]);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
};

describe("la base garde chaque référence vers le token référencé (ADR 0029 §4)", () => {
  it("un token référencé par une valeur entière ne se supprime pas", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const seeded = await seedBaseTokens(app, db);
      await addToken(app, {
        ...seeded,
        token: { name: "taille.titre", $type: "dimension", $value: "{taille.corps}" },
      });

      await expect(deleteTokenAsMigrator({ migratorUrl, name: "taille.corps" })).rejects.toThrow(
        /token_value_referenced_token_id_token_id_fk/,
      );
    }));

  it("un token référencé par un champ ne se supprime pas", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const seeded = await seedBaseTokens(app, db);
      await addToken(app, {
        ...seeded,
        token: makeTypographyToken({ fontSize: "{taille.corps}" }),
      });

      await expect(deleteTokenAsMigrator({ migratorUrl, name: "taille.corps" })).rejects.toThrow(
        /token_value_reference_referenced_token_id_token_id_fk/,
      );
    }));

  it("un token qu'aucun champ ne référence se supprime", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const seeded = await seedBaseTokens(app, db);
      await addToken(app, { ...seeded, token: makeTypographyToken({}) });

      await expect(
        deleteTokenAsMigrator({ migratorUrl, name: "taille.corps" }),
      ).resolves.toBeUndefined();
    }));
});

const writeTokens = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });
  return (await response.json()).result;
};

const validate = (app: App, { accessToken, id }: { accessToken: string; id: string }) =>
  app.request(`${BASE_URL}/v1/proposals/${id}/validate`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}` },
  });

const BODY_SIZE = { name: "taille.corps", $type: "dimension", $value: { value: 18, unit: "px" } };

describe("l'IA propose une typographie dont un champ référence un token (ADR 0029 §2)", () => {
  it("un champ peut viser un token du même appel, qui doit être validé avant elle", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      const typography = makeTypographyToken({ fontSize: "{taille.corps}" });

      const written = await writeTokens(app, { ...seeded, tokens: [BODY_SIZE, typography] });
      const [size, text] = written.structuredContent.proposals;
      const early = await validate(app, { accessToken: seeded.accessToken, id: text.id });
      await validate(app, { accessToken: seeded.accessToken, id: size.id });
      const late = await validate(app, { accessToken: seeded.accessToken, id: text.id });

      expect(written.isError).toBeUndefined();
      expect(early.status).toBe(409);
      expect(await early.json()).toMatchObject({
        errors: [{ path: "$value.fontSize", message: "Référence vers un token non validé" }],
      });
      expect(late.status).toBe(200);
      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({ ...typography, status: "validated" }),
      );
    }));

  it("réécrire en alias un champ jusqu'ici en dur crée une proposition", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: BODY_SIZE });
      await addToken(app, {
        ...seeded,
        token: makeTypographyToken({ fontSize: BODY_SIZE.$value }),
      });

      const written = await writeTokens(app, {
        ...seeded,
        tokens: [makeTypographyToken({ fontSize: "{taille.corps}" })],
      });

      expect(written.structuredContent).toMatchObject({
        proposals: [{ name: "texte.corps" }],
        unchanged: [],
      });
    }));
});

describe("une typographie qui contient une référence de champ n'est pas un doublon (ADR 0029 §3)", () => {
  it("deux typographies au même alias de champ ne se citent pas", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedBaseTokens(app, db);
      const fields = { fontSize: "{taille.corps}" };
      await addToken(app, { ...seeded, token: makeTypographyToken(fields) });
      await addToken(app, {
        ...seeded,
        token: { ...makeTypographyToken(fields), name: "texte.copie" },
      });

      const tokens = await tokensOf(app, seeded);

      expect(tokens.filter((token: object) => "duplicates" in token)).toEqual([]);
    }));

  it("sur un projet à modes, un alias de champ dans un seul mode suffit", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedBaseTokens(app, db);
      await seedModes(db, { projectId: seeded.projectId, modes: ["clair", "sombre"] });
      const modes = {
        clair: BODY_TEXT,
        sombre: { ...BODY_TEXT, lineHeight: "{interligne.corps}" },
      };
      await addToken(app, {
        ...seeded,
        token: { name: "texte.corps", $type: "typography", modes },
      });
      await addToken(app, {
        ...seeded,
        token: { name: "texte.copie", $type: "typography", modes },
      });

      const tokens = await tokensOf(app, seeded);

      expect(tokens.filter((token: object) => "duplicates" in token)).toEqual([]);
    }));
});

const SHADOW_BLACK = { colorSpace: "srgb", components: [0, 0, 0], alpha: 0.25 };

const SHADOW_LAYER = {
  color: SHADOW_BLACK,
  offsetX: { value: 0, unit: "px" },
  offsetY: { value: 2, unit: "px" },
  blur: { value: 4, unit: "px" },
  spread: { value: 0, unit: "px" },
};

const makeShadowToken = ($value: unknown) => ({ name: "ombre.carte", $type: "shadow", $value });

const seedShadowBase = async (app: App, db: PostgresDatabase) => {
  const seeded = await seedBaseTokens(app, db);
  await addToken(app, {
    ...seeded,
    token: { name: "couleur.ombre", $type: "color", $value: SHADOW_BLACK },
  });
  return seeded;
};

describe("un champ d'une couche d'ombre référence un token validé du type du champ (ADR 0029 §1)", () => {
  it.each([
    ["simple", { ...SHADOW_LAYER, color: "{couleur.ombre}", offsetY: "{taille.corps}" }],
    [
      "multicouche",
      [SHADOW_LAYER, { ...SHADOW_LAYER, color: "{couleur.ombre}", blur: "{taille.corps}" }],
    ],
  ])("une ombre %s se relit avec ses alias de champ tels qu'écrits", (_case, $value) =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedShadowBase(app, db);
      const token = makeShadowToken($value);

      const response = await addToken(app, { ...seeded, token });

      expect(response.status).toBe(201);
      expect(await tokensOf(app, seeded)).toContainEqual(
        expect.objectContaining({ ...token, status: "validated" }),
      );
    }),
  );

  it.each(["offsetX", "offsetY", "blur", "spread"])(
    "le champ %s accepte une référence vers une dimension validée",
    (field) =>
      withIdentityApp(async (app, db) => {
        const seeded = await seedShadowBase(app, db);

        const response = await addToken(app, {
          ...seeded,
          token: makeShadowToken({ ...SHADOW_LAYER, [field]: "{taille.corps}" }),
        });

        expect(response.status).toBe(201);
      }),
  );

  it.each([
    [
      "inconnu, sur une ombre simple",
      { ...SHADOW_LAYER, color: "{couleur.absente}" },
      "$value.color",
      "Référence vers un token inexistant",
    ],
    [
      "d'un autre type, sur la deuxième couche",
      [SHADOW_LAYER, { ...SHADOW_LAYER, color: "{taille.corps}" }],
      "$value.1.color",
      "Référence vers un token d'un autre type",
    ],
    [
      "non validé, sur la première couche",
      [{ ...SHADOW_LAYER, spread: "{espacement.propose}" }, SHADOW_LAYER],
      "$value.0.spread",
      "Référence vers un token non validé",
    ],
  ])(
    "une référence de champ vers un token %s répond 400 en nommant la couche et le champ",
    (_case, $value, path, message) =>
      withIdentityApp(async (app, db) => {
        const seeded = await seedShadowBase(app, db);
        await seedProposedToken(db, { projectId: seeded.projectId, name: "espacement.propose" });

        const response = await addToken(app, { ...seeded, token: makeShadowToken($value) });

        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ errors: [{ path, message }] });
      }),
  );

  it("une ombre dont un champ référence un token n'est pas un doublon", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedShadowBase(app, db);
      const $value = [SHADOW_LAYER, { ...SHADOW_LAYER, color: "{couleur.ombre}" }];
      await addToken(app, { ...seeded, token: makeShadowToken($value) });
      await addToken(app, {
        ...seeded,
        token: { ...makeShadowToken($value), name: "ombre.copie" },
      });

      const tokens = await tokensOf(app, seeded);

      expect(tokens.map(({ name }: { name: string }) => name)).toEqual(
        expect.arrayContaining(["ombre.carte", "ombre.copie"]),
      );
      expect(tokens.filter((token: object) => "duplicates" in token)).toEqual([]);
    }));

  it("un token référencé par un champ d'ombre ne se supprime pas", () =>
    withIdentityApp(async (app, db, { migratorUrl }) => {
      const seeded = await seedShadowBase(app, db);
      await addToken(app, {
        ...seeded,
        token: makeShadowToken([SHADOW_LAYER, { ...SHADOW_LAYER, color: "{couleur.ombre}" }]),
      });

      await expect(deleteTokenAsMigrator({ migratorUrl, name: "couleur.ombre" })).rejects.toThrow(
        /token_value_reference_referenced_token_id_token_id_fk/,
      );
    }));
});
