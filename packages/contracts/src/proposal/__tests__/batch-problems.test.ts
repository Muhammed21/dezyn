import { describe, expect, it } from "vitest";

import { BatchOpenProblem, checkOutputSchema, InvalidBatchProblem } from "../../index.ts";

const makeBatchOpen = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/batch-open",
  title: "Lot ouvert",
  status: 409,
  ...overrides,
});

const makeInvalidBatch = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/invalid-batch",
  title: "Lot invalide",
  status: 409,
  errors: [
    {
      path: "proposals.2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b.$value",
      message: "Référence vers un token non validé",
    },
  ],
  ...overrides,
});

describe("refus « lot ouvert » (ADR 0013 §4)", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023)", () => {
    const later = makeBatchOpen({ instance: "/v1/proposal-batches" });

    expect(BatchOpenProblem.parse(later)).toEqual(later);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["du type d'un lot invalide", { type: "https://dezyn.dev/problems/invalid-batch" }],
    ["d'un autre statut", { status: 400 }],
    ["sans titre", { title: undefined }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(BatchOpenProblem.safeParse(makeBatchOpen(overrides)).success).toBe(false);
  });
});

describe("refus « lot invalide » (ADR 0012 §4)", () => {
  it("lit chaque erreur avec son chemin et son message", () => {
    const problem = makeInvalidBatch();

    expect(InvalidBatchProblem.parse(problem)).toEqual(problem);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["du type d'un lot ouvert", { type: "https://dezyn.dev/problems/batch-open" }],
    ["d'un autre statut", { status: 400 }],
    ["sans erreurs", { errors: undefined }],
    [
      "avec une erreur sans chemin",
      { errors: [{ message: "Référence vers un token non validé" }] },
    ],
    ["avec une erreur sans message", { errors: [{ path: "proposals.x.$value" }] }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(InvalidBatchProblem.safeParse(makeInvalidBatch(overrides)).success).toBe(false);
  });
});

describe("conventions de sortie des refus de la validation d'un lot (ADR 0023 §4)", () => {
  it.each([
    ["BatchOpenProblem", BatchOpenProblem],
    ["InvalidBatchProblem", InvalidBatchProblem],
  ])("%s les respecte", (name, schema) => {
    expect(checkOutputSchema(name, schema)).toEqual([]);
  });
});
