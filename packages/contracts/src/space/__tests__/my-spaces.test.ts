import { describe, expect, it } from "vitest";
import { z } from "zod";

import { checkOutputSchema, MySpaceOutput, MySpacesOutput } from "../../index.ts";

const makeSpace = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b",
  name: "Ada Lovelace",
  plan: "free",
  role: "owner",
  allowedActions: ["space.read", "project.create"],
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

  it("garde une action ajoutée plus tard par le serveur (ADR 0023 §2)", () => {
    const later = makeSpace({ allowedActions: ["space.read", "space.archive"] });

    expect(MySpacesOutput.parse({ spaces: [later] })).toEqual({ spaces: [later] });
  });

  it("refuse un espace sans ses actions permises", () => {
    const { allowedActions: _omitted, ...withoutActions } = makeSpace();

    expect(MySpacesOutput.safeParse({ spaces: [withoutActions] }).success).toBe(false);
  });

  it("lit un espace seul avec ses actions permises, et le refuse sans elles", () => {
    const { allowedActions: _omitted, ...withoutActions } = makeSpace();

    expect(MySpaceOutput.parse(makeSpace())).toEqual(makeSpace());
    expect(MySpaceOutput.safeParse(withoutActions).success).toBe(false);
  });

  it("refuse un identifiant d'espace qui n'est pas un UUID", () => {
    expect(MySpacesOutput.safeParse({ spaces: [makeSpace({ id: "espace-1" })] }).success).toBe(
      false,
    );
  });

  it("annonce à l'IA les plans, les rôles et les actions connus", () => {
    expect(z.toJSONSchema(MySpacesOutput)).toMatchObject({
      properties: {
        spaces: {
          items: {
            properties: {
              plan: { anyOf: [{ enum: ["free", "team"] }, { type: "string" }] },
              role: { anyOf: [{ enum: ["owner", "editor"] }, { type: "string" }] },
              allowedActions: {
                type: "array",
                items: {
                  anyOf: [
                    {
                      enum: [
                        "space.read",
                        "project.create",
                        "member.invite",
                        "member.leave",
                        "member.manage",
                        "token.create",
                        "token.declareFigmaState",
                        "proposal.review",
                      ],
                    },
                    { type: "string" },
                  ],
                },
              },
            },
          },
        },
      },
    });
  });
});

describe("conventions de sortie de la liste de mes espaces (ADR 0023 §4)", () => {
  it("MySpacesOutput les respecte", () => {
    expect(checkOutputSchema("MySpacesOutput", MySpacesOutput)).toEqual([]);
  });

  it("MySpaceOutput les respecte", () => {
    expect(checkOutputSchema("MySpaceOutput", MySpaceOutput)).toEqual([]);
  });
});
