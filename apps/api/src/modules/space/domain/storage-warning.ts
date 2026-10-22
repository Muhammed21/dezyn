import type { Plan } from "./space.ts";
import { storageAlertReached, storageLimitOf } from "./storage-limit.ts";

export type ProjectStorage = { readonly name: string; readonly storedBytes: number };

export type StorageWarning = { readonly subject: string; readonly text: string };

export type DecidedStorageAlert = {
  readonly spaceId: string;
  readonly warning: StorageWarning;
  readonly owners: readonly string[];
};

const sizeOf = (bytes: number) =>
  bytes < 1_000_000_000
    ? `${Math.floor(bytes / 1_000_000)} Mo`
    : `${String(Math.floor(bytes / 100_000_000) / 10).replace(".", ",")} Go`;

const largestFirst = (a: ProjectStorage, b: ProjectStorage) =>
  b.storedBytes - a.storedBytes || a.name.localeCompare(b.name);

export const storageWarningOf = ({
  spaceName,
  plan,
  projects,
}: {
  readonly spaceName: string;
  readonly plan: Plan;
  readonly projects: readonly ProjectStorage[];
}): StorageWarning | undefined => {
  const storedBytes = projects.reduce((total, project) => total + project.storedBytes, 0);
  const [largest] = projects.toSorted(largestFirst);
  if (largest === undefined || !storageAlertReached({ plan, storedBytes })) {
    return undefined;
  }
  return {
    subject: `L'espace « ${spaceName} » atteint 80 % de son stockage sur dezyn`,
    text: [
      `L'espace « ${spaceName} » utilise ${sizeOf(storedBytes)} sur ${sizeOf(storageLimitOf(plan))}.`,
      `Le projet « ${largest.name} » est celui qui consomme le plus.`,
      "À 100 %, dezyn purge les plus anciennes images de snapshots puis l'historique, en commençant par ce projet. Le MCP reste disponible.",
      ...(plan === "free"
        ? [`Le plan Team offre ${sizeOf(storageLimitOf("team"))} de stockage.`]
        : []),
    ].join("\n\n"),
  };
};
