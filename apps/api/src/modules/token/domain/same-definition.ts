export type ComparedDefinition = {
  readonly $value?: unknown;
  readonly modes?: Readonly<Record<string, unknown>>;
  readonly $description?: string;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
    );
  }
  return Object.is(left, right);
};

export const sameDefinition = (left: ComparedDefinition, right: ComparedDefinition): boolean =>
  sameValue(left.$value, right.$value) &&
  sameValue(left.modes, right.modes) &&
  left.$description === right.$description;
