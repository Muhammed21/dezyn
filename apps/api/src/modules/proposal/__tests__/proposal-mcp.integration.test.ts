import { describe, expect, it } from "vitest";

import {
  ADA,
  type App,
  callMcp,
  GRACE,
  obtainAccessToken,
  withIdentityApp,
} from "#testing/authorization-flow.ts";
import { seedModes, seedProject } from "#testing/project-fixtures.ts";
import { addToken, historyOf, makeColorToken, PRIMARY_BLUE } from "#testing/token-fixtures.ts";
import { schema } from "@repo/db";

const CORRELATION_ID = "proposition-de-tokens-1";

const callTool = async (
  app: App,
  { token, name, args }: { token: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name, arguments: args },
    correlationId: CORRELATION_ID,
  });
  const { result } = await response.json();
  return result;
};

const writeTokens = (
  app: App,
  { token, projectId, tokens }: { token: string; projectId: string; tokens: readonly object[] },
) => callTool(app, { token, name: "write_tokens", args: { projectId, tokens } });

describe("une écriture de l'IA est une proposition, rangée dans un lot (ADR 0012 §1, ADR 0013 §2)", () => {
  it("sans lot ouvert, write_tokens ouvre un lot automatique et propose la création de chaque token", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const tokens = [
        makeColorToken({ name: "couleur.bleu.500" }),
        makeColorToken({ name: "couleur.bleu.700" }),
      ];

      const result = await writeTokens(app, { token: accessToken, projectId, tokens });

      expect(result.structuredContent).toEqual({
        batch: { id: expect.any(String), state: "open" },
        proposals: [
          { id: expect.any(String), name: "couleur.bleu.500", kind: "create", status: "proposed" },
          { id: expect.any(String), name: "couleur.bleu.700", kind: "create", status: "proposed" },
        ],
        unchanged: [],
        replaced: [],
      });
      expect(result.content).toEqual([
        { type: "text", text: JSON.stringify(result.structuredContent) },
      ]);
    }));

  it("une seconde écriture de la même IA va dans le lot encore ouvert", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const first = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.500" })],
      });

      const second = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur.bleu.700" })],
      });

      expect(second.structuredContent.batch).toEqual(first.structuredContent.batch);
    }));
});

describe("une proposition ne fait pas foi tant qu'elle attend (ADR 0012 §3, §6)", () => {
  it("read_tokens ne rend pas un token proposé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await writeTokens(app, { token: accessToken, projectId, tokens: [makeColorToken()] });

      const read = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });

      expect(read.structuredContent.tokens).toEqual([]);
    }));
});

