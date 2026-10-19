import { randomUUID } from "node:crypto";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import { writeTokens } from "./application/write-tokens.ts";
import { postgresPropositionUnitOfWork } from "./infrastructure/postgres-propositions.ts";

const now = () => new Date();

export const proposalModule = ({ db }: { readonly db: PostgresDatabase }) => ({
  writeTokens: writeTokens({
    unitOfWork: postgresPropositionUnitOfWork(db),
    newId: randomUUID,
    now,
  }),
});
