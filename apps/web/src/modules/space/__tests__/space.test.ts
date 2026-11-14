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

const INVITATION = {
  id: "2c5d6e7f-8a9b-4f2a-9c1e-7b3d4e8a9f10",
  email: "grace@dezyn.test",
  expiresAt: "2026-11-21T10:00:00.000Z",
};

describe("invitation d'un membre depuis l'app web (ADR 0011, ADR 0017 §1)", () => {
  it("envoie l'email de l'invité à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json(INVITATION, 201));

    await spaces.inviteMember({ spaceId: SPACE_ID, email: INVITATION.email });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/spaces/${SPACE_ID}/invitations`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: INVITATION.email }),
          credentials: "include",
        },
      },
    ]);
  });

  it("donne l'invitation envoyée avec son email et sa date d'expiration", async () => {
    const { spaces } = answering(json(INVITATION, 201));

    expect(await spaces.inviteMember({ spaceId: SPACE_ID, email: INVITATION.email })).toEqual(
      ok({
        id: INVITATION.id,
        email: INVITATION.email,
        expiresAt: new Date(INVITATION.expiresAt),
      }),
    );
  });

  it("donne not_found sans appeler l'API quand l'identifiant n'est pas un UUID", async () => {
    const { spaces, calls } = answering(json(INVITATION, 201));

    expect(await spaces.inviteMember({ spaceId: "espace-1", email: INVITATION.email })).toEqual(
      err("not_found"),
    );
    expect(calls).toEqual([]);
  });

  it.each([
    ["invalid_email", problem({ type: "about:blank" }, 400)],
    ["unauthenticated", json({}, 401)],
    ["not_found", problem({ type: "about:blank" }, 404)],
    [
      "plan_required",
      problem({ type: "https://dezyn.dev/problems/plan-required", requiredPlan: "team" }, 403),
    ],
    ["forbidden", problem({ type: "about:blank" }, 403)],
    ["forbidden", () => new Response("<html>", { status: 403 })],
    ["already_member", problem({ type: "https://dezyn.dev/problems/already-member" }, 409)],
    ["unavailable", problem({ type: "about:blank" }, 503)],
    ["unavailable", json({}, 500)],
    ["unavailable", json({}, 429)],
  ] as const)("donne %s", async (failure, response) => {
    const { spaces } = answering(response);

    expect(await spaces.inviteMember({ spaceId: SPACE_ID, email: INVITATION.email })).toEqual(
      err(failure),
    );
  });

  it.each([
    ["un 409 sans type connu", problem({ type: "about:blank" }, 409)],
    ["un 200 au lieu d'un 201", json(INVITATION, 200)],
    ["une invitation sans date d'expiration", json({ ...INVITATION, expiresAt: undefined }, 201)],
    [
      "une invitation dont l'identifiant n'est pas un UUID",
      json({ ...INVITATION, id: "i-1" }, 201),
    ],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.inviteMember({ spaceId: SPACE_ID, email: INVITATION.email })).toEqual(
      err("invalid_response"),
    );
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await spaces.inviteMember({ spaceId: SPACE_ID, email: INVITATION.email })).toEqual(
      err("unavailable"),
    );
  });
});

const makeMember = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: "7b3d4e8a-9f10-4c5d-8e7f-8a9b4f2a9c1e",
  name: "Ada Lovelace",
  email: "ada@dezyn.test",
  role: "owner",
  ...overrides,
});

describe("liste des membres d'un espace dans l'app web (ADR 0044 §5)", () => {
  it("demande les membres de l'espace à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json({ members: [] }));

    await spaces.listMembers({ spaceId: SPACE_ID });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/spaces/${SPACE_ID}/members`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne chaque membre avec son nom, son email et son rôle, dans l'ordre de l'API", async () => {
    const ada = makeMember({ name: "Ada Lovelace", email: "ada@dezyn.test", role: "owner" });
    const grace = makeMember({
      userId: "9f10a2c5-d6e7-4f8a-9b4f-2a9c1e7b3d4e",
      name: "Grace Hopper",
      email: "grace@dezyn.test",
      role: "editor",
    });
    const { spaces } = answering(json({ members: [ada, grace] }));

    expect(await spaces.listMembers({ spaceId: SPACE_ID })).toEqual(
      ok([
        { userId: ada.userId, name: "Ada Lovelace", email: "ada@dezyn.test", role: "owner" },
        { userId: grace.userId, name: "Grace Hopper", email: "grace@dezyn.test", role: "editor" },
      ]),
    );
  });

  it("garde un membre dont le rôle est inconnu de l'app (ADR 0023 §2)", async () => {
    const { spaces } = answering(json({ members: [makeMember({ role: "viewer" })] }));

    const listed = await spaces.listMembers({ spaceId: SPACE_ID });

    expect(listed.ok && listed.value.map(({ role }) => role)).toEqual(["unknown"]);
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { spaces, calls } = answering(json({ members: [] }));

    expect(await spaces.listMembers({ spaceId: "espace-1" })).toEqual(err("not_found"));
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

    expect(await spaces.listMembers({ spaceId: SPACE_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await spaces.listMembers({ spaceId: SPACE_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["un membre sans email", json({ members: [makeMember({ email: undefined })] })],
    [
      "un membre dont l'identifiant n'est pas un UUID",
      json({ members: [makeMember({ userId: "u-1" })] }),
    ],
    ["un corps sans liste", json({})],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(await spaces.listMembers({ spaceId: SPACE_ID })).toEqual(err("invalid_response"));
  });
});

const MEMBER_ID = "9f10a2c5-d6e7-4f8a-9b4f-2a9c1e7b3d4e";

describe("changement de rôle d'un membre depuis l'app web (ADR 0017)", () => {
  it("envoie le nouveau rôle du membre à l'API avec le cookie du navigateur", async () => {
    const { spaces, calls } = answering(json({ userId: MEMBER_ID, role: "owner" }));

    await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role: "owner" });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/spaces/${SPACE_ID}/members/${MEMBER_ID}`,
        init: {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: "owner" }),
          credentials: "include",
        },
      },
    ]);
  });

  it.each(["owner", "editor"] as const)(
    "donne le membre avec son nouveau rôle %s",
    async (role) => {
      const { spaces } = answering(json({ userId: MEMBER_ID, role }));

      expect(await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role })).toEqual(
        ok({ userId: MEMBER_ID, role }),
      );
    },
  );

  it("garde un rôle rendu inconnu de l'app (ADR 0023 §2)", async () => {
    const { spaces } = answering(json({ userId: MEMBER_ID, role: "viewer" }));

    expect(
      await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role: "editor" }),
    ).toEqual(ok({ userId: MEMBER_ID, role: "unknown" }));
  });

  it.each([
    ["de l'espace", { spaceId: "espace-1", memberId: MEMBER_ID }],
    ["du membre", { spaceId: SPACE_ID, memberId: "membre-1" }],
  ])(
    "donne not_found sans appeler l'API quand l'identifiant %s n'est pas un UUID",
    async (_case, ids) => {
      const { spaces, calls } = answering(json({ userId: MEMBER_ID, role: "owner" }));

      expect(await spaces.changeRole({ ...ids, role: "owner" })).toEqual(err("not_found"));
      expect(calls).toEqual([]);
    },
  );

  it.each([
    ["unauthenticated", json({}, 401)],
    ["not_found", problem({ type: "about:blank" }, 404)],
    ["forbidden", problem({ type: "about:blank" }, 403)],
    ["last_owner", problem({ type: "https://dezyn.dev/problems/last-owner" }, 409)],
    ["unavailable", problem({ type: "about:blank" }, 503)],
    ["unavailable", json({}, 500)],
    ["unavailable", json({}, 429)],
  ] as const)("donne %s", async (failure, response) => {
    const { spaces } = answering(response);

    expect(
      await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role: "editor" }),
    ).toEqual(err(failure));
  });

  it.each([
    ["un 409 sans type connu", problem({ type: "about:blank" }, 409)],
    ["un 409 dont le corps n'est pas du JSON", () => new Response("<html>", { status: 409 })],
    ["un 400", problem({ type: "about:blank" }, 400)],
    ["un 201 au lieu d'un 200", json({ userId: MEMBER_ID, role: "editor" }, 201)],
    ["un membre sans rôle", json({ userId: MEMBER_ID })],
    ["un membre dont l'identifiant n'est pas un UUID", json({ userId: "u-1", role: "editor" })],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { spaces } = answering(response);

    expect(
      await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role: "editor" }),
    ).toEqual(err("invalid_response"));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const spaces = createSpaces({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(
      await spaces.changeRole({ spaceId: SPACE_ID, memberId: MEMBER_ID, role: "editor" }),
    ).toEqual(err("unavailable"));
  });
});
