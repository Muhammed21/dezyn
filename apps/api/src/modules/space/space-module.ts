import { randomUUID } from "node:crypto";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import { readSpace } from "./application/read-space.ts";
import { createPersonalSpace, listMySpaces } from "./application/spaces.ts";
import { postgresMembershipReader } from "./infrastructure/postgres-membership-reader.ts";
import { postgresSpaceStore } from "./infrastructure/postgres-space-store.ts";

export const spaceModule = (db: PostgresDatabase) => {
  const store = postgresSpaceStore(db);
  return {
    createPersonalSpace: createPersonalSpace({ store, newId: randomUUID, now: () => new Date() }),
    listMySpaces: listMySpaces({ store }),
    readSpace: readSpace({ memberships: postgresMembershipReader(db), spaces: store }),
  };
};