describe("write_tokens entre dans l'historique et refuse ce qui ne lui revient pas (ADR 0021)", () => {
  it("l'appel laisse une entrée mcp.write_tokens avec l'auteur, le client OAuth et les tokens", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, clientId, userId, spaceId, projectId } = await seedProject(app, db);
      const tokens = [makeColorToken()];

      await writeTokens(app, { token: accessToken, projectId, tokens });

      expect((await historyOf(app, { accessToken, projectId }))[0]).toEqual({
        id: expect.any(String),
        action: "mcp.write_tokens",
        spaceId,
        projectId,
        author: { kind: "member", userId, name: ADA.name, membership: "active" },
        clientId,
        before: null,
        after: { outcome: "success", input: { tokens } },
        occurredAt: expect.any(String),
        correlationId: CORRELATION_ID,
      });
    }));

  it("l'IA d'un non-membre reçoit « Projet introuvable », sans lot", () =>
    withIdentityApp(async (app, db) => {
      const { projectId } = await seedProject(app, db);
      const grace = await obtainAccessToken(app, { user: GRACE });

      const result = await writeTokens(app, {
        token: grace.accessToken,
        projectId,
        tokens: [makeColorToken()],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "Projet introuvable" }],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));

  it("une définition invalide refuse tout l'appel, en nommant le token et le champ, sans lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const outOfRange = { colorSpace: "srgb", components: [0.2, 1.4, 0.8] };

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ name: "couleur.bleu.700", $value: outOfRange }),
        ],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [
          {
            type: "text",
            text: "tokens[1].$value.components : Composante hors de l'intervalle 0 à 1",
          },
        ],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
      expect((await historyOf(app, { accessToken, projectId }))[0]).toMatchObject({
        action: "mcp.write_tokens",
        after: { outcome: "error" },
      });
    }));

  it("chaque refus tient sur sa ligne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ name: "couleur..bleu" }), makeColorToken({ name: "{couleur}" })],
      });

      expect(result.content).toEqual([
        {
          type: "text",
          text: "tokens[0].name : Segment de nom vide\ntokens[1].name : Accolade interdite dans un nom",
        },
      ]);
    }));

  it("si l'entrée ne peut pas être écrite, l'outil rend une erreur au lieu du lot", () =>
    withIdentityApp(
      async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const result = await writeTokens(app, {
          token: accessToken,
          projectId,
          tokens: [makeColorToken()],
        });

        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text: "Historique indisponible" }],
        });
        expect(result.structuredContent).toBeUndefined();
      },
      {
        wrapHistoryWriter: (writer) => ({
          append: (entry) =>
            entry.action.startsWith("mcp.")
              ? Promise.reject(new Error("historique indisponible"))
              : writer.append(entry),
        }),
      },
    ));

  it("un appel sans token est refusé", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, { token: accessToken, projectId, tokens: [] });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: expect.stringMatching(/^tokens : /) }],
      });
    }));
});

const colorTokens = (count: number) =>
  Array.from({ length: count }, (_, index) => makeColorToken({ name: `couleur.${index}` }));

describe("write_tokens refuse un type DTCG en attente en le nommant (ADR 0028 §3)", () => {
  it.each(["duration", "cubicBezier", "transition", "border", "strokeStyle"])(
    "un token %s refuse tout l'appel, sans lot",
    ($type) =>
      withIdentityApp(async (app, db) => {
        const { accessToken, projectId } = await seedProject(app, db);

        const result = await writeTokens(app, {
          token: accessToken,
          projectId,
          tokens: [
            makeColorToken({ name: "couleur.fond" }),
            makeColorToken({ name: "duree", $type }),
          ],
        });

        expect(result).toMatchObject({
          isError: true,
          content: [
            {
              type: "text",
              text: `tokens[1].$type : Le type ${$type} n'est pas encore pris en charge`,
            },
          ],
        });
        expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
      }),
  );
});

describe("une entrée de write_tokens qui n'est pas un objet garde le refus de forme", () => {
  it("null et un texte sont refusés chacun sur sa ligne", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens: [null, "couleur.fond"] },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text.split("\n")).toEqual([
        expect.stringMatching(/^tokens\[0\] : /),
        expect.stringMatching(/^tokens\[1\] : /),
      ]);
    }));
});

describe("un appel write_tokens porte 500 tokens au plus", () => {
  it("500 tokens deviennent 500 propositions", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: colorTokens(500),
      });

      expect(result.structuredContent.proposals).toHaveLength(500);
    }));

  it("501 tokens refusent l'appel, sans lot ni proposition", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: colorTokens(501),
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "tokens : 500 tokens au plus par appel" }],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));
});

