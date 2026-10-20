import { describe, expect, it } from "vitest";

import { type App, BASE_URL, callMcp, withIdentityApp } from "#testing/authorization-flow.ts";
import { seedProject } from "#testing/project-fixtures.ts";
import { addToken } from "#testing/token-fixtures.ts";

const callTool = async (
  app: App,
  { token, name, args }: { token: string; name: string; args: object },
) => {
  const response = await callMcp(app, {
    token,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const { result } = await response.json();
  return result;
};

const validate = (
  app: App,
  { accessToken, proposalId }: { accessToken: string; proposalId: string },
) =>
  app.request(`${BASE_URL}/v1/proposals/${proposalId}/validate`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  });

const BODY_FONT = { name: "police.corps", $type: "fontFamily", $value: "Inter" };

const STRONG_WEIGHT = { name: "graisse.forte", $type: "fontWeight", $value: "bold" };

const BODY_LINE_HEIGHT = { name: "interligne.corps", $type: "number", $value: 1.5 };

describe("l'IA propose une famille, une graisse ou un nombre (ADR 0028 §1)", () => {
  it("une fois validés, read_tokens les rend à l'identique", () =>
    withIdentityApp(async (app, db) => {
      const { accessToken, projectId } = await seedProject(app, db);
      const tokens = [STRONG_WEIGHT, BODY_LINE_HEIGHT, BODY_FONT];
      const written = await callTool(app, {
        token: accessToken,
        name: "write_tokens",
        args: { projectId, tokens },
      });
      for (const { id } of written.structuredContent.proposals) {
        await validate(app, { accessToken, proposalId: id });
      }

      const read = await callTool(app, {
        token: accessToken,
        name: "read_tokens",
        args: { projectId },
      });

      expect(read.structuredContent.tokens).toEqual([
        { id: expect.any(String), ...STRONG_WEIGHT, status: "validated" },
        { id: expect.any(String), ...BODY_LINE_HEIGHT, status: "validated" },
        { id: expect.any(String), ...BODY_FONT, status: "validated" },
      ]);
    }));
});

describe("deux tokens de même type et de même valeur sont des doublons (ADR 0024 §5)", () => {
  it.each([[BODY_FONT], [STRONG_WEIGHT], [BODY_LINE_HEIGHT]])("pour %j", (token) =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token });
      await addToken(app, { ...seeded, token: { ...token, name: "valeur.copie" } });

      const read = await callTool(app, {
        token: seeded.accessToken,
        name: "read_tokens",
        args: { projectId: seeded.projectId },
      });

      expect(read.structuredContent.tokens).toContainEqual(
        expect.objectContaining({ name: "valeur.copie", duplicates: [token.name] }),
      );
    }),
  );
});

describe("la valeur Figma divergente d'une graisse devient une proposition (ADR 0024 §4)", () => {
  it("avec la valeur Figma comme valeur proposée", () =>
    withIdentityApp(async (app, db) => {
      const seeded = await seedProject(app, db);
      await addToken(app, { ...seeded, token: STRONG_WEIGHT });

      const declared = await callTool(app, {
        token: seeded.accessToken,
        name: "declare_figma_states",
        args: {
          projectId: seeded.projectId,
          states: [{ name: STRONG_WEIGHT.name, state: "diverged", figmaValue: { $value: 600 } }],
        },
      });

      expect(declared.isError).toBeUndefined();
      expect(declared.structuredContent.states).toMatchObject([
        { name: STRONG_WEIGHT.name, state: "diverged", proposal: { id: expect.any(String) } },
      ]);
    }));
});
