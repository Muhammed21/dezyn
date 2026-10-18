import { describe, expect, it } from "vitest";

import { generateIdentityId } from "./better-auth.ts";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("generateIdentityId", () => {
  it("génère un UUID v4, différent à chaque appel", () => {
    const first = generateIdentityId();
    const second = generateIdentityId();

    expect(first).toMatch(UUID_V4);
    expect(second).toMatch(UUID_V4);
    expect(first).not.toBe(second);
  });
});
