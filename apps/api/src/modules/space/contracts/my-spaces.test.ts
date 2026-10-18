import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MySpacesOutput } from "./my-spaces.ts";

const makeSpace = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Ada Lovelace",
  plan: "free",
  role: "owner",
  ...overrides,
});

describe("sortie de la liste de mes espaces", () => {
  it("garde un plan et un rôle ajoutés plus tard par le serveur (ADR 0023 §2)", () => {
    const later = makeSpace({ plan: "enterprise", role: "viewer" });

    expect(MySpacesOutput.parse({ spaces: [later] })).toEqual({ spaces: [later] });
  });

  it("garde une clé ajoutée plus tard par le serveur (ADR 0023 §1)", () => {
    const later = { spaces: [makeSpace({ projectCount: 3 })], nextCursor: null };

    expect(MySpacesOutput.parse(later)).toEqual(later);
  });

  it("refuse un identifiant d'espace qui n'est pas un UUID", () => {
    expect(MySpacesOutput.safeParse({ spaces: [makeSpace({ id: "espace-1" })] }).success).toBe(
      false,
    );
  });

  it("annonce à l'IA les plans et les rôles connus", () => {
    expect(z.toJSONSchema(MySpacesOutput)).toMatchObject({
      properties: {
        spaces: {
          items: {
            properties: {
              plan: { anyOf: [{ enum: ["free", "team"] }, { type: "string" }] },
              role: { anyOf: [{ enum: ["owner", "editor"] }, { type: "string" }] },
            },
          },
        },
      },
    });
  });
});
