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

  it("donne chaque espace avec son nom, son plan, le rôle du membre et ses actions permises", async () => {
    const team = makeSpace({
      id: "9b8a7f6e-5d4c-4b3a-8f2e-1d0c9b8a7f6e",
      name: "Studio Grace",
      plan: "team",
      role: "editor",
      allowedActions: ["space.read", "proposal.review"],
    });
    const { spaces } = answering(json({ spaces: [makeSpace(), team] }));

    expect(await spaces.listMySpaces()).toEqual(
      ok([
        {
          id: makeSpace().id,
          name: "Studio Ada",
          plan: "free",
          role: "owner",
          allowedActions: ["space.read", "project.create"],
        },
        {
          id: team.id,
          name: "Studio Grace",
          plan: "team",
          role: "editor",
          allowedActions: ["space.read", "proposal.review"],
        },
      ]),
    );
  });

  it("garde un espace dont le plan, le rôle et une action sont inconnus de l'app (ADR 0023 §2)", async () => {
    const later = makeSpace({
      plan: "enterprise",
      role: "viewer",
      allowedActions: ["space.read", "space.archive"],
    });
    const { spaces } = answering(json({ spaces: [later], nextCursor: null }));

    expect(await spaces.listMySpaces()).toEqual(
      ok([
        {
          id: later.id,
          name: later.name,
          plan: "unknown",
          role: "unknown",
          allowedActions: ["space.read"],
        },
      ]),
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
    [
      "un espace sans actions permises",
      json({ spaces: [makeSpace({ allowedActions: undefined })] }),
    ],
    ["un corps sans liste", json({})],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
    ["un refus 403", json({}, 403)],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.listMySpaces()).toEqual(err("invalid_response"));
  });
});

const SPACE_ID = makeSpace().id;

describe("lecture d'un espace du membre dans l'app web (ADR 0044 §5)", () => {
  it("demande l'espace de l'adresse à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json(makeSpace()));

    await spaces.readSpace({ spaceId: SPACE_ID });

    expect(calls).toEqual([
      { url: `${API_URL}/v1/spaces/${SPACE_ID}`, init: { method: "GET", credentials: "include" } },
    ]);
  });

  it("donne l'espace avec le rôle du membre et les actions que ce rôle permet", async () => {
    const editorSpace = makeSpace({
      role: "editor",
      allowedActions: ["space.read", "token.create", "proposal.review"],
    });
    const { spaces } = answering(json(editorSpace));

    expect(await spaces.readSpace({ spaceId: SPACE_ID })).toEqual(
      ok({
        id: SPACE_ID,
        name: "Studio Ada",
        plan: "free",
        role: "editor",
        allowedActions: ["space.read", "token.create", "proposal.review"],
      }),
    );
  });

  it("ignore une action inconnue de l'app (ADR 0023 §2)", async () => {
    const { spaces } = answering(
      json(makeSpace({ allowedActions: ["space.archive", "project.create"] })),
    );

    const read = await spaces.readSpace({ spaceId: SPACE_ID });

    expect(read.ok && read.value.allowedActions).toEqual(["project.create"]);
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { spaces, calls } = answering(json(makeSpace()));

    expect(await spaces.readSpace({ spaceId: "espace-1" })).toEqual(err("not_found"));
    expect(calls).toEqual([]);
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [503, "unavailable"],
    [429, "unavailable"],
    [403, "invalid_response"],
  ] as const)("donne, sur une réponse %i, %s", async (status, failure) => {
    const { spaces } = answering(json({}, status));

    expect(await spaces.readSpace({ spaceId: SPACE_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await spaces.readSpace({ spaceId: SPACE_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["un espace sans actions permises", json(makeSpace({ allowedActions: undefined }))],
    ["un identifiant qui n'est pas un UUID", json(makeSpace({ id: "espace-1" }))],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.readSpace({ spaceId: SPACE_ID })).toEqual(err("invalid_response"));
  });
});

const TOKEN = "q3Zt8kV0yXlN2mB7cR4wE1sD6fG9hJ5aL0pO3iU8tYk";

const problem = (body: Readonly<Record<string, unknown>>, status: number) =>
  json({ title: "Refus", status, ...body }, status);

describe("acceptation d'une invitation dans l'app web (ADR 0011, ADR 0044 §6)", () => {
  it("envoie l'acceptation du jeton à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json(makeSpace({ role: "editor" })));

    await spaces.acceptInvitation({ token: TOKEN });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/invitations/${TOKEN}/accept`,
        init: { method: "POST", credentials: "include" },
      },
    ]);
  });

  it("donne l'espace rejoint avec le rôle du membre et ses actions permises", async () => {
    const { spaces } = answering(
      json(makeSpace({ plan: "team", role: "editor", allowedActions: ["space.read"] })),
    );

    expect(await spaces.acceptInvitation({ token: TOKEN })).toEqual(
      ok({
        id: makeSpace().id,
        name: "Studio Ada",
        plan: "team",
        role: "editor",
        allowedActions: ["space.read"],
      }),
    );
  });

  it.each([
    ["gone", problem({ type: "about:blank" }, 410)],
    ["email_mismatch", problem({ type: "https://dezyn.dev/problems/email-mismatch" }, 403)],
    ["already_member", problem({ type: "https://dezyn.dev/problems/already-member" }, 409)],
    [
      "plan_required",
      problem({ type: "https://dezyn.dev/problems/plan-required", requiredPlan: "team" }, 403),
    ],
    ["unauthenticated", json({}, 401)],
    ["unavailable", json({}, 500)],
    ["unavailable", json({}, 429)],
  ] as const)("donne %s", async (failure, response) => {
    const { spaces } = answering(response);

    expect(await spaces.acceptInvitation({ token: TOKEN })).toEqual(err(failure));
  });

  it.each([
    ["un 403 sans type connu", problem({ type: "about:blank" }, 403)],
    ["un 409 sans type connu", problem({ type: "about:blank" }, 409)],
    ["un 403 qui n'est pas du JSON", () => new Response("<html>", { status: 403 })],
    ["un 404", json({}, 404)],
    ["un espace rejoint sans rôle", json(makeSpace({ role: undefined }))],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.acceptInvitation({ token: TOKEN })).toEqual(err("invalid_response"));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await spaces.acceptInvitation({ token: TOKEN })).toEqual(err("unavailable"));
  });
});
