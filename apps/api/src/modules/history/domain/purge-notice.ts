import type { Plan } from "#modules/space/contracts/plan.ts";
import { sizeOf, storageLimitOf } from "#modules/space/contracts/storage-limit.ts";

export type PurgedProjectNotice = {
  readonly name: string;
  readonly deletedEntries: number;
  readonly purgedBefore: Date;
};

export type PurgeNotice = { readonly subject: string; readonly text: string };

const dayOf = (date: Date) =>
  date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const entriesOf = (count: number) =>
  count === 1 ? "1 entrée supprimée" : `${count} entrées supprimées`;

const projectLineOf = ({ name, deletedEntries, purgedBefore }: PurgedProjectNotice) =>
  `« ${name} » : ${entriesOf(deletedEntries)}, la plus récente du ${dayOf(purgedBefore)}.`;

export const purgeNoticeOf = ({
  spaceName,
  plan,
  storedBytes,
  projects,
}: {
  readonly spaceName: string;
  readonly plan: Plan;
  readonly storedBytes: number;
  readonly projects: readonly PurgedProjectNotice[];
}): PurgeNotice => ({
  subject: `L'historique de l'espace « ${spaceName} » a été purgé sur dezyn`,
  text: [
    `L'espace « ${spaceName} » a atteint sa limite de stockage : dezyn a supprimé les plus anciennes entrées de l'historique de ses projets.`,
    projects.map(projectLineOf).join("\n"),
    `L'espace « ${spaceName} » utilise maintenant ${sizeOf(storedBytes)} sur ${sizeOf(storageLimitOf(plan))}.`,
    ...(plan === "free"
      ? [`Le plan Team offre ${sizeOf(storageLimitOf("team"))} de stockage.`]
      : []),
  ].join("\n\n"),
});
