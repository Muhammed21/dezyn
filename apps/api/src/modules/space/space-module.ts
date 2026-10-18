import { randomUUID } from "node:crypto";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import { createPersonalSpace, listMySpaces } from "./application/spaces.ts";
import { postgresSpaceStore } from "./infrastructure/postgres-space-store.ts";

export const spaceModule = (db: PostgresDatabase) => {
  const store = postgresSpaceStore(db);
  return {
    createPersonalSpace: createPersonalSpace({ store, newId: randomUUID, now: () => new Date() }),
    listMySpaces: listMySpaces({ store }),
  };
};
