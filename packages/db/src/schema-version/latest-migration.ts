export type Migration = {
  readonly tag: string;
  readonly when: number;
};

export type Journal = {
  readonly entries: readonly Migration[];
};

export const latestMigration = ({ entries }: Journal): Migration => {
  const latest = entries.toSorted((a, b) => a.when - b.when).at(-1);
  if (latest === undefined) {
    throw new Error("Aucune migration dans le journal Drizzle");
  }
  return { tag: latest.tag, when: latest.when };
};
