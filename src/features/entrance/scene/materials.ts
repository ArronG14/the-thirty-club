/**
 * Physically based materials. Wood, stone and marble use CC0 scans from
 * Poly Haven (see assets/CREDITS.md); brass is procedural because metal
 * reads through roughness and reflections rather than colour detail.
 */
import * as THREE from 'three';
import mahoganyDiff from './assets/mahogany_diff.webp?url';
import mahoganyNor from './assets/mahogany_nor.webp?url';
import mahoganyRough from './assets/mahogany_rough.webp?url';
import marbleDiff from './assets/marble_diff.webp?url';
import marbleRough from './assets/marble_rough.webp?url';
import stoneDiff from './assets/stone_diff.webp?url';
import stoneNor from './assets/stone_nor.webp?url';
import stoneRough from './assets/stone_rough.webp?url';
import walnutDiff from './assets/walnut_diff.webp?url';
import walnutNor from './assets/walnut_nor.webp?url';
import walnutRough from './assets/walnut_rough.webp?url';
import { brushedBrassRoughness } from './canvasTextures';

export interface Materials {
  mahogany: THREE.MeshPhysicalMaterial;
  walnut: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
  brassPolished: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  threshold: THREE.MeshStandardMaterial;
  nacre: THREE.MeshPhysicalMaterial;
}

/** Real-world size, in metres, that one tile of each scan covers. */
const SCALE = {
  mahogany: [0.62, 1.5], // 0.5 m scan, drawn out along the grain
  walnut: [0.5, 1.0],
  stone: [1.8, 1.8],
  marble: [1.5, 1.5],
  brass: [0.3, 0.3],
} as const;

async function load(
  loader: THREE.TextureLoader,
  url: string,
  colour: boolean,
  [u, v]: readonly [number, number],
  anisotropy: number,
) {
  const tex = await loader.loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / u, 1 / v);
  tex.anisotropy = anisotropy;
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createMaterials(anisotropy: number): Promise<Materials> {
  const loader = new THREE.TextureLoader();
  const [mhD, mhN, mhR, wnD, wnN, wnR, stD, stN, stR, mbD, mbR] =
    await Promise.all([
      load(loader, mahoganyDiff, true, SCALE.mahogany, anisotropy),
      load(loader, mahoganyNor, false, SCALE.mahogany, anisotropy),
      load(loader, mahoganyRough, false, SCALE.mahogany, anisotropy),
      load(loader, walnutDiff, true, SCALE.walnut, anisotropy),
      load(loader, walnutNor, false, SCALE.walnut, anisotropy),
      load(loader, walnutRough, false, SCALE.walnut, anisotropy),
      load(loader, stoneDiff, true, SCALE.stone, anisotropy),
      load(loader, stoneNor, false, SCALE.stone, anisotropy),
      load(loader, stoneRough, false, SCALE.stone, anisotropy),
      load(loader, marbleDiff, true, SCALE.marble, anisotropy),
      load(loader, marbleRough, false, SCALE.marble, anisotropy),
    ]);
  const brushed = brushedBrassRoughness();
  brushed.repeat.set(1 / SCALE.brass[0], 1 / SCALE.brass[1]);

  const marble = new THREE.MeshStandardMaterial({
    map: mbD,
    roughnessMap: mbR,
    roughness: 0.55,
    transparent: true,
    opacity: 0.74,
  });

  return {
    mahogany: new THREE.MeshPhysicalMaterial({
      color: 0xa8685a,
      map: mhD,
      normalMap: mhN,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: mhR,
      roughness: 0.75,
      clearcoat: 1,
      clearcoatRoughness: 0.13,
    }),
    walnut: new THREE.MeshPhysicalMaterial({
      color: 0x8a776c,
      map: wnD,
      normalMap: wnN,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: wnR,
      roughness: 0.9,
      clearcoat: 0.55,
      clearcoatRoughness: 0.3,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xd0ae6c,
      metalness: 1,
      roughness: 0.85,
      roughnessMap: brushed,
    }),
    brassPolished: new THREE.MeshStandardMaterial({
      color: 0xdcbb78,
      metalness: 1,
      roughness: 0.26,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: 0x8c8682,
      map: stD,
      normalMap: stN,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: stR,
      roughness: 0.95,
    }),
    marble,
    threshold: new THREE.MeshStandardMaterial({
      map: mbD,
      roughnessMap: mbR,
      roughness: 0.4,
    }),
    nacre: new THREE.MeshPhysicalMaterial({
      color: 0xf4ebdd,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.9,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [180, 420],
    }),
  };
}
