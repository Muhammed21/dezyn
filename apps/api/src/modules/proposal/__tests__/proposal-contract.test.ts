import { describe, expect, it } from "vitest";

import {
  BATCH_STATES as CONTRACT_BATCH_STATES,
  PROPOSAL_KINDS as CONTRACT_PROPOSAL_KINDS,
  PROPOSAL_STATUSES as CONTRACT_PROPOSAL_STATUSES,
} from "@repo/contracts";

import { BATCH_STATES, PROPOSAL_KINDS, PROPOSAL_STATUSES } from "../domain/proposal.ts";

describe("le contrat partagé de la relecture suit le domaine (ADR 0044 §4)", () => {
  it("annonce les mêmes états de lot que le domaine", () => {
    expect(CONTRACT_BATCH_STATES).toEqual(BATCH_STATES);
  });

  it("annonce les mêmes natures de proposition que le domaine", () => {
    expect(CONTRACT_PROPOSAL_KINDS).toEqual(PROPOSAL_KINDS);
  });

  it("annonce les mêmes statuts de proposition que le domaine", () => {
    expect(CONTRACT_PROPOSAL_STATUSES).toEqual(PROPOSAL_STATUSES);
  });
});
