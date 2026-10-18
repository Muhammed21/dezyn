import { describe, expect, it } from "vitest";

import { refreshGrantOutcome, type StoredRefreshToken } from "./refresh-grant.ts";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const DAY_MS = 86_400_000;

const secondsFromNow = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const daysBefore = (days: number, milliseconds = 0) =>
  new Date(NOW.getTime() - days * DAY_MS - milliseconds);

const makeToken = (overrides: Partial<StoredRefreshToken> = {}): StoredRefreshToken => ({
  revoked: null,
  rotationReplayExpiresAt: null,
  authTime: daysBefore(1),
  sessionId: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  ...overrides,
});

const CONSUMED_BY_ROTATION = { revoked: secondsFromNow(-10) };

const outcomeOf = (
  overrides: Partial<StoredRefreshToken>,
  { consented = true }: { readonly consented?: boolean } = {},
) => refreshGrantOutcome({ token: makeToken(overrides), consented, now: NOW });

const WITHDRAWN = { consented: false };

describe("rejeu d'un refresh token (ADR 0018 §3)", () => {
  it("laisse passer un jeton encore actif", () => {
    expect(outcomeOf({})).toBe("allowed");
  });

  it("laisse passer un rejeu pendant la fenêtre de tolérance", () => {
    expect(
      outcomeOf({ ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: secondsFromNow(20) }),
    ).toBe("allowed");
  });

  it("laisse passer un rejeu au dernier instant de la fenêtre", () => {
    expect(outcomeOf({ ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: NOW })).toBe("allowed");
  });

  it("voit un rejeu dans un jeton consommé rejoué après la fenêtre", () => {
    expect(
      outcomeOf({ ...CONSUMED_BY_ROTATION, rotationReplayExpiresAt: secondsFromNow(-0.001) }),
    ).toBe("reuse");
  });

  it("voit un rejeu dans un jeton révoqué sans rotation", () => {
    expect(outcomeOf({ revoked: secondsFromNow(-10), rotationReplayExpiresAt: null })).toBe(
      "reuse",
    );
  });

  it("voit le rejeu avant tout autre refus", () => {
    expect(outcomeOf({ ...CONSUMED_BY_ROTATION, sessionId: null, authTime: daysBefore(200) })).toBe(
      "reuse",
    );
  });
});

describe("durée de vie absolue de 180 jours depuis l'authentification (ADR 0018 §4)", () => {
  it("laisse rafraîchir une connexion de moins de 180 jours", () => {
    expect(outcomeOf({ authTime: daysBefore(179) })).toBe("allowed");
  });

  it("laisse rafraîchir une connexion d'exactement 180 jours", () => {
    expect(outcomeOf({ authTime: daysBefore(180) })).toBe("allowed");
  });

  it("refuse une connexion de plus de 180 jours", () => {
    expect(outcomeOf({ authTime: daysBefore(180, 1) })).toBe("expired");
  });

  it("refuse une connexion dont l'heure d'authentification est inconnue", () => {
    expect(outcomeOf({ authTime: null })).toBe("expired");
  });
});

describe("refresh token sans session", () => {
  it("refuse un jeton dont la session a été fermée", () => {
    expect(outcomeOf({ sessionId: null })).toBe("orphaned");
  });

  it("refuse la session fermée avant de regarder la durée de vie", () => {
    expect(outcomeOf({ sessionId: null, authTime: daysBefore(200) })).toBe("orphaned");
  });
});

describe("refresh d'une IA dont l'utilisateur a retiré l'accès", () => {
  it("refuse le refresh", () => {
    expect(outcomeOf({}, WITHDRAWN)).toBe("withdrawn");
  });

  it("voit le rejeu avant le retrait", () => {
    expect(outcomeOf(CONSUMED_BY_ROTATION, WITHDRAWN)).toBe("reuse");
  });

  it("refuse le retrait avant de regarder la durée de vie", () => {
    expect(outcomeOf({ authTime: daysBefore(200) }, WITHDRAWN)).toBe("withdrawn");
  });
});
