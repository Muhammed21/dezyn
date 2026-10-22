import type { DecidedStorageAlert } from "../domain/storage-warning.ts";

export type { DecidedStorageAlert } from "../domain/storage-warning.ts";

export type StorageAlertDecision = (spaceId: string) => Promise<DecidedStorageAlert | undefined>;

export type StorageAlertSender = (alert: DecidedStorageAlert) => Promise<void>;
