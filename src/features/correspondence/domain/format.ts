/** Presentation helpers for letters; pure, no React. */

export function letterDate(at: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(at));
}

/** Blank lines separate paragraphs; single line breaks are kept within one. */
export function paragraphs(body: string): string[][] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((line) => line.trimEnd()))
    .filter((lines) => lines.some((line) => line.trim().length > 0));
}
