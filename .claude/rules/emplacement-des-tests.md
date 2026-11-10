---
paths:
  - "apps/**/*.ts"
  - "apps/**/*.tsx"
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
---

# Emplacement des tests

Un fichier de test (`*.test.ts`, `*.integration.test.ts`) vit dans un dossier `__tests__/` placé dans le dossier du code qu'il teste : le test de `src/modules/token/domain/dtcg-document.ts` est `src/modules/token/domain/__tests__/dtcg-document.test.ts`, et il importe ce code par `../dtcg-document.ts`.

Aucun fichier de test ne reste à côté du code de production.
