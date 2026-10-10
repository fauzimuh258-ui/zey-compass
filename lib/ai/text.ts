// lib/ai/text.ts
// Text helpers around the model: redact what goes IN, clean what comes OUT.
// Regexes cannot find names or street addresses in free text. Account fields
// (display name, bio, email) are therefore never put into prompts at all.

const REDACTIONS: readonly (readonly [RegExp, string])[] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\bhttps?:\/\/\S+|\bwww\.\S+/gi, '[url]'],
  [/\beyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}/g, '[secret]'],
  [/\b(?:sk|gsk|ghp|gho|pk|rk|xox[baprs])[-_][A-Za-z0-9_-]{16,}/g, '[secret]'],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[secret]'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]'],
  [/\+?\d(?:[\s().-]?\d){8,}/g, '[phone]'],
];

export function redactPii(text: string): string {
  return REDACTIONS.reduce((acc, [pattern, label]) => acc.replace(pattern, label), text);
}

export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** Redacted, whitespace-collapsed, length-limited text for prompts. */
export function safeText(text: string | null | undefined, max: number): string {
  return clip(redactPii((text ?? '').replace(/\s+/g, ' ').trim()), max);
}

/** Mechanical cleanup of model text: dashes, markdown noise and list markers. */
export function cleanLine(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, ' - ')
    .replace(/[*`#]+/g, '')
    .replace(/^\s*(?:\d+[.)]|[-\u2022])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
