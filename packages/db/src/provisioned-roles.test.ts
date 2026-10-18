import { describe, expect, it } from "vitest";

import { assertRolesProvisioned } from "./provisioned-roles.ts";

const listing = (roles: readonly string[]) => () => Promise.resolve(roles);

describe("assertRolesProvisioned", () => {
  it("passe quand migrator, app et history_maintainer existent", async () => {
    await expect(
      assertRolesProvisioned({
        listRoles: listing(["postgres", "migrator", "app", "history_maintainer"]),
      }),
    ).resolves.toBeUndefined();
  });

  it("échoue en nommant le rôle app quand il manque", async () => {
    await expect(
      assertRolesProvisioned({
        listRoles: listing(["postgres", "migrator", "history_maintainer"]),
      }),
    ).rejects.toThrow("Rôles PostgreSQL manquants, à provisionner avant migration : app");
  });

  it("échoue en nommant history_maintainer quand il manque (ADR 0019 §2)", async () => {
    await expect(
      assertRolesProvisioned({ listRoles: listing(["postgres", "migrator", "app"]) }),
    ).rejects.toThrow(
      "Rôles PostgreSQL manquants, à provisionner avant migration : history_maintainer",
    );
  });

  it("nomme tous les rôles manquants", async () => {
    await expect(assertRolesProvisioned({ listRoles: listing(["postgres"]) })).rejects.toThrow(
      "Rôles PostgreSQL manquants, à provisionner avant migration : migrator, app, history_maintainer",
    );
  });
});
