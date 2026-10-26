import { createMissingRoles } from "../src/create-missing-roles.ts";

const PRIVILEGED = 4;
const UNMIGRATED_GRANTS = 5;

const required = (variable: string, role: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : ${role}`);
  }
  return value;
};

const outcome = await createMissingRoles({
  connectionString: required("DATABASE_URL_OWNER", "URL du rôle propriétaire de la base"),
  roles: [
    {
      name: "migrator",
      password: required("PASSWORD_MIGRATOR", "mot de passe de migrator"),
      creates: true,
    },
    { name: "app", password: required("PASSWORD_APP", "mot de passe de app"), creates: false },
    {
      name: "history_maintainer",
      password: required("PASSWORD_HISTORY_MAINTAINER", "mot de passe de history_maintainer"),
      creates: false,
    },
  ],
});
if (outcome.kind === "privileged") {
  console.error(`Rôles privilégiés : ${outcome.roles.join(" ")}`);
  process.exitCode = PRIVILEGED;
} else if (outcome.kind === "unmigrated-grants") {
  console.error(
    `Rôles manquants sur une base déjà migrée, dont les droits ne reviendraient pas : ${outcome.roles.join(" ")}`,
  );
  process.exitCode = UNMIGRATED_GRANTS;
} else {
  console.log(outcome.roles.join("\n"));
}
