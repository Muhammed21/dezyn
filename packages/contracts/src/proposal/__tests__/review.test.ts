import { describe, expect, it } from "vitest";

import {
  BATCH_STATES,
  checkOutputSchema,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  ProposalBatchesOutput,
  ProposalBatchOutput,
  ReviewedProposalOutput,
  ValidatedBatchOutput,
} from "../../index.ts";

const BATCH_ID = "0b8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PROJECT_ID = "1c8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const PROPOSAL_ID = "2d8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";
const OTHER_PROPOSAL_ID = "3e8f3c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b";

const PRIMARY_BLUE = { colorSpace: "srgb", components: [0.1, 0.4, 0.9] };
const NIGHT_BLUE = { colorSpace: "srgb", components: [0.1, 0.2, 0.4] };

const makeBatchSummary = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: BATCH_ID,
  intent: "Palette de la marque",
  state: "open",
  toReview: 2,
  ...overrides,
});

const makeProposal = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: PROPOSAL_ID,
  name: "couleur.fond.primaire",
  kind: "create",
  status: "proposed",
  validated: null,
  proposed: { $type: "color", $value: PRIMARY_BLUE, $description: "Fond des boutons" },
  ...overrides,
});

const makeBatch = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: BATCH_ID,
  projectId: PROJECT_ID,
  intent: null,
  state: "closed",
  proposals: [makeProposal()],
  ...overrides,
});

const makeReviewed = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: PROPOSAL_ID,
  name: "couleur.fond.primaire",
  kind: "create",
  status: "validated",
  ...overrides,
});

const makeValidatedBatch = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: BATCH_ID,
  state: "closed",
  validated: [PROPOSAL_ID],
  rejected: [OTHER_PROPOSAL_ID],
  ...overrides,
});

describe("les valeurs connues de la relecture", () => {
  it("annonce les états de lot, les natures et les statuts de proposition", () => {
    expect(BATCH_STATES).toEqual(["open", "closed"]);
    expect(PROPOSAL_KINDS).toEqual(["create", "update"]);
    expect(PROPOSAL_STATUSES).toEqual(["proposed", "validated", "rejected", "replaced"]);
  });
});

describe("la liste des lots d'un projet (ADR 0013 §4)", () => {
  it("décode l'intention, l'état et le nombre de propositions à relire de chaque lot", () => {
    const list = { batches: [makeBatchSummary(), makeBatchSummary({ intent: null, toReview: 0 })] };

    expect(ProposalBatchesOutput.parse(list)).toEqual(list);
  });

  it("accepte un état de lot ajouté plus tard par le serveur", () => {
    expect(
      ProposalBatchesOutput.safeParse({ batches: [makeBatchSummary({ state: "archived" })] })
        .success,
    ).toBe(true);
  });

  it.each([
    ["un identifiant qui n'est pas un UUID", { id: "lot-1" }],
    ["un nombre à relire négatif", { toReview: -1 }],
    ["un nombre à relire non entier", { toReview: 1.5 }],
    ["un lot sans intention", { intent: undefined }],
  ])("refuse %s", (_case, change) => {
    expect(ProposalBatchesOutput.safeParse({ batches: [makeBatchSummary(change)] }).success).toBe(
      false,
    );
  });
});

describe("un lot et ses propositions (ADR 0012 §1)", () => {
  it("décode une création, sans valeur validée", () => {
    const batch = makeBatch();

    expect(ProposalBatchOutput.parse(batch)).toEqual(batch);
  });

  it("décode une modification, avec sa valeur validée et sa valeur proposée", () => {
    const batch = makeBatch({
      proposals: [
        makeProposal({
          kind: "update",
          status: "replaced",
          validated: { $type: "color", $value: PRIMARY_BLUE, modes: { sombre: NIGHT_BLUE } },
          proposed: { $type: "color", $value: NIGHT_BLUE, $extensions: { "dev.dezyn": {} } },
        }),
      ],
    });

    expect(ProposalBatchOutput.parse(batch)).toEqual(batch);
  });

  it("accepte une nature, un statut et un type de token ajoutés plus tard par le serveur", () => {
    expect(
      ProposalBatchOutput.safeParse(
        makeBatch({
          state: "archived",
          proposals: [
            makeProposal({
              kind: "delete",
              status: "withdrawn",
              proposed: { $type: "duration", $value: "200ms" },
            }),
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    ["un lot dont l'identifiant n'est pas un UUID", makeBatch({ id: "lot-1" })],
    ["un projet dont l'identifiant n'est pas un UUID", makeBatch({ projectId: "projet-1" })],
    [
      "une proposition dont l'identifiant n'est pas un UUID",
      makeBatch({ proposals: [makeProposal({ id: "proposition-1" })] }),
    ],
    [
      "une proposition sans valeur validée",
      makeBatch({ proposals: [makeProposal({ validated: undefined })] }),
    ],
    [
      "une valeur proposée sans type",
      makeBatch({ proposals: [makeProposal({ proposed: { $value: PRIMARY_BLUE } })] }),
    ],
  ])("refuse %s", (_case, batch) => {
    expect(ProposalBatchOutput.safeParse(batch).success).toBe(false);
  });
});

describe("une proposition relue (ADR 0012 §1)", () => {
  it("décode la proposition et son nouveau statut", () => {
    const reviewed = makeReviewed({ kind: "update", status: "rejected" });

    expect(ReviewedProposalOutput.parse(reviewed)).toEqual(reviewed);
  });

  it("accepte un statut ajouté plus tard par le serveur", () => {
    expect(ReviewedProposalOutput.safeParse(makeReviewed({ status: "archived" })).success).toBe(
      true,
    );
  });

  it("refuse un identifiant qui n'est pas un UUID", () => {
    expect(ReviewedProposalOutput.safeParse(makeReviewed({ id: "proposition-1" })).success).toBe(
      false,
    );
  });
});

describe("un lot validé en entier (ADR 0013 §4)", () => {
  it("décode les propositions validées et rejetées", () => {
    const validated = makeValidatedBatch();

    expect(ValidatedBatchOutput.parse(validated)).toEqual(validated);
  });

  it.each([
    ["un lot dont l'identifiant n'est pas un UUID", { id: "lot-1" }],
    ["une proposition validée qui n'est pas un UUID", { validated: ["proposition-1"] }],
    ["une proposition rejetée qui n'est pas un UUID", { rejected: ["proposition-2"] }],
  ])("refuse %s", (_case, change) => {
    expect(ValidatedBatchOutput.safeParse(makeValidatedBatch(change)).success).toBe(false);
  });
});

describe("conventions de sortie de la relecture (ADR 0023 §4)", () => {
  it.each([
    ["ProposalBatchesOutput", ProposalBatchesOutput],
    ["ProposalBatchOutput", ProposalBatchOutput],
    ["ReviewedProposalOutput", ReviewedProposalOutput],
    ["ValidatedBatchOutput", ValidatedBatchOutput],
  ])("%s les respecte", (name, schema) => {
    expect(checkOutputSchema(name, schema)).toEqual([]);
  });
});
