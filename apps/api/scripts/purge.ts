import { createPostgresDatabase } from "#db";
import { historyPurge } from "#modules/history/history-module.ts";
import { storageMeterOn } from "#modules/project/project-module.ts";

const DATABASE_URL = "DATABASE_URL_HISTORY_MAINTAINER";

const url = process.env[DATABASE_URL];
if (url === undefined) {
  throw new Error(`${DATABASE_URL} manquante : copier .env.example en .env`);
}

const db = createPostgresDatabase({ url });
try {
  const purged = await historyPurge({ db, meterOn: storageMeterOn })();
  console.log(JSON.stringify(purged, null, 2));
} finally {
  await db.close();
}
