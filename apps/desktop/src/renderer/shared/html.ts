// Tiny HTML builder for the screens. Every interpolated value is escaped unless it is itself built
// with html`` or wrapped in raw(), so tab titles and user text can never become markup.
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

export function raw(value: string): SafeHtml {
  return new SafeHtml(value);
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export type Value = string | number | boolean | null | undefined | SafeHtml | Value[];

function piece(v: Value): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(piece).join('');
  if (v instanceof SafeHtml) return v.value;
  return esc(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < values.length) out += piece(values[i]);
  });
  return new SafeHtml(out);
}

/** Attribute list from an object: true -> "true", false/null/undefined -> omitted. */
export function attr(a: Record<string, string | number | boolean | null | undefined>): SafeHtml {
  return raw(
    Object.entries(a)
      .filter(([, v]) => v !== false && v !== null && v !== undefined)
      .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
      .join(''),
  );
}
