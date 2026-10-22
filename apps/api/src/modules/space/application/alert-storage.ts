import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

import type { Plan } from "../domain/space.ts";
import { storageAlertReached, storageLimitOf } from "../domain/storage-limit.ts";

export type SpaceStorage = {
  readonly name: string;
  readonly plan: Plan;
  readonly storedBytes: number;
};

export interface StorageAlerts {
  storageOf(spaceId: string): Promise<SpaceStorage>;
  markAlerted(request: { readonly spaceId: string; readonly at: Date }): Promise<boolean>;
  openOwnerEmailsOf(spaceId: string): Promise<readonly string[]>;
}

const megabytes = (bytes: number) => `${Math.floor(bytes / 1_000_000)} Mo`;

const storageAlertEmail = ({
  to,
  storage,
}: {
  readonly to: string;
  readonly storage: SpaceStorage;
}) => ({
  to,
  subject: `L'espace « ${storage.name} » atteint 80 % de son stockage sur dezyn`,
  text: `L'espace « ${storage.name} » utilise ${megabytes(storage.storedBytes)} sur ${megabytes(storageLimitOf(storage.plan))}.`,
});

export const alertStorage =
  ({
    alerts,
    mailer,
    now,
    log,
  }: {
    readonly alerts: StorageAlerts;
    readonly mailer: Mailer;
    readonly now: () => Date;
    readonly log: LogSink;
  }) =>
  async (spaceId: string): Promise<void> => {
    const storage = await alerts.storageOf(spaceId);
    if (!storageAlertReached(storage)) {
      return;
    }
    if (!(await alerts.markAlerted({ spaceId, at: now() }))) {
      return;
    }
    const owners = await alerts.openOwnerEmailsOf(spaceId);
    await Promise.all(
      owners.map(async (to) => {
        const sent = await mailer.send(storageAlertEmail({ to, storage }));
        if (!sent.ok) {
          log({ level: "error", msg: "storage_alert_unsent", spaceId, to, error: sent.error });
        }
      }),
    );
  };
