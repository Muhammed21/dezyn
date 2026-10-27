import { describe, expect, it } from "vitest";

import type { PostgresDatabase } from "#db";
import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const writeTokens = async (
  app: App,
  { accessToken, projectId, tokens }: { accessToken: string; projectId: string; tokens: object[] },
) => {
  const response = await callMcp(app, {
    token: accessToken,
    method: "tools/call",
    params: { name: "write_tokens", arguments: { projectId, tokens } },
  });
  const { result } = await response.json();
  return result;
};

const refusal = (lines: readonly string[]) => ({
  isError: true,
  content: [{ type: "text", text: lines.join("\n") }],
});

const pendingNames = async (db: PostgresDatabase) =>
  (
    await db.orm
      .select({ name: schema.proposal.tokenName, status: schema.proposal.status })
      .from(schema.proposal)
  )
    .map(({ name, status }) => `${name}:${status}`)
    .toSorted();

describe("write_tokens refuse un nom qui est le groupe d'un autre (ADR 0039 §1)", () => {
  it("un nom en conflit avec un token validé refuse tout l'appel, sans lot, et l'appel entre dans l'historique en échec", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.fond" }),
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "taille.base" }), makeColorToken({ name: "couleur" })],
      });

      expect(result).toMatchObject(
        refusal(["tokens[1].name : Nom en conflit de groupe avec le token couleur.fond"]),
      );
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.write_tokens",
        after: { outcome: "error" },
      });
    }));

  it("un nom en conflit avec une proposition en attente est refusé, et la proposition reste en attente", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur" })],
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.fond.primaire" })],
      });

      expect(result).toMatchObject(
        refusal(["tokens[0].name : Nom en conflit de groupe avec le token couleur"]),
      );
      expect(await pendingNames(db)).toEqual(["couleur:proposed"]);
    }));

  it("deux tokens du même appel en conflit sont refusés tous les deux", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur" }), makeColorToken({ name: "couleur.fond" })],
      });

      expect(result).toMatchObject(
        refusal([
          "tokens[0].name : Nom en conflit de groupe avec le token couleur.fond",
          "tokens[1].name : Nom en conflit de groupe avec le token couleur",
        ]),
      );
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));

  it("une proposition en attente d'un autre projet ne compte pas", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, spaceId, projectId } = await seedProject(app, db);
      const created = await app.request(`${BASE_URL}/v1/spaces/${spaceId}/projects`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name: "Application" }),
      });
      await writeTokens(app, {
        accessToken,
        projectId: String((await created.json()).id),
        tokens: [makeColorToken({ name: "couleur.fond" })],
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur" })],
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent.proposals).toMatchObject([{ name: "couleur" }]);
    }));

  it("un nom qui commence comme un segment d'un autre est accepté", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.fond" })],
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.fondu" })],
      });

      expect(result.isError).toBeUndefined();
      expect(await pendingNames(db)).toEqual(["couleur.fond:proposed", "couleur.fondu:proposed"]);
    }));

  it("un nom identique à une proposition en attente la remplace toujours (ADR 0013)", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.fond" })],
      });

      const result = await writeTokens(app, {
        accessToken,
        projectId,
        tokens: [
          makeColorToken({
            name: "couleur.fond",
            $value: { colorSpace: "srgb", components: [1, 1, 1] },
          }),
        ],
      });

      expect(result.structuredContent.replaced).toMatchObject([{ name: "couleur.fond" }]);
    }));
});
