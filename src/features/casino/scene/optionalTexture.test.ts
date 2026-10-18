import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { loadOptional } from './optionalTexture';

const loader = (impl: (url: string) => Promise<unknown>) =>
  ({ loadAsync: impl }) as unknown as THREE.TextureLoader;

describe('optional bespoke textures', () => {
  it('gives null when no asset is registered', async () => {
    const never = loader(() => Promise.reject(new Error('must not be called')));
    expect(await loadOptional(never, null, 4)).toBeNull();
    expect(await loadOptional(never, undefined, 4)).toBeNull();
    expect(await loadOptional(never, '', 4)).toBeNull();
  });

  it('falls back quietly when a file is missing or fails', async () => {
    expect(
      await loadOptional(
        loader(() => Promise.reject(new Error('404'))),
        '/x.webp',
        4,
      ),
    ).toBeNull();
  });

  it('prepares a texture that loads', async () => {
    const texture = { colorSpace: '', anisotropy: 1 };
    const result = await loadOptional(
      loader(() => Promise.resolve(texture)),
      '/ok.webp',
      8,
    );
    expect(result).toBe(texture);
    expect(texture.anisotropy).toBe(8);
    expect(texture.colorSpace).toBe('srgb');
  });
});
