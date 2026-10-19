import { describe, expect, it } from "vitest";

import { closeLot, declareLot } from "./proposition-lot.ts";
import type { PropositionLot } from "./proposition.ts";

const makeLot = (lot: Partial<PropositionLot> = {}): PropositionLot => ({
  id: "c0a80101-0000-4000-8000-000000000001",
  projectId: "c0a80101-0000-4000-8000-0000000000aa",
  userId: "c0a80101-0000-4000-8000-0000000000bb",
  clientId: "claude-code",
  intention: null,
  state: "open",
  openedAt: new Date("2026-10-19T09:00:00Z"),
  ...lot,
});

describe("l'IA ouvre et ferme un lot avec son intention (ADR 0013 §1)", () => {
  it("ouvrir un lot sans lot ouvert ne ferme rien", () => {
    const declared = makeLot({ intention: "Import du Figma Healthcare" });

    expect(declareLot({ current: undefined, declared })).toEqual({ lot: declared, closed: null });
  });

  it("ouvrir un lot alors qu'un lot est ouvert ferme le précédent", () => {
    const current = makeLot({ id: "c0a80101-0000-4000-8000-000000000002" });
    const declared = makeLot({ intention: "Import du Figma Healthcare" });

    expect(declareLot({ current, declared })).toEqual({
      lot: declared,
      closed: { ...current, state: "closed" },
    });
  });

  it("fermer un lot ouvert le rend fermé, sans toucher à son intention", () => {
    const lot = makeLot({ intention: "Import du Figma Healthcare" });

    expect(closeLot(lot)).toEqual({ ...lot, state: "closed" });
  });
});
