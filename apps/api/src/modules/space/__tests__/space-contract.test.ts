import { describe, expect, it } from "vitest";

import {
  ACTIONS as CONTRACT_ACTIONS,
  PLANS as CONTRACT_PLANS,
  ROLES as CONTRACT_ROLES,
} from "@repo/contracts";

import { ACTIONS } from "../domain/can.ts";
import { PLANS, ROLES } from "../domain/space.ts";

describe("le contrat partagé des espaces suit le domaine (ADR 0044 §4)", () => {
  it("annonce les mêmes plans que le domaine", () => {
    expect(CONTRACT_PLANS).toEqual(PLANS);
  });

  it("annonce les mêmes rôles que le domaine", () => {
    expect(CONTRACT_ROLES).toEqual(ROLES);
  });

  it("annonce les mêmes actions que le domaine, dans le même ordre", () => {
    expect(CONTRACT_ACTIONS).toEqual(ACTIONS);
  });
});
