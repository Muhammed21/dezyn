import { describe, expect, it } from "vitest";

import { migrate } from "./migrate.ts";
import { withThrowawayDatabase } from "./testing/throwaway-database.ts";

const INSUFFICIENT_PRIVILEGE = "42501";

describe("migrate", () => {
  it("refuse d'appliquer les migrations avec le rôle app", () =>
    withThrowawayDatabase(async ({ appUrl }) => {
      await expect(migrate({ connectionString: appUrl })).rejects.toMatchObject({
        cause: { code: INSUFFICIENT_PRIVILEGE },
      });
    }));
});
