import { describe, expect, it } from "vitest";

import { storedSize } from "./storage.ts";

describe("une ligne stockée compte la taille UTF-8 de son JSON (ADR 0032 §2)", () => {
  it("une ligne ASCII compte un octet par caractère de son JSON", () => {
    expect(storedSize({ name: "bleu" })).toBe('{"name":"bleu"}'.length);
  });

  it("un caractère accentué compte 2 octets", () => {
    expect(storedSize({ name: "é" })).toBe('{"name":""}'.length + 2);
  });

  it("un emoji compte 4 octets", () => {
    expect(storedSize({ name: "🎨" })).toBe('{"name":""}'.length + 4);
  });

  it("une date compte sa forme ISO", () => {
    expect(storedSize({ at: new Date("2026-10-22T10:00:00.000Z") })).toBe(
      '{"at":"2026-10-22T10:00:00.000Z"}'.length,
    );
  });
});
