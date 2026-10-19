import { randomUUID } from "node:crypto";

import type { PostgresDatabase } from "../../platform/postgres-database.ts";
import type { CheckTokens } from "../token/contracts/token-issues.ts";
import { writeTokens } from "./application/write-tokens.ts";
import { postgresPropositionUnitOfWork } from "./infrastructure/postgres-propositions.ts";

const now = () => new Date();

export const proposalModule = ({
  db,
  checkTokens,
}: {
  readonly db: PostgresDatabase;
  readonly checkTokens: CheckTokens;
}) => ({
  writeTokens: writeTokens({
    checkTokens,
    unitOfWork: postgresPropositionUnitOfWork(db),
    newId: randomUUID,
    now,
  }),
});
