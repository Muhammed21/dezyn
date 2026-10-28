export type ImportIssue = { readonly path: string; readonly message: string };

export type ImportedCandidate = {
  readonly name: string;
  readonly candidate: Readonly<Record<string, unknown>>;
};

export type FlatDocument = {
  readonly candidates: readonly ImportedCandidate[];
  readonly issues: readonly ImportIssue[];
};

const RESOLVER_FIELDS = ["version", "resolutionOrder"];

const isObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const merged = (first: FlatDocument, second: FlatDocument): FlatDocument => ({
  candidates: [...first.candidates, ...second.candidates],
  issues: [...first.issues, ...second.issues],
});

export const tokenIssuePath = (name: string, path: string) =>
  path === "name" ? `tokens.${name}` : `tokens.${name}.${path}`;

const pathOf = (name: string, key: string) => (name === "" ? key : `${name}.${key}`);

const tokenOf = (name: string, own: readonly (readonly [string, unknown])[]): FlatDocument => {
  const candidate = Object.fromEntries(own);
  return "$type" in candidate
    ? { candidates: [{ name, candidate }], issues: [] }
    : { candidates: [], issues: [{ path: `tokens.${name}.$type`, message: "Type manquant" }] };
};

const groupOf = (name: string, own: readonly (readonly [string, unknown])[]): FlatDocument => ({
  candidates: [],
  issues: own.map(([key]) => ({
    path: `tokens.${pathOf(name, key)}`,
    message: "Propriété de groupe non prise en charge",
  })),
});

const nodeOf = (name: string, node: Readonly<Record<string, unknown>>): FlatDocument => {
  const entries = Object.entries(node);
  const own = entries.filter(([key]) => key.startsWith("$"));
  const children = entries.filter(([key]) => !key.startsWith("$"));
  const self = "$value" in node ? tokenOf(name, own) : groupOf(name, own);
  return children.reduce<FlatDocument>((flat, [key, child]) => {
    const childName = pathOf(name, key);
    return merged(
      flat,
      key.includes(".")
        ? {
            candidates: [],
            issues: [{ path: `tokens.${childName}`, message: "Point interdit dans un nom" }],
          }
        : isObject(child)
          ? nodeOf(childName, child)
          : {
              candidates: [],
              issues: [{ path: `tokens.${childName}`, message: "Ni un token ni un groupe" }],
            },
    );
  }, self);
};

export const flattenDocument = (document: Readonly<Record<string, unknown>>): FlatDocument => {
  const resolverFields = RESOLVER_FIELDS.filter((field) => field in document);
  if (resolverFields.length > 0) {
    return {
      candidates: [],
      issues: resolverFields.map((path) => ({
        path,
        message: "Document Resolver non pris en charge",
      })),
    };
  }
  return nodeOf("", document);
};
