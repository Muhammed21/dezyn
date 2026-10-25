import { inspectRoles } from "../src/inspect-roles.ts";
import { entrust, restore } from "../src/replace-role.ts";

const ROLES = ["migrator", "app", "history_maintainer"];

const required = (variable: string, meaning: string): string => {
  const value = process.env[variable];
  if (value === undefined) {
    throw new Error(`${variable} manquante : ${meaning}`);
  }
  return value;
};

const roleArgument = (): string => {
  const role = process.argv[3];
  if (role === undefined || !ROLES.includes(role)) {
    throw new Error(`Rôle attendu parmi ${ROLES.join(", ")}`);
  }
  return role;
};

const keeperOf = (role: string): string => `${role}_keeper`;

const command = process.argv[2];
if (command === "inspect") {
  const report = await inspectRoles({
    connectionString: required("DATABASE_URL_MIGRATOR", "URL de migrator"),
    roles: ROLES,
  });
  console.log(JSON.stringify(report));
} else if (command === "entrust") {
  const role = roleArgument();
  await entrust({
    ownerUrl: required("DATABASE_URL_OWNER", "URL du rôle propriétaire de la base"),
    roleUrl: required("DATABASE_URL_ROLE", `URL de ${role}`),
    role,
    keeper: keeperOf(role),
  });
  console.error(`${role} confié à ${keeperOf(role)}`);
} else if (command === "restore") {
  const role = roleArgument();
  await restore({
    ownerUrl: required("DATABASE_URL_OWNER", "URL du rôle propriétaire de la base"),
    role,
    keeper: keeperOf(role),
    password: required("PASSWORD", `nouveau mot de passe de ${role}`),
    creates: role === "migrator",
  });
  console.error(`${role} recréé en SQL, ${keeperOf(role)} supprimé`);
} else {
  throw new Error("Commande attendue : inspect, entrust <rôle> ou restore <rôle>");
}
