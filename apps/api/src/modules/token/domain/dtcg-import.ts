export type ImportIssue = { readonly path: string; readonly message: string };

export type ImportedCandidate = {
  readonly name: string;
  readonly candidate: Readonly<Record<string, unknown>>;
  readonly typeFrom: string | undefined;
};

type InheritedType = { readonly type: unknown; readonly from: string } | undefined;

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

export const distinct = (issues: readonly ImportIssue[]) =>
  issues.filter(
    (candidate, index) =>
      issues.findIndex(
        ({ path, message }) => path === candidate.path && message === candidate.message,
      ) === index,
  );

export const candidateIssuePath = ({ name, typeFrom }: ImportedCandidate, path: string) =>
  path === "$type" && typeFrom !== undefined
    ? `tokens.${pathOf(typeFrom, "$type")}`
    : tokenIssuePath(name, path);

const UNSUPPORTED = ["$deprecated", "$root"];

type Own = readonly (readonly [string, unknown])[];

const unsupportedOf = (name: string, own: Own): readonly ImportIssue[] =>
  own
    .filter(([key]) => UNSUPPORTED.includes(key))
    .map(([key]) => ({
      path: `tokens.${pathOf(name, key)}`,
      message: "Propriété non prise en charge",
    }));

const tokenOf = (name: string, own: Own, inherited: InheritedType): FlatDocument => {
  const candidate = {
    ...(inherited === undefined ? {} : { $type: inherited.type }),
    ...Object.fromEntries(own.filter(([key]) => !UNSUPPORTED.includes(key))),
  };
  const typeFrom = own.some(([key]) => key === "$type") ? undefined : inherited?.from;
  const unsupported = unsupportedOf(name, own);
  return "$type" in candidate
    ? { candidates: [{ name, candidate, typeFrom }], issues: unsupported }
    : {
        candidates: [],
        issues: [...unsupported, { path: `tokens.${name}.$type`, message: "Type manquant" }],
      };
};

const groupOf = (name: string, own: Own): FlatDocument => ({
  candidates: [],
  issues: own
    .filter(([key]) => key !== "$type")
    .map(([key]) => ({
      path: `tokens.${pathOf(name, key)}`,
      message: UNSUPPORTED.includes(key)
        ? "Propriété non prise en charge"
        : "Propriété de groupe non prise en charge",
    })),
});

const nodeOf = (
  name: string,
  node: Readonly<Record<string, unknown>>,
  inherited: InheritedType,
): FlatDocument => {
  const entries = Object.entries(node);
  const own = entries.filter(([key]) => key.startsWith("$"));
  const children = entries.filter(([key]) => !key.startsWith("$"));
  const isToken = "$value" in node;
  const self = isToken ? tokenOf(name, own, inherited) : groupOf(name, own);
  const childType = isToken || !("$type" in node) ? inherited : { type: node.$type, from: name };
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
          ? nodeOf(childName, child, childType)
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
  return nodeOf("", document, undefined);
};
