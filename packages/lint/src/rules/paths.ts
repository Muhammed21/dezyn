import { dirname, resolve } from "node:path/posix";

export type Location = {
  readonly module: string;
  readonly layer: string | undefined;
};

const MODULE_PATH = /\/apps\/api\/src\/modules\/([^/]+)\/(?:([^/]+)\/)?/;

const API_ROOT = /^(.*\/apps\/api)\//;

export const API_IMPORTS: Readonly<Record<string, string>> = {
  "#platform/*": "./src/platform/*",
  "#testing/*": "./src/testing/*",
  "#modules/*": "./src/modules/*",
  "#db": "./src/platform/postgres-database.ts",
  "#create-app": "./src/create-app.ts",
  "#compose-modules": "./src/compose-modules.ts",
};

export const ROOT_LAYER = "racine du module";

export const locate = (path: string): Location | undefined => {
  const match = MODULE_PATH.exec(path);
  return match?.[1] === undefined ? undefined : { module: match[1], layer: match[2] };
};

const isRelative = (source: string): boolean => source.startsWith("./") || source.startsWith("../");

const aliasTarget = (source: string): string | undefined =>
  Object.entries(API_IMPORTS).flatMap(([alias, target]) => {
    if (!alias.endsWith("/*")) {
      return alias === source ? [target] : [];
    }
    const prefix = alias.slice(0, -1);
    return source.startsWith(prefix) ? [target.replace("*", source.slice(prefix.length))] : [];
  })[0];

const resolveImport = (importer: string, source: string): string | undefined => {
  if (isRelative(source)) {
    return resolve(dirname(importer), source);
  }
  const root = API_ROOT.exec(importer)?.[1];
  const target = aliasTarget(source);
  return root === undefined || target === undefined ? undefined : resolve(root, target);
};

export const isInternalImport = (importer: string, source: string): boolean =>
  resolveImport(importer, source) !== undefined;

export const locateImport = (importer: string, source: string): Location | undefined => {
  const path = resolveImport(importer, source);
  return path === undefined ? undefined : locate(path);
};
