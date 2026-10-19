import { describe, expect, it } from "vitest";

import { closeLot, declareLot, lotStateAt } from "./proposition-lot.ts";
import type { PropositionLot } from "./proposition.ts";

const makeLot = (lot: Partial<PropositionLot> = {}): PropositionLot => ({
  id: "c0a80101-0000-4000-8000-000000000001",
  projectId: "c0a80101-0000-4000-8000-0000000000aa",
  userId: "c0a80101-0000-4000-8000-0000000000bb",
  clientId: "claude-code",
  intention: null,
  state: "open",
  openedAt: new Date("2026-10-19T09:00:00Z"),
  lastWrittenAt: new Date("2026-10-19T09:00:00Z"),
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

describe("tout lot se ferme après 30 minutes sans écriture (ADR 0013 §7)", () => {
  const lastWrittenAt = new Date("2026-10-19T09:10:00Z");

  it("à 30 minutes moins un instant après la dernière écriture, le lot est ouvert", () => {
    expect(
      lotStateAt({ lot: makeLot({ lastWrittenAt }), now: new Date("2026-10-19T09:39:59.999Z") }),
    ).toBe("open");
  });

  it("à 30 minutes après la dernière écriture, le lot est fermé", () => {
    expect(
      lotStateAt({ lot: makeLot({ lastWrittenAt }), now: new Date("2026-10-19T09:40:00Z") }),
    ).toBe("closed");
  });

  it("le délai court depuis la dernière écriture, pas depuis l'ouverture", () => {
    const lot = makeLot({ openedAt: new Date("2026-10-19T08:00:00Z"), lastWrittenAt });

    expect(lotStateAt({ lot, now: new Date("2026-10-19T09:20:00Z") })).toBe("open");
  });

  it("un lot fermé reste fermé, même juste après sa dernière écriture", () => {
    expect(
      lotStateAt({ lot: makeLot({ lastWrittenAt, state: "closed" }), now: lastWrittenAt }),
    ).toBe("closed");
  });
});
