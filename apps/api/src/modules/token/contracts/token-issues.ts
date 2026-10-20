import type { ModeRefusal } from "../domain/mode-completeness.ts";
import type { ReferenceRefusal } from "../domain/reference.ts";
import type { TokenCheckFailure } from "../domain/token-check.ts";
export type {
  CheckTokens,
  TokenCheck,
  TokenCheckFailure,
  ValidatedTokenFailure,
  ValidatedTokenWriter,
} from "../domain/token-check.ts";

const MODE_ISSUES: Readonly<Record<ModeRefusal["refusal"], string>> = {
  missing_mode: "Valeur manquante pour ce mode",
  unknown_mode: "Mode inconnu du projet",
  value_without_mode: "Le projet a des modes : donner une valeur par mode dans modes",
  modes_without_modifier: "Le projet n'a pas de modes : donner $value",
  missing_value: "Valeur manquante",
};

const modeIssueOf = (refusal: ModeRefusal) => {
  if ("mode" in refusal) {
    return { path: `modes.${refusal.mode}`, message: MODE_ISSUES[refusal.refusal] };
  }
  return {
    path: refusal.refusal === "modes_without_modifier" ? "modes" : "$value",
    message: MODE_ISSUES[refusal.refusal],
  };
};

const REFERENCE_MESSAGES: Readonly<Record<ReferenceRefusal, string>> = {
  unknown_reference: "Référence vers un token inexistant",
  unvalidated_reference: "Référence vers un token non validé",
  type_mismatch: "Référence vers un token d'un autre type",
};

const referenceIssueOf = ({
  mode,
  field,
  refusal,
}: {
  readonly mode?: string;
  readonly field?: string;
  readonly refusal: ReferenceRefusal;
}) => ({
  path: [
    mode === undefined ? "$value" : `modes.${mode}`,
    ...(field === undefined ? [] : [field]),
  ].join("."),
  message: REFERENCE_MESSAGES[refusal],
});

export const issuesOfCheck = (
  failure: TokenCheckFailure,
): readonly { readonly path: string; readonly message: string }[] => {
  switch (failure.code) {
    case "invalid_modes":
      return failure.refusals.map(modeIssueOf);
    case "invalid_references":
      return failure.refusals.map(referenceIssueOf);
    case "duplicate_name":
      return [{ path: "name", message: "Token déjà nommé dans cet appel" }];
    default:
      return [{ path: "$type", message: "Type différent du token validé" }];
  }
};
