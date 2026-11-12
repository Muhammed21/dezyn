import { describe, expect, it } from "vitest";

import { AlreadyReviewedProblem, checkOutputSchema, InvalidProposalProblem } from "../../index.ts";

const makeAlreadyReviewed = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/already-reviewed",
  title: "Proposition déjà relue",
  status: 409,
  ...overrides,
});

const makeInvalidProposal = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  type: "https://dezyn.dev/problems/invalid-proposal",
  title: "Proposition invalide",
  status: 409,
  errors: [{ path: "name", message: "Nom déjà pris dans le projet" }],
  ...overrides,
});

describe("refus « proposition déjà relue » (ADR 0013 §9)", () => {
  it("garde une clé ajoutée plus tard par le serveur (ADR 0023)", () => {
    const later = makeAlreadyReviewed({ instance: "/v1/proposals" });

    expect(AlreadyReviewedProblem.parse(later)).toEqual(later);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    ["du type d'une proposition invalide", { type: "https://dezyn.dev/problems/invalid-proposal" }],
    ["d'un autre statut", { status: 400 }],
    ["sans titre", { title: undefined }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(AlreadyReviewedProblem.safeParse(makeAlreadyReviewed(overrides)).success).toBe(false);
  });
});

describe("refus « proposition invalide » (ADR 0012 §1)", () => {
  it("lit chaque erreur avec son chemin et son message", () => {
    const problem = makeInvalidProposal({
      errors: [
        { path: "name", message: "Nom déjà pris dans le projet" },
        { path: "$value", message: "Référence vers un token non validé" },
      ],
    });

    expect(InvalidProposalProblem.parse(problem)).toEqual(problem);
  });

  it.each([
    ["d'un autre type", { type: "about:blank" }],
    [
      "du type d'une proposition déjà relue",
      { type: "https://dezyn.dev/problems/already-reviewed" },
    ],
    ["d'un autre statut", { status: 400 }],
    ["sans erreurs", { errors: undefined }],
    ["avec une erreur sans chemin", { errors: [{ message: "Nom déjà pris dans le projet" }] }],
    ["avec une erreur sans message", { errors: [{ path: "name" }] }],
  ])("refuse un problème %s", (_case, overrides) => {
    expect(InvalidProposalProblem.safeParse(makeInvalidProposal(overrides)).success).toBe(false);
  });
});

describe("conventions de sortie des refus de la relecture (ADR 0023 §4)", () => {
  it.each([
    ["AlreadyReviewedProblem", AlreadyReviewedProblem],
    ["InvalidProposalProblem", InvalidProposalProblem],
  ])("%s les respecte", (name, schema) => {
    expect(checkOutputSchema(name, schema)).toEqual([]);
  });
});
