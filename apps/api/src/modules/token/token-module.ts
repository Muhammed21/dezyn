import { randomUUID } from "node:crypto";

import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import type { StorageMeter } from "#modules/project/contracts/storage-meter.ts";
import type { ProjectAccess } from "#modules/space/contracts/membership.ts";
import type {
  StorageAlertDecision,
  StorageAlertSender,
} from "#modules/space/contracts/storage-alert.ts";
import type { Clock } from "#platform/clock.ts";

import { addToken, type PendingProposals } from "./application/add-token.ts";
import { checkTokens } from "./application/check-tokens.ts";
import { validatedTokenWriter } from "./application/create-validated-token.ts";
import { declareFigmaStates, type FigmaProposals } from "./application/declare-figma-states.ts";
import { exportTokens } from "./application/export-tokens.ts";
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
  storageAlertOn,
  sendStorageAlert,
  clock,
}: {
  readonly db: PostgresDatabase;
  readonly access: ProjectAccess;
  readonly historyWriterOn: (tx: PostgresTransaction) => HistoryWriter;
  readonly proposalReplacerOn: (tx: PostgresTransaction) => PendingProposals;
  readonly proposalWriterOn: (tx: PostgresTransaction) => FigmaProposals;
  readonly storageMeterOn: (tx: PostgresTransaction) => StorageMeter;
  readonly storageAlertOn: (tx: PostgresTransaction) => StorageAlertDecision;
  readonly sendStorageAlert: StorageAlertSender;
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
  const readProject = readProjectTokens({ access, readTokens: read });
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
        storageAlertOn,
        newId: randomUUID,
      }),
      sendStorageAlert,
      newId: randomUUID,
      now: clock,
    }),
    checkTokens: check,
    readTokens: read,
    readProjectTokens: readProject,
    exportTokens: exportTokens({ readProjectTokens: readProject }),
    declareFigmaStates: declareFigmaStates({
      access,
      projectTokens: postgresProjectTokenReader(db.orm),
      validatedTokensOf: async (projectId) => (await read(projectId)).tokens,
      rejectedValues: postgresRejectedValueReader(db),
      parseFigmaValue: parseTokenDefinition,
      checkTokens: check,
      unitOfWork: postgresFigmaUnitOfWork({ db, proposalWriterOn, storageMeterOn, storageAlertOn }),
      sendStorageAlert,
      now: clock,
    }),
  };
};
