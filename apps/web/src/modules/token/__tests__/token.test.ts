import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createTokens } from "../token-module.ts";

const API_URL = "https://api.dezyn.dev";
const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.2, 0.4, 0.8], hex: "#3366cc" };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4], hex: "#1a3366" };

const makeTokenOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  name: "couleur.fond.primaire",
  $type: "color",
  $value: PRIMARY_BLUE,
  status: "validated",
  ...overrides,
});

const makeTokensOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  modes: [],
  tokens: [makeTokenOutput()],
  ...overrides,
});

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { tokens: createTokens({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

const reading = { projectId: PROJECT_ID };

describe("lecture des tokens d'un projet dans l'app web (ADR 0044)", () => {
  it("demande les tokens du projet à l'API avec le cookie du navigateur", async () => {
    const { tokens, calls } = answering(json(makeTokensOutput()));

    await tokens.readTokens(reading);

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/projects/${PROJECT_ID}/tokens`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne un token sans mode avec sa valeur unique et sa description", async () => {
    const { tokens } = answering(
      json(makeTokensOutput({ tokens: [makeTokenOutput({ $description: "Fond des boutons" })] })),
    );

    expect(await tokens.readTokens(reading)).toEqual(
      ok({
        modes: [],
        tokens: [
          {
            id: makeTokenOutput().id,
            name: "couleur.fond.primaire",
            type: "color",
            value: { kind: "single", value: PRIMARY_BLUE },
            description: "Fond des boutons",
          },
        ],
      }),
    );
  });

  it("donne les modes du projet et la valeur d'un token dans chaque mode", async () => {
    const modal = makeTokenOutput({
      $value: undefined,
      modes: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE },
    });
    const { tokens } = answering(
      json(makeTokensOutput({ modes: ["clair", "sombre"], tokens: [modal] })),
    );

    expect(await tokens.readTokens(reading)).toEqual(
      ok({
        modes: ["clair", "sombre"],
        tokens: [
          {
            id: modal.id,
            name: "couleur.fond.primaire",
            type: "color",
            value: { kind: "by_mode", values: { clair: PRIMARY_BLUE, sombre: NIGHT_BLUE } },
            description: undefined,
          },
        ],
      }),
    );
  });

  it("donne un projet sans token", async () => {
    const { tokens } = answering(json(makeTokensOutput({ tokens: [] })));

    expect(await tokens.readTokens(reading)).toEqual(ok({ modes: [], tokens: [] }));
  });

  it.each([
    "color",
    "dimension",
    "typography",
    "shadow",
    "gradient",
    "fontFamily",
    "fontWeight",
    "number",
  ])("garde le type %s", async ($type) => {
    const { tokens } = answering(json(makeTokensOutput({ tokens: [makeTokenOutput({ $type })] })));

    const read = await tokens.readTokens(reading);

    expect(read.ok && read.value.tokens.map(({ type }) => type)).toEqual([$type]);
  });

  it("donne unknown pour un type que l'app ne connaît pas encore", async () => {
    const { tokens } = answering(
      json(
        makeTokensOutput({
          tokens: [makeTokenOutput({ $type: "duration", $value: { value: 200, unit: "ms" } })],
        }),
      ),
    );

    const read = await tokens.readTokens(reading);

    expect(read.ok && read.value.tokens.map(({ type }) => type)).toEqual(["unknown"]);
  });

  it.each(["../../auth/sign-out", "..", "projet-1", ""])(
    "donne not_found pour le projet %j, qui n'est pas un UUID, sans appeler l'API",
    async (projectId) => {
      const { tokens, calls } = answering(json(makeTokensOutput()));

      expect(await tokens.readTokens({ projectId })).toEqual(err("not_found"));
      expect(calls).toEqual([]);
    },
  );

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [503, "unavailable"],
    [429, "unavailable"],
    [403, "invalid_response"],
  ])("donne sur une réponse %i l'échec attendu", async (status, failure) => {
    const { tokens } = answering(json({ title: "Refus" }, status));

    expect(await tokens.readTokens(reading)).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const tokens = createTokens({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await tokens.readTokens(reading)).toEqual(err("unavailable"));
  });

  it.each([
    [
      "un token dont l'identifiant n'est pas un UUID",
      json(makeTokensOutput({ tokens: [makeTokenOutput({ id: "token-1" })] })),
    ],
    ["un corps sans modes", json({ tokens: [] })],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { tokens } = answering(response);

    expect(await tokens.readTokens(reading)).toEqual(err("invalid_response"));
  });
});