describe("write_tokens s'annonce à l'IA", () => {
  it("tools/list annonce write_tokens, son entrée et sa sortie", () =>
    withIdentityApp(async (app) => {
      const { accessToken } = await obtainAccessToken(app);

      const response = await callMcp(app, { token: accessToken, method: "tools/list" });

      expect(await response.json()).toMatchObject({
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: "write_tokens",
              description:
                "Propose la création ou la modification de tokens DTCG dans un projet : chaque token devient une proposition Proposée, rangée dans le lot ouvert de l'IA, à relire par un éditeur. Un token identique à sa valeur validée ou en attente revient dans unchanged ; une nouvelle valeur remplace la proposition en attente sur le même nom et revient dans replaced. Chaque nom n'apparaît qu'une fois par appel. $extensions garde, sous une clé en notation de domaine inversé (com.figma), les données d'un autre outil que dezyn n'interprète pas : une valeur de design n'y va jamais.",
              inputSchema: expect.objectContaining({
                required: ["projectId"],
                properties: expect.objectContaining({ tokens: expect.anything() }),
              }),
              outputSchema: expect.objectContaining({
                properties: expect.objectContaining({
                  batch: expect.anything(),
                  proposals: expect.anything(),
                }),
              }),
            }),
          ]),
        },
      });
    }));
});

describe("write_tokens refuse dès la proposition ce que l'ajout d'un membre refuserait (ADR 0010 §4)", () => {
  it("sur un projet clair et sombre, un token sans valeur sombre refuse l'appel, sans lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await seedModes(db, { projectId, modes: ["clair", "sombre"] });

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [{ name: "couleur.fond", $type: "color", modes: { clair: PRIMARY_BLUE } }],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "tokens[0].modes.sombre : Valeur manquante pour ce mode" }],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));

  it("une référence vers un token inexistant refuse l'appel en nommant le token, sans lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ $value: "{couleur.inconnue}" })],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "tokens[0].$value : Référence vers un token inexistant" }],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));

  it("une référence vers un token validé du projet est acceptée", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      await addToken(app, {
        accessToken,
        projectId,
        token: makeColorToken({ name: "couleur.bleu.500" }),
      });

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [makeColorToken({ $value: "{couleur.bleu.500}" })],
      });

      expect(result.structuredContent.proposals).toMatchObject([
        { name: "couleur.fond.primaire", status: "proposed" },
      ]);
    }));

  it("un appel propose un primitif et le sémantique qui le référence", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [
          makeColorToken({ name: "couleur.fond.primaire", $value: "{couleur.bleu.500}" }),
          makeColorToken({ name: "couleur.bleu.500" }),
        ],
      });

      expect(result.structuredContent.proposals).toMatchObject([
        { name: "couleur.fond.primaire", status: "proposed" },
        { name: "couleur.bleu.500", status: "proposed" },
      ]);
    }));

  it("une référence vers un token de la même écriture d'un autre type refuse l'appel", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [
          { name: "espacement.moyen", $type: "dimension", $value: { value: 16, unit: "px" } },
          makeColorToken({ $value: "{espacement.moyen}" }),
        ],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [
          { type: "text", text: "tokens[1].$value : Référence vers un token d'un autre type" },
        ],
      });
    }));
});

describe("une donnée a au plus une proposition en attente (ADR 0013 §6)", () => {
  it("un appel qui nomme deux fois le même token est refusé, sans lot", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);

      const result = await writeTokens(app, {
        token: accessToken,
        projectId,
        tokens: [
          makeColorToken(),
          makeColorToken({ name: "couleur.bleu.500" }),
          makeColorToken({ $value: { colorSpace: "srgb", components: [0.1, 0.2, 0.4] } }),
        ],
      });

      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: "tokens[2].name : Token déjà nommé dans cet appel" }],
      });
      expect(await db.orm.select().from(schema.proposalBatch)).toEqual([]);
    }));

  it("des écritures concurrentes d'un même token laissent une seule proposition en attente", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const values = [0.1, 0.2, 0.3, 0.4].map((red) => ({
        colorSpace: "srgb",
        components: [red, 0.2, 0.4],
      }));

      const results = await Promise.all(
        values.map(($value) =>
          writeTokens(app, { token: accessToken, projectId, tokens: [makeColorToken({ $value })] }),
        ),
      );
      const read = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId, includeProposals: true },
      });

      expect(results.map(({ isError }) => isError)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(read.structuredContent.proposals).toEqual([
        expect.objectContaining({ name: "couleur.fond.primaire", status: "proposed" }),
      ]);
    }));
});
