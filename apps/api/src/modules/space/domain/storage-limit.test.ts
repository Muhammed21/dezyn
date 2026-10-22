import { describe, expect, it } from "vitest";

import { storageAlertReached } from "./storage-limit.ts";

describe("un espace est alerté à 80 % de sa limite de stockage (ADR 0006 §4, ADR 0032 §4)", () => {
  it("un espace Free à 400 000 000 octets, 80 % de 500 Mo, est alerté", () => {
    expect(storageAlertReached({ plan: "free", storedBytes: 400_000_000 })).toBe(true);
  });

  it("un espace Free à un octet sous 80 % n'est pas alerté", () => {
    expect(storageAlertReached({ plan: "free", storedBytes: 399_999_999 })).toBe(false);
  });

  it("un espace Free au-delà de sa limite est alerté", () => {
    expect(storageAlertReached({ plan: "free", storedBytes: 600_000_000 })).toBe(true);
  });

  it("un espace Team à 16 000 000 000 octets, 80 % de 20 Go, est alerté", () => {
    expect(storageAlertReached({ plan: "team", storedBytes: 16_000_000_000 })).toBe(true);
  });

  it("un espace Team à un octet sous 80 % n'est pas alerté, même au-delà de la limite Free", () => {
    expect(storageAlertReached({ plan: "team", storedBytes: 15_999_999_999 })).toBe(false);
  });
});
