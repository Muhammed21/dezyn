import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
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
  postgresRejectedValueReader,
  postgresTokenUnitOfWork,
  postgresTokenWriter,
  postgresValidatedTokenReader,
} from "./infrastructure/postgres-tokens.ts";

export const figmaStateOn = postgresFigmaStateSynchronizer;

export const validatedTokenWriterOn = (tx: PostgresTransaction, meter: StorageMeter) =>
  validatedTokenWriter({
    modes: postgresModeReader(tx),
    projectTokens: postgresProjectTokenReader(tx),
    tokens: postgresTokenWriter(tx, { newId: randomUUID, meter }),
    newId: randomUUID,
  });

export const tokenModule = ({
  db,
  access,
  historyWriterOn,
  proposalReplacerOn,
  proposalWriterOn,
  storageMeterOn,
  clock,
}: {
  readonly db: PostgresDatabase;
  readonly access: ProjectAccess;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly proposalWriterOn: (tx: PostgresTransaction) => FigmaProposals;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
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
      access,
      modes: postgresModeReader(db.orm),
      projectTokens: postgresProjectTokenReader(db.orm),
      unitOfWork: postgresTokenUnitOfWork({
        db,
        historyWriterOn,
        proposalReplacerOn,
        storageMeterOn,
        newId: randomUUID,
      }),
      newId: randomUUID,
      now: clock,
    }),
    checkTokens: check,
    readTokens: read,
    readProjectTokens: readProjectTokens({ access, readTokens: read }),
    declareFigmaStates: declareFigmaStates({
      access,
      projectTokens: postgresProjectTokenReader(db.orm),
      validatedTokensOf: async (projectId) => (await read(projectId)).tokens,
      rejectedValues: postgresRejectedValueReader(db),
      parseFigmaValue: parseTokenDefinition,
      checkTokens: check,
      unitOfWork: postgresFigmaUnitOfWork({ db, proposalWriterOn }),
      now: clock,
    }),
  };
};
