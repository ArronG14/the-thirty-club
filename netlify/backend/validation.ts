import { BackendError } from './database.ts';
export function invalid(): never {
  throw new BackendError('invalid');
}
export function keys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((k) => !allowed.includes(k))) invalid();
}
export function text(value: unknown, min: number, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.length > max
  )
    invalid();
  return value.trim();
}
export function uuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value;
}
export function idempotency(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value))
    invalid();
  return value;
}
export function integer(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid();
  return value;
}
export function instant(value: unknown, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    invalid();
  const calendar = value.slice(0, 10);
  if (
    !new Date(`${calendar}T00:00:00Z`).toISOString().startsWith(calendar) ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    (value[16] === ':' && Number(value.slice(17, 19)) > 59)
  )
    invalid();
  return new Date(value).toISOString();
}
export function privilege(body: Record<string, unknown>) {
  keys(body, [
    'slug',
    'title',
    'description',
    'kind',
    'enabled',
    'opensAt',
    'closesAt',
    'minAmountPence',
    'maxAmountPence',
  ]);
  if (
    typeof body.slug !== 'string' ||
    !/^[a-z0-9-]{3,60}$/.test(body.slug) ||
    !['beauty', 'drink'].includes(String(body.kind)) ||
    typeof body.enabled !== 'boolean'
  )
    invalid();
  text(body.title, 1, 100);
  text(body.description, 0, 1000);
  instant(body.opensAt);
  instant(body.closesAt, true);
  if (body.kind === 'beauty') {
    if (integer(body.maxAmountPence) < integer(body.minAmountPence)) invalid();
  } else if (body.minAmountPence !== null || body.maxAmountPence !== null)
    invalid();
}
export function message(body: Record<string, unknown>) {
  keys(body, ['label', 'body', 'sendAt', 'timezone']);
  text(body.label, 1, 100);
  text(body.body, 1, 1600);
  instant(body.sendAt, true);
  try {
    new Intl.DateTimeFormat('en-GB', {
      timeZone: text(body.timezone, 1, 100),
    }).format();
  } catch {
    invalid();
  }
}
