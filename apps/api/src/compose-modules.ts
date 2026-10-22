import type { PostgresDatabase, PostgresTransaction } from "#db";
import type { HistoryWriter } from "#modules/history/contracts/history-writer.ts";
import { historyModule, historyWriterOn } from "#modules/history/history-module.ts";
import { projectModule, storageMeterOn } from "#modules/project/project-module.ts";
import {
  proposalModule,
  proposalReplacerOn,
  proposalWriterOn,
} from "#modules/proposal/proposal-module.ts";
import { spaceModule } from "#modules/space/space-module.ts";
import { figmaStateOn, tokenModule, validatedTokenWriterOn } from "#modules/token/token-module.ts";
import type { Clock } from "#platform/clock.ts";
import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

export const composeModules = ({
  db,
  mailer,
  webUrl,
  log,
  wrapHistoryWriter = (writer) => writer,
  clock = () => new Date(),
}: {
  readonly db: PostgresDatabase;
  readonly mailer: Mailer;
  readonly webUrl: string;
  readonly log: LogSink;
  readonly wrapHistoryWriter?: (writer: HistoryWriter) => HistoryWriter;
  readonly clock?: Clock;
}) => {
  const spaces = spaceModule({ db, mailer, webUrl, log });
  const writerOn = (tx: PostgresTransaction) =>
    wrapHistoryWriter(historyWriterOn(tx, storageMeterOn(tx)));
  const projects = projectModule({
    db,
    memberships: spaces.memberships,
    historyWriterOn: writerOn,
  });
  const access = spaces.projectAccess(projects.finder);
  const history = historyModule({
    db,
    access,
    writerOn,
  });
  const tokens = tokenModule({
    db,
    access,
    historyWriterOn: writerOn,
    proposalReplacerOn,
    proposalWriterOn: (tx) => proposalWriterOn(tx, storageMeterOn(tx)),
    storageMeterOn,
    storageAlertOn: spaces.storageAlertOn,
    sendStorageAlert: spaces.sendStorageAlert,
    clock,
  });
  const proposals = proposalModule({
    db,
    access,
    checkTokens: tokens.checkTokens,
    validatedTokensOf: async (projectId) => (await tokens.readTokens(projectId)).tokens,
    historyWriterOn: writerOn,
    validatedTokenWriterOn: (tx) => validatedTokenWriterOn(tx, storageMeterOn(tx)),
    figmaStateOn: (tx) => figmaStateOn(tx, storageMeterOn(tx)),
    storageMeterOn,
    storageAlertOn: spaces.storageAlertOn,
    sendStorageAlert: spaces.sendStorageAlert,
    clock,
  });
  return { spaces, projects, history, tokens, proposals };
};
