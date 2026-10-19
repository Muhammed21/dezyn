import type { HistoryWriter } from "./modules/history/contracts/history-writer.ts";
import { historyModule, historyWriterOn } from "./modules/history/history-module.ts";
import { projectModule } from "./modules/project/project-module.ts";
import { proposalModule, propositionReplacerOn } from "./modules/proposal/proposal-module.ts";
import { spaceModule } from "./modules/space/space-module.ts";
import { tokenModule, validatedTokenWriterOn } from "./modules/token/token-module.ts";
import type { Clock } from "./platform/clock.ts";
import type { Mailer } from "./platform/mailer.ts";
import type { PostgresDatabase, PostgresTransaction } from "./platform/postgres-database.ts";

export const composeModules = ({
  db,
  mailer,
  webUrl,
  wrapHistoryWriter = (writer) => writer,
  clock = () => new Date(),
}: {
  readonly db: PostgresDatabase;
  readonly mailer: Mailer;
  readonly webUrl: string;
  readonly wrapHistoryWriter?: (writer: HistoryWriter) => HistoryWriter;
  readonly clock?: Clock;
}) => {
  const spaces = spaceModule({ db, mailer, webUrl });
  const writerOn = (tx: PostgresTransaction) => wrapHistoryWriter(historyWriterOn(tx));
  const projects = projectModule({
    db,
    memberships: spaces.memberships,
    historyWriterOn: writerOn,
  });
  const history = historyModule({
    db,
    memberships: spaces.memberships,
    projects: projects.finder,
    writerOn,
  });
  const tokens = tokenModule({
    db,
    memberships: spaces.memberships,
    projects: projects.finder,
    historyWriterOn: writerOn,
    propositionReplacerOn,
  });
  const proposals = proposalModule({
    db,
    memberships: spaces.memberships,
    projects: projects.finder,
    checkTokens: tokens.checkTokens,
    validatedTokensOf: async (projectId) => (await tokens.readTokens(projectId)).tokens,
    historyWriterOn: writerOn,
    validatedTokenWriterOn,
    clock,
  });
  return { spaces, projects, history, tokens, proposals };
};
