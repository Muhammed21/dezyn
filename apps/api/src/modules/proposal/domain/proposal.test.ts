import { describe, expect, it } from "vitest";

import { type ProposalStatus, review } from "./proposal.ts";

describe("seule une proposition Proposée se relit (ADR 0013 §9)", () => {
  it("valider une proposition Proposée la rend Validée", () => {
    expect(review({ status: "proposed", decision: "validate" })).toEqual({ status: "validated" });
  });

  it("rejeter une proposition Proposée la rend Rejetée", () => {
    expect(review({ status: "proposed", decision: "reject" })).toEqual({ status: "rejected" });
  });

  const reviewed: readonly ProposalStatus[] = ["validated", "rejected", "replaced"];

  it.each(reviewed)("une proposition %s ne se valide plus", (status) => {
    expect(review({ status, decision: "validate" })).toEqual({ refusal: "already_reviewed" });
  });

  it.each(reviewed)("une proposition %s ne se rejette plus", (status) => {
    expect(review({ status, decision: "reject" })).toEqual({ refusal: "already_reviewed" });
  });
});
