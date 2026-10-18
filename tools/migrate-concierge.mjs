/** Copy existing Blobs records without overwriting database records. Freeze writes first. */
import process from 'node:process';
import console from 'node:console';
import { getStore } from '@netlify/blobs';
const { fetch, AbortSignal } = globalThis;
for (const key of [
  'NETLIFY_AUTH_TOKEN',
  'NETLIFY_SITE_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
])
  if (!process.env[key])
    throw new Error(`Set ${key} in this terminal environment.`);
const source = getStore({
  name: 'concierge',
  consistency: 'strong',
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_AUTH_TOKEN,
});
async function rpc(operation, key, value = null) {
  const response = await fetch(
    `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/ttc_legacy_store`,
    {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        p_operation: operation,
        p_key: key,
        p_value: value,
        p_etag: null,
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new Error(
      `Database copy failed (${response.status}). No source data was deleted.`,
    );
  return response.json();
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}
let copied = 0;
let checked = 0;
for await (const page of source.list({ paginate: true }))
  for (const blob of page.blobs) {
    const value = await source.get(blob.key, { type: 'json' });
    if (value === null)
      throw new Error(
        'A source record changed during copy. Freeze writes and rerun.',
      );
    if (await rpc('create', blob.key, value)) copied++;
    const target = await rpc('get', blob.key);
    if (
      JSON.stringify(canonical(target?.value)) !==
      JSON.stringify(canonical(value))
    )
      throw new Error(
        'A target record differs. Review it before switching storage. No records were overwritten.',
      );
    checked++;
  }
console.log(
  `Checked ${checked} records; copied ${copied}. No source records deleted. Set CONCIERGE_LEGACY_STORAGE=postgres only after this completes during the write freeze.`,
);
