import type { LogSink } from "#platform/logging.ts";
import type { Mailer } from "#platform/mailer.ts";

import type { Plan } from "../domain/space.ts";
import { type ProjectStorage, storageWarningOf } from "../domain/storage-warning.ts";

export type SpaceStorage = {
  readonly name: string;
  readonly plan: Plan;
  readonly projects: readonly ProjectStorage[];
};

export interface StorageAlerts {
  storageOf(spaceId: string): Promise<SpaceStorage>;
  markAlerted(request: { readonly spaceId: string; readonly at: Date }): Promise<boolean>;
  openOwnerEmailsOf(spaceId: string): Promise<readonly string[]>;
}

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
    const { name, plan, projects } = await alerts.storageOf(spaceId);
    const warning = storageWarningOf({ spaceName: name, plan, projects });
    if (warning === undefined) {
      return;
    }
    if (!(await alerts.markAlerted({ spaceId, at: now() }))) {
      return;
    }
    const owners = await alerts.openOwnerEmailsOf(spaceId);
    await Promise.all(
      owners.map(async (to) => {
        const sent = await mailer.send({ to, ...warning });
        if (!sent.ok) {
          log({ level: "error", msg: "storage_alert_unsent", spaceId, to, error: sent.error });
        }
      }),
    );
  };
