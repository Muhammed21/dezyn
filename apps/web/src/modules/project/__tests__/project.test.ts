import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createProjects } from "../project-module.ts";

const API_URL = "https://api.dezyn.dev";
const SPACE_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeCreatedProject = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  spaceId: SPACE_ID,
  name: "Site vitrine",
  createdAt: "2026-11-11T18:00:00.000Z",
  ...overrides,
});

const makePlanRequired = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/plan-required",
  title: "Plan Team requis",
  status: 403,
  requiredPlan: "team",
  limit: 3,
  ...overrides,
});

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { projects: createProjects({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 201) =>
  () =>
    Response.json(body, { status });

const creating = (name = "Site vitrine") => ({ spaceId: SPACE_ID, name });

describe("création d'un projet dans l'app web (ADR 0044)", () => {
  it("envoie le nom rogné à l'API, en JSON, avec le cookie du navigateur", async () => {
    const { projects, calls } = answering(json(makeCreatedProject()));

    await projects.createProject(creating("  Site vitrine  "));

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/spaces/${SPACE_ID}/projects`,
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Site vitrine" }),
          credentials: "include",
        },
      },
    ]);
  });

  it("donne le projet créé, avec sa date de création", async () => {
    const { projects } = answering(json(makeCreatedProject({ historyPurgedAt: null })));

    expect(await projects.createProject(creating())).toEqual(
      ok({
        id: makeCreatedProject().id,
        spaceId: SPACE_ID,
        name: "Site vitrine",
        createdAt: new Date("2026-11-11T18:00:00.000Z"),
      }),
    );
  });

  it.each([
    ["vide", ""],
    ["fait d'espaces", "   "],
    ["de 101 caractères", "a".repeat(101)],
  ])("refuse un nom %s sans appeler l'API", async (_case, name) => {
    const { projects, calls } = answering(json(makeCreatedProject()));

    expect(await projects.createProject(creating(name))).toEqual(err("invalid_name"));
    expect(calls).toEqual([]);
  });

  it.each(["../../auth/sign-out", "..", "espace-1", ""])(
    "donne not_found pour l'espace %j, qui n'est pas un UUID, sans appeler l'API",
    async (spaceId) => {
      const { projects, calls } = answering(json(makeCreatedProject()));

      expect(await projects.createProject({ spaceId, name: "Site vitrine" })).toEqual(
        err("not_found"),
      );
      expect(calls).toEqual([]);
    },
  );

  it("envoie un nom de 100 caractères", async () => {
    const { projects, calls } = answering(json(makeCreatedProject()));

    await projects.createProject(creating("a".repeat(100)));

    expect(calls).toHaveLength(1);
  });

  it("donne plan_required avec la limite atteinte", async () => {
    const { projects } = answering(json(makePlanRequired(), 403));

    expect(await projects.createProject(creating())).toEqual(
      err({ reason: "plan_required", limit: 3 }),
    );
  });

  it("donne plan_required sans limite quand l'API n'en donne pas", async () => {
    const { limit: _limit, ...withoutLimit } = makePlanRequired();
    const { projects } = answering(json(withoutLimit, 403));

    expect(await projects.createProject(creating())).toEqual(
      err({ reason: "plan_required", limit: undefined }),
    );
  });

  it.each([
    [400, { title: "Requête invalide", errors: [{ path: "name" }] }, "invalid_name"],
    [401, { title: "Non authentifié" }, "unauthenticated"],
    [403, { type: "about:blank", title: "Accès refusé", status: 403 }, "forbidden"],
    [404, { title: "Introuvable" }, "not_found"],
    [500, {}, "unavailable"],
    [503, {}, "unavailable"],
    [429, {}, "unavailable"],
    [409, {}, "invalid_response"],
  ])("donne sur une réponse %i l'échec attendu", async (status, body, failure) => {
    const { projects } = answering(json(body, status));

    expect(await projects.createProject(creating())).toEqual(err(failure));
  });

  it("donne forbidden sur un 403 dont le corps n'est pas du JSON", async () => {
    const { projects } = answering(() => new Response("<html>", { status: 403 }));

    expect(await projects.createProject(creating())).toEqual(err("forbidden"));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const projects = createProjects({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await projects.createProject(creating())).toEqual(err("unavailable"));
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", json(makeCreatedProject({ id: "projet-1" }))],
    ["une date qui n'est pas ISO", json(makeCreatedProject({ createdAt: "hier" }))],
    ["un projet sans nom", json(makeCreatedProject({ name: undefined }))],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 201 })],
    ["un 200 au lieu d'un 201", json(makeCreatedProject(), 200)],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { projects } = answering(response);

    expect(await projects.createProject(creating())).toEqual(err("invalid_response"));
  });
});

const makeListedProject = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b6f3c2a-8d4e-4f1a-9c7b-5e2d1a0f9b8c",
  name: "Site vitrine",
  createdAt: "2026-11-11T18:00:00.000Z",
  historyPurgedAt: null,
  ...overrides,
});

const listing = (projects: readonly unknown[], status = 200) => json({ projects }, status);

describe("liste des projets d'un espace dans l'app web (ADR 0044)", () => {
  it("demande les projets de l'espace à l'API avec le cookie du navigateur", async () => {
    const { projects, calls } = answering(listing([]));

    await projects.listProjects({ spaceId: SPACE_ID });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/spaces/${SPACE_ID}/projects`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne chaque projet avec son espace, sa date de création et sa purge éventuelle", async () => {
    const purged = makeListedProject({
      id: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      name: "Application",
      historyPurgedAt: "2026-11-10T08:00:00.000Z",
      tokenCount: 12,
    });
    const { projects } = answering(listing([makeListedProject(), purged]));

    expect(await projects.listProjects({ spaceId: SPACE_ID })).toEqual(
      ok([
        {
          id: makeListedProject().id,
          spaceId: SPACE_ID,
          name: "Site vitrine",
          createdAt: new Date("2026-11-11T18:00:00.000Z"),
          historyPurgedAt: undefined,
        },
        {
          id: purged.id,
          spaceId: SPACE_ID,
          name: "Application",
          createdAt: new Date("2026-11-11T18:00:00.000Z"),
          historyPurgedAt: new Date("2026-11-10T08:00:00.000Z"),
        },
      ]),
    );
  });

  it.each(["../../auth/sign-out", "..", "espace-1", ""])(
    "donne not_found pour l'espace %j, qui n'est pas un UUID, sans appeler l'API",
    async (spaceId) => {
      const { projects, calls } = answering(listing([]));

      expect(await projects.listProjects({ spaceId })).toEqual(err("not_found"));
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
    const { projects } = answering(json({ title: "Refus" }, status));

    expect(await projects.listProjects({ spaceId: SPACE_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const projects = createProjects({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await projects.listProjects({ spaceId: SPACE_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", listing([makeListedProject({ id: "projet-1" })])],
    [
      "une date de purge qui n'est pas ISO",
      listing([makeListedProject({ historyPurgedAt: "hier" })]),
    ],
    ["un corps sans liste", json({}, 200)],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { projects } = answering(response);

    expect(await projects.listProjects({ spaceId: SPACE_ID })).toEqual(err("invalid_response"));
  });
});
