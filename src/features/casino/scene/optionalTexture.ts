import * as THREE from 'three';

/**
 * Loads an optional bespoke texture. No URL, or any failure, gives `null`
 * and the caller keeps its procedural stand-in: a missing asset must never
 * break the room.
 */
export async function loadOptional(
  loader: THREE.TextureLoader,
  url: string | null | undefined,
  anisotropy: number,
): Promise<THREE.Texture | null> {
  if (!url) return null;
  try {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    return tex;
  } catch {
    return null; // A missing asset must never break the room.
  }
}
