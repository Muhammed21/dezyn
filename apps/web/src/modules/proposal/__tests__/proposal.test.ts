import { describe, expect, it } from "vitest";

import { err, ok } from "@repo/result";

import { createProposals } from "../proposal-module.ts";

const API_URL = "https://api.dezyn.dev";
const PROJECT_ID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeBatchOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  intent: "Palette de la marque",
  state: "open",
  toReview: 2,
  ...overrides,
});

type Call = { readonly url: string; readonly init: RequestInit };

const answering = (response: () => Response) => {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(response());
  };
  return { proposals: createProposals({ apiUrl: API_URL, fetch }), calls };
};

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });

describe("lecture des lots de propositions d'un projet dans l'app web (ADR 0044 §6)", () => {
  it("demande les lots du projet à l'API avec le cookie du navigateur", async () => {
    const { proposals, calls } = answering(json({ batches: [] }));

    await proposals.listBatches({ projectId: PROJECT_ID });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/projects/${PROJECT_ID}/proposal-batches`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne chaque lot dans l'ordre de l'API, avec son intention, son état et le nombre à relire", async () => {
    const closed = makeBatchOutput({
      id: "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      intent: null,
      state: "closed",
      toReview: 0,
    });
    const { proposals } = answering(json({ batches: [makeBatchOutput(), closed] }));

    expect(await proposals.listBatches({ projectId: PROJECT_ID })).toEqual(
      ok([
        { id: makeBatchOutput().id, intent: "Palette de la marque", state: "open", toReview: 2 },
        { id: closed.id, intent: undefined, state: "closed", toReview: 0 },
      ]),
    );
  });

  it("garde un lot dont l'app ne connaît pas l'état (ADR 0023 §2)", async () => {
    const { proposals } = answering(json({ batches: [makeBatchOutput({ state: "archived" })] }));

    const batches = await proposals.listBatches({ projectId: PROJECT_ID });

    expect(batches.ok && batches.value[0]?.state).toBe("unknown");
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { proposals, calls } = answering(json({ batches: [] }));

    expect(await proposals.listBatches({ projectId: "projet-1" })).toEqual(err("not_found"));
    expect(calls).toEqual([]);
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [503, "unavailable"],
    [429, "unavailable"],
    [400, "invalid_response"],
    [403, "invalid_response"],
  ] as const)("donne, sur une réponse %i, %s", async (status, failure) => {
    const { proposals } = answering(json({}, status));

    expect(await proposals.listBatches({ projectId: PROJECT_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const proposals = createProposals({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await proposals.listBatches({ projectId: PROJECT_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["une réponse sans lots", json({})],
    ["un lot sans nombre à relire", json({ batches: [makeBatchOutput({ toReview: undefined })] })],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { proposals } = answering(response);

    expect(await proposals.listBatches({ projectId: PROJECT_ID })).toEqual(err("invalid_response"));
  });
});
