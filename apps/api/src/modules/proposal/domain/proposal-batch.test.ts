import { describe, expect, it } from "vitest";

import { closedBatch, declareBatch, batchStateAt } from "./proposal-batch.ts";
import type { ProposalBatch } from "./proposal.ts";

const makeBatch = (batch: Partial<ProposalBatch> = {}): ProposalBatch => ({
  id: "c0a80101-0000-4000-8000-000000000001",
  projectId: "c0a80101-0000-4000-8000-0000000000aa",
  userId: "c0a80101-0000-4000-8000-0000000000bb",
  clientId: "claude-code",
  intent: null,
  state: "open",
  openedAt: new Date("2026-10-19T09:00:00Z"),
  lastWrittenAt: new Date("2026-10-19T09:00:00Z"),
  ...batch,
});

describe("l'IA ouvre et ferme un lot avec son intention (ADR 0013 §1)", () => {
  it("ouvrir un lot sans lot ouvert ne ferme rien", () => {
    const declared = makeBatch({ intent: "Import du Figma Healthcare" });

    expect(declareBatch({ current: undefined, declared })).toEqual({
      batch: declared,
      closed: null,
    });
  });

  it("ouvrir un lot alors qu'un lot est ouvert ferme le précédent", () => {
    const current = makeBatch({ id: "c0a80101-0000-4000-8000-000000000002" });
    const declared = makeBatch({ intent: "Import du Figma Healthcare" });

    expect(declareBatch({ current, declared })).toEqual({
      batch: declared,
      closed: { ...current, state: "closed" },
    });
  });

  it("fermer un lot ouvert le rend fermé, sans toucher à son intention", () => {
    const batch = makeBatch({ intent: "Import du Figma Healthcare" });

    expect(closedBatch(batch)).toEqual({ ...batch, state: "closed" });
  });
});

describe("tout lot se ferme après 30 minutes sans écriture (ADR 0013 §7)", () => {
  const lastWrittenAt = new Date("2026-10-19T09:10:00Z");

  it("à 30 minutes moins un instant après la dernière écriture, le lot est ouvert", () => {
    expect(
      batchStateAt({
        batch: makeBatch({ lastWrittenAt }),
        now: new Date("2026-10-19T09:39:59.999Z"),
      }),
    ).toBe("open");
  });

  it("à 30 minutes après la dernière écriture, le lot est fermé", () => {
    expect(
      batchStateAt({ batch: makeBatch({ lastWrittenAt }), now: new Date("2026-10-19T09:40:00Z") }),
    ).toBe("closed");
  });

  it("le délai court depuis la dernière écriture, pas depuis l'ouverture", () => {
    const batch = makeBatch({ openedAt: new Date("2026-10-19T08:00:00Z"), lastWrittenAt });

    expect(batchStateAt({ batch, now: new Date("2026-10-19T09:20:00Z") })).toBe("open");
  });

  it("un lot fermé reste fermé, même juste après sa dernière écriture", () => {
    expect(
      batchStateAt({ batch: makeBatch({ lastWrittenAt, state: "closed" }), now: lastWrittenAt }),
    ).toBe("closed");
  });
});
