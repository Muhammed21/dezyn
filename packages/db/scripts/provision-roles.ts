import { provisionRoles } from "../src/provision-roles.ts";

const PRIVILEGED = 4;

const required = (variable: string, role: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : ${role}`);
  }
  return value;
};

const outcome = await provisionRoles({
  connectionString: required("DATABASE_URL_OWNER", "URL du rôle propriétaire de la base"),
  roles: [
    { name: "migrator", password: required("PASSWORD_MIGRATOR", "mot de passe de migrator") },
    { name: "app", password: required("PASSWORD_APP", "mot de passe de app") },
    {
      name: "history_maintainer",
      password: required("PASSWORD_HISTORY_MAINTAINER", "mot de passe de history_maintainer"),
    },
  ],
});
if (outcome.kind === "privileged") {
  console.error(`Rôles privilégiés, à supprimer avant de les recréer : ${outcome.roles.join(" ")}`);
  process.exitCode = PRIVILEGED;
} else {
  console.log("Rôles migrator, app et history_maintainer provisionnés");
}
