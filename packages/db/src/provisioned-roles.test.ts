import { describe, expect, it } from "vitest";

import { assertRolesProvisioned } from "./provisioned-roles.ts";

const listing = (roles: readonly string[]) => () => Promise.resolve(roles);

describe("assertRolesProvisioned", () => {
  it("passe quand migrator et app existent", async () => {
    await expect(
      assertRolesProvisioned({ listRoles: listing(["postgres", "migrator", "app"]) }),
    ).resolves.toBeUndefined();
  });

  it("échoue en nommant le rôle app quand il manque", async () => {
    await expect(
      assertRolesProvisioned({ listRoles: listing(["postgres", "migrator"]) }),
    ).rejects.toThrow("Rôles PostgreSQL manquants, à provisionner avant migration : app");
  });

  it("nomme tous les rôles manquants", async () => {
    await expect(assertRolesProvisioned({ listRoles: listing(["postgres"]) })).rejects.toThrow(
      "Rôles PostgreSQL manquants, à provisionner avant migration : migrator, app",
    );
  });
});
