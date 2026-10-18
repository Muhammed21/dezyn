const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class SafeHtml {
  readonly #markup: string;

  constructor(markup: string) {
    this.#markup = markup;
  }

  toString(): string {
    return this.#markup;
  }
}

export type HtmlValue = SafeHtml | string;

const escape = (text: string): string =>
  text.replaceAll(/[&<>"']/g, (character) => ESCAPES[character] ?? character);

const render = (value: HtmlValue): string =>
  value instanceof SafeHtml ? value.toString() : escape(value);

export const markup = (strings: TemplateStringsArray, ...values: readonly HtmlValue[]): SafeHtml =>
  new SafeHtml(
    strings.reduce((rendered, part, index) => rendered + render(values[index - 1] ?? "") + part),
  );
