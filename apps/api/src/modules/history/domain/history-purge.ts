export const PURGE_BATCH_SIZE = 500;

export const purgeTargetOf = (limit: number): number => (limit * 9) / 10;

export type PurgeableEntry = {
  readonly id: string;
  readonly occurredAt: Date;
  readonly size: number;
};

export type EntriesToPurge = {
  readonly ids: readonly string[];
  readonly covered: number;
  readonly purgedBefore: Date;
};

export const entriesToPurge = ({
  oldest: [first, ...rest],
  excess,
}: {
  readonly oldest: readonly [PurgeableEntry, ...PurgeableEntry[]];
  readonly excess: number;
}): EntriesToPurge =>
  rest.reduce<EntriesToPurge>(
    (chosen, entry) =>
      chosen.covered >= excess
        ? chosen
        : {
            ids: [...chosen.ids, entry.id],
            covered: chosen.covered + entry.size,
            purgedBefore: entry.occurredAt,
          },
    { ids: [first.id], covered: first.size, purgedBefore: first.occurredAt },
  );
