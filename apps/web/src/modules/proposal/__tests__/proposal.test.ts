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

const BATCH_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.1, 0.4, 0.9] };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const makeProposalOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "couleur.fond.primaire",
  kind: "create",
  status: "proposed",
  validated: null,
  proposed: { $type: "color", $value: PRIMARY_BLUE },
  ...overrides,
});

const makeLotOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: BATCH_ID,
  projectId: PROJECT_ID,
  intent: "Palette de la marque",
  state: "closed",
  proposals: [makeProposalOutput()],
  ...overrides,
});

const firstProposalOf = async (proposals: ReturnType<typeof answering>["proposals"]) => {
  const batch = await proposals.readBatch({ batchId: BATCH_ID });
  return batch.ok ? batch.value.proposals[0] : undefined;
};

describe("lecture d'un lot de propositions dans l'app web (ADR 0044 §6)", () => {
  it("demande le lot à l'API avec le cookie du navigateur", async () => {
    const { proposals, calls } = answering(json(makeLotOutput()));

    await proposals.readBatch({ batchId: BATCH_ID });

    expect(calls).toEqual([
      {
        url: `${API_URL}/v1/proposal-batches/${BATCH_ID}`,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("donne le lot et ses propositions dans l'ordre de l'API, avec leurs valeurs", async () => {
    const update = makeProposalOutput({
      id: "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
      name: "couleur.bleu.500",
      kind: "update",
      status: "validated",
      validated: { $type: "color", $value: PRIMARY_BLUE },
      proposed: { $type: "color", $value: NIGHT_BLUE, $description: "Bleu nuit" },
    });
    const { proposals } = answering(
      json(makeLotOutput({ proposals: [makeProposalOutput(), update] })),
    );

    expect(await proposals.readBatch({ batchId: BATCH_ID })).toEqual(
      ok({
        id: BATCH_ID,
        projectId: PROJECT_ID,
        intent: "Palette de la marque",
        state: "closed",
        proposals: [
          {
            id: makeProposalOutput().id,
            name: "couleur.fond.primaire",
            kind: "create",
            status: "proposed",
            validated: undefined,
            proposed: { $type: "color", $value: PRIMARY_BLUE },
          },
          {
            id: update.id,
            name: "couleur.bleu.500",
            kind: "update",
            status: "validated",
            validated: { $type: "color", $value: PRIMARY_BLUE },
            proposed: { $type: "color", $value: NIGHT_BLUE, $description: "Bleu nuit" },
          },
        ],
      }),
    );
  });

  it("donne un lot sans intention", async () => {
    const { proposals } = answering(json(makeLotOutput({ intent: null, state: "open" })));

    const batch = await proposals.readBatch({ batchId: BATCH_ID });

    expect(batch.ok && [batch.value.intent, batch.value.state]).toEqual([undefined, "open"]);
  });

  it.each(["rejected", "replaced"])("garde le statut %s", async (status) => {
    const { proposals } = answering(
      json(makeLotOutput({ proposals: [makeProposalOutput({ status })] })),
    );

    expect((await firstProposalOf(proposals))?.status).toBe(status);
  });

  it("garde un état, une nature et un statut que l'app ne connaît pas (ADR 0023 §2)", async () => {
    const { proposals } = answering(
      json(
        makeLotOutput({
          state: "archived",
          proposals: [makeProposalOutput({ kind: "delete", status: "withdrawn" })],
        }),
      ),
    );

    const batch = await proposals.readBatch({ batchId: BATCH_ID });

    expect(batch.ok && batch.value.state).toBe("unknown");
    expect(batch.ok && batch.value.proposals[0]).toMatchObject({
      kind: "unknown",
      status: "unknown",
    });
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { proposals, calls } = answering(json(makeLotOutput()));

    expect(await proposals.readBatch({ batchId: "lot-1" })).toEqual(err("not_found"));
    expect(calls).toEqual([]);
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [429, "unavailable"],
    [400, "invalid_response"],
  ] as const)("donne, sur une réponse %i, %s", async (status, failure) => {
    const { proposals } = answering(json({}, status));

    expect(await proposals.readBatch({ batchId: BATCH_ID })).toEqual(err(failure));
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const proposals = createProposals({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(await proposals.readBatch({ batchId: BATCH_ID })).toEqual(err("unavailable"));
  });

  it.each([
    ["un lot sans propositions", json(makeLotOutput({ proposals: undefined }))],
    [
      "une proposition sans valeur proposée",
      json(makeLotOutput({ proposals: [makeProposalOutput({ proposed: undefined })] })),
    ],
    ["un corps qui n'est pas du JSON", () => new Response("<html>", { status: 200 })],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { proposals } = answering(response);

    expect(await proposals.readBatch({ batchId: BATCH_ID })).toEqual(err("invalid_response"));
  });
});

const PROPOSAL_ID = "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const makeReviewedOutput = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: PROPOSAL_ID,
  name: "couleur.fond.primaire",
  kind: "create",
  status: "validated",
  ...overrides,
});

const problem = (body: Readonly<Record<string, unknown>>, status = 409) =>
  json({ title: "Refus", status, ...body }, status);

describe("relecture d'une proposition dans l'app web (ADR 0012 §1, ADR 0044 §6)", () => {
  it.each(["validate", "reject"] as const)(
    "envoie la décision %s à l'API avec le cookie du navigateur",
    async (decision) => {
      const { proposals, calls } = answering(json(makeReviewedOutput()));

      await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision });

      expect(calls).toEqual([
        {
          url: `${API_URL}/v1/proposals/${PROPOSAL_ID}/${decision}`,
          init: { method: "POST", credentials: "include" },
        },
      ]);
    },
  );

  it("donne la proposition relue avec son nouveau statut", async () => {
    const { proposals } = answering(
      json(makeReviewedOutput({ kind: "update", status: "rejected" })),
    );

    expect(await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "reject" })).toEqual(
      ok({ id: PROPOSAL_ID, name: "couleur.fond.primaire", kind: "update", status: "rejected" }),
    );
  });

  it("garde une nature et un statut que l'app ne connaît pas (ADR 0023 §2)", async () => {
    const { proposals } = answering(
      json(makeReviewedOutput({ kind: "delete", status: "archived" })),
    );

    const reviewed = await proposals.reviewProposal({
      proposalId: PROPOSAL_ID,
      decision: "validate",
    });

    expect(reviewed.ok && [reviewed.value.kind, reviewed.value.status]).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  it("donne not_found pour un identifiant qui n'est pas un UUID, sans appeler l'API", async () => {
    const { proposals, calls } = answering(json(makeReviewedOutput()));

    expect(
      await proposals.reviewProposal({ proposalId: "proposition-1", decision: "validate" }),
    ).toEqual(err("not_found"));
    expect(calls).toEqual([]);
  });

  it("donne already_reviewed pour une proposition déjà relue", async () => {
    const { proposals } = answering(
      problem({ type: "https://dezyn.dev/problems/already-reviewed" }),
    );

    expect(
      await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "validate" }),
    ).toEqual(err("already_reviewed"));
  });

  it("donne invalid_proposal avec chaque erreur de la proposition", async () => {
    const errors = [
      { path: "name", message: "Nom déjà pris dans le projet" },
      { path: "$value", message: "Référence vers un token non validé" },
    ];
    const { proposals } = answering(
      problem({ type: "https://dezyn.dev/problems/invalid-proposal", errors }),
    );

    expect(
      await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "validate" }),
    ).toEqual(err({ reason: "invalid_proposal", errors }));
  });

  it.each([
    ["un 409 d'un autre type", problem({ type: "about:blank" })],
    [
      "une proposition invalide sans erreurs",
      problem({ type: "https://dezyn.dev/problems/invalid-proposal" }),
    ],
    ["un 409 qui n'est pas du JSON", () => new Response("<html>", { status: 409 })],
    ["un refus d'origine", problem({ type: "about:blank" }, 403)],
    ["une proposition relue sans statut", json(makeReviewedOutput({ status: undefined }))],
  ])("donne invalid_response sur %s", async (_case, response) => {
    const { proposals } = answering(response);

    expect(
      await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "validate" }),
    ).toEqual(err("invalid_response"));
  });

  it.each([
    [401, "unauthenticated"],
    [404, "not_found"],
    [500, "unavailable"],
    [429, "unavailable"],
  ] as const)("donne, sur une réponse %i, %s", async (status, failure) => {
    const { proposals } = answering(json({}, status));

    expect(await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "reject" })).toEqual(
      err(failure),
    );
  });

  it("donne unavailable quand l'API est injoignable", async () => {
    const proposals = createProposals({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
    });

    expect(
      await proposals.reviewProposal({ proposalId: PROPOSAL_ID, decision: "validate" }),
    ).toEqual(err("unavailable"));
  });
});
