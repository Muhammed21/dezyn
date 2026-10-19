import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { ProjectFinder } from "#modules/project/contracts/project.ts";
import type { MembershipReader } from "#modules/space/contracts/membership.ts";
import type { Clock } from "#platform/clock.ts";

import { addToken, type PendingProposals } from "./application/add-token.ts";
import { checkTokens } from "./application/check-tokens.ts";
import { validatedTokenWriter } from "./application/create-validated-token.ts";
import { declareFigmaStates, type FigmaProposals } from "./application/declare-figma-states.ts";
import { readProjectTokens, readTokens } from "./application/read-tokens.ts";
import { parseTokenDefinition } from "./contracts/token-definition.ts";
import {
  postgresFigmaStateReader,
  postgresFigmaStateSynchronizer,
  postgresFigmaUnitOfWork,
  postgresModeReader,
  postgresProjectTokenReader,
  postgresTokenUnitOfWork,
  postgresTokenWriter,
  postgresValidatedTokenReader,
} from "./infrastructure/postgres-tokens.ts";

export const figmaStateOn = postgresFigmaStateSynchronizer;

export const validatedTokenWriterOn = (tx: PostgresTransaction) =>
  validatedTokenWriter({
    modes: postgresModeReader(tx),
    projectTokens: postgresProjectTokenReader(tx),
    tokens: postgresTokenWriter(tx, { newId: randomUUID }),
    newId: randomUUID,
  });

export const tokenModule = ({
  db,
  memberships,
  projects,
  historyWriterOn,
  proposalReplacerOn,
  proposalWriterOn,
  clock,
}: {
  readonly db: PostgresDatabase;
  readonly memberships: MembershipReader;
  readonly projects: ProjectFinder;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly proposalWriterOn: (tx: PostgresTransaction) => FigmaProposals;
  readonly clock: Clock;
}) => {
  const check = checkTokens({
    modes: postgresModeReader(db.orm),
    projectTokens: postgresProjectTokenReader(db.orm),
  });
  const read = readTokens({
    modes: postgresModeReader(db.orm),
    tokens: postgresValidatedTokenReader(db),
    figmaStates: postgresFigmaStateReader(db),
  });
  return {
    addToken: addToken({
      projects,
      memberships,
      modes: postgresModeReader(db.orm),
      projectTokens: postgresProjectTokenReader(db.orm),
      unitOfWork: postgresTokenUnitOfWork({
        db,
        historyWriterOn,
        proposalReplacerOn,
        newId: randomUUID,
      }),
      newId: randomUUID,
      now: clock,
    }),
    checkTokens: check,
    readTokens: read,
    readProjectTokens: readProjectTokens({ projects, memberships, readTokens: read }),
    declareFigmaStates: declareFigmaStates({
      projects,
      memberships,
      projectTokens: postgresProjectTokenReader(db.orm),
      validatedTokensOf: async (projectId) => (await read(projectId)).tokens,
      parseFigmaValue: parseTokenDefinition,
      checkTokens: check,
      unitOfWork: postgresFigmaUnitOfWork({ db, proposalWriterOn }),
      now: clock,
    }),
  };
};
