import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createSpaces } from "../space-module.ts";

const API_URL = "https://api.dezyn.dev";

const makeSpace = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Studio Ada",
  plan: "free",
  role: "owner",
  allowedActions: ["space.read", "project.create"],
  ...overrides,
});

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { spaces: createSpaces({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe("liste des espaces du membre dans l'app web (ADR 0044 §6)", () => {
  it("demande les espaces à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json({ spaces: [] }));

    await spaces.listMySpaces();

    expect(calls).toEqual([
      { url: `${API_URL}/v1/spaces`, init: { method: "GET", credentials: "include" } },
    ]);
  });

  it("donne chaque espace avec son nom, son plan et le rôle du membre", async () => {
    const team = makeSpace({
      id: "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e",
      name: "Studio Grace",
      plan: "team",
      role: "editor",
    });
    const { spaces } = answering(json({ spaces: [makeSpace(), team] }));

    expect(await spaces.listMySpaces()).toEqual(
      ok([
        { id: makeSpace().id, name: "Studio Ada", plan: "free", role: "owner" },
        { id: team.id, name: "Studio Grace", plan: "team", role: "editor" },
      ]),
    );
  });

  it("garde un espace dont le plan et le rôle sont inconnus de l'app (ADR 0023 §2)", async () => {
    const later = makeSpace({ plan: "enterprise", role: "viewer" });
    const { spaces } = answering(json({ spaces: [later], nextCursor: null }));

    expect(await spaces.listMySpaces()).toEqual(
      ok([{ id: later.id, name: later.name, plan: "unknown", role: "unknown" }]),
    );
  });

  it("donne unauthenticated sur un refus 401", async () => {
    const { spaces } = answering(json({ title: "Non authentifié" }, 401));

    expect(await spaces.listMySpaces()).toEqual(err("unauthenticated"));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await spaces.listMySpaces()).toEqual(err("unavailable"));
  });

  it.each([500, 503, 429])("donne unavailable sur une réponse %i", async (status) => {
    const { spaces } = answering(json({}, status));

    expect(await spaces.listMySpaces()).toEqual(err("unavailable"));
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", json({ spaces: [makeSpace({ id: "espace-1" })] })],
    ["un espace sans nom", json({ spaces: [makeSpace({ name: undefined })] })],
    ["un corps sans liste", json({})],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
    ["un refus 403", json({}, 403)],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.listMySpaces()).toEqual(err("invalid_response"));
  });
});
