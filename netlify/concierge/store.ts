/**
 * The concierge's storage port. Production uses Netlify Blobs (blobStore.ts);
 * tests and the local development API use the in-memory store below. Both
 * offer the two conditional writes the service depends on: create-if-new
 * (no duplicate redemption can ever be written) and replace-if-unchanged.
 */

export interface Entry<T> {
  value: T;
  etag: string;
}

export interface KvStore {
  get<T>(key: string): Promise<Entry<T> | null>;
  /** Writes only if `key` does not exist. False when it already did. */
  create(key: string, value: unknown): Promise<boolean>;
  /** Writes only if the entry still has `etag`. False when it changed. */
  replace(key: string, value: unknown, etag: string): Promise<boolean>;
  put(key: string, value: unknown): Promise<void>;
  /** Keys starting with `prefix`. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

export interface MemoryStore extends KvStore {
  dump(): Record<string, unknown>;
}

export function memoryStore(): MemoryStore {
  const data = new Map<string, { json: string; etag: string }>();
  let version = 0;
  const write = (key: string, value: unknown) => {
    version += 1;
    data.set(key, { json: JSON.stringify(value), etag: `"m${version}"` });
  };
  return {
    async get<T>(key: string) {
      const found = data.get(key);
      return found
        ? { value: JSON.parse(found.json) as T, etag: found.etag }
        : null;
    },
    async create(key, value) {
      if (data.has(key)) return false;
      write(key, value);
      return true;
    },
    async replace(key, value, etag) {
      if (data.get(key)?.etag !== etag) return false;
      write(key, value);
      return true;
    },
    async put(key, value) {
      write(key, value);
    },
    async list(prefix) {
      return [...data.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
    async remove(key) {
      data.delete(key);
    },
    dump() {
      return Object.fromEntries(
        [...data].map(([key, { json }]) => [key, JSON.parse(json)]),
      );
    },
  };
}
