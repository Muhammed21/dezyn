const EXPECTED_ROLES: readonly string[] = ["migrator", "app", "history_maintainer"];

export const assertRolesProvisioned = async ({
  listRoles,
}: {
  readonly listRoles: () => Promise<readonly string[]>;
}): Promise<void> => {
  const existing = new Set(await listRoles());
  const missing = EXPECTED_ROLES.filter((role) => !existing.has(role));
  if (missing.length > 0) {
    throw new Error(
      `Rôles PostgreSQL manquants, à provisionner avant migration : ${missing.join(", ")}`,
    );
  }
};
