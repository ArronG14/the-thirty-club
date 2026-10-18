import { getStore } from '@netlify/blobs';
import type { KvStore } from './store.ts';

/**
 * Netlify Blobs adapter. Strong consistency, because a redemption written by
 * one invocation must be visible to the very next one.
 */
export function blobStore(name = 'concierge'): KvStore {
  const store = getStore({ name, consistency: 'strong' });
  return {
    async get<T>(key: string) {
      const found = await store.getWithMetadata(key, { type: 'json' });
      if (!found) return null;
      return { value: found.data as T, etag: found.etag ?? '' };
    },
    async create(key, value) {
      const result = await store.setJSON(key, value, { onlyIfNew: true });
      return result.modified;
    },
    async replace(key, value, etag) {
      const result = await store.setJSON(key, value, { onlyIfMatch: etag });
      return result.modified;
    },
    async put(key, value) {
      await store.setJSON(key, value);
    },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((blob) => blob.key).sort();
    },
    async remove(key) {
      await store.delete(key);
    },
  };
}
