/**
 * The Members' Lounge, modelled in metres: +y up, the hearth wall at the
 * back (−z), the viewer arriving from +z through the entrance doors.
 *
 * The hearth wall is a triptych read in one portrait frame: the Members'
 * Directory on the left, the fireplace in the middle, the doorway to the
 * Private Screening Room on the right. Static pieces are merged per
 * material after construction.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  bevelled,
  box,
  mesh,
  metricBox,
} from '../../entrance/scene/architecture';
import { glowTexture } from '../../entrance/scene/canvasTextures';
import type { Materials } from '../../entrance/scene/materials';
import {
  corridorTexture,
  directoryTexture,
  flameMaterial,
  marbleTexture,
  parquetTexture,
  plaqueTexture,
  rugTexture,
  silkRoughness,
  sunburstAlpha,
} from './loungeTextures';

export const HALF_W = 3;
export const BACK = -4.6;
export const FRONT = 5;
export const HEIGHT = 4.2;
/** Chimney breast: protrudes from the back wall. */
const BREAST_HALF = 1.15;
export const BREAST_FACE = BACK + 0.35;
/** Fire opening. */
const FIRE_HALF = 0.48;
const FIRE_H = 0.8;
/** The screening-room doorway in the right flank. */
export const DOOR_X = 1.98;
const DOOR_HALF = 0.45;
const DOOR_H = 2.55;
/** The directory board in the left flank. */
export const DIRECTORY_X = -1.98;
/** Centre of the seating group. */
export const SEATING_Z = -1.9;

export interface LoungeMaterials {
  walnut: THREE.MeshPhysicalMaterial;
  darkWalnut: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
  brassPolished: THREE.MeshStandardMaterial;
  silk: THREE.MeshStandardMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  cushion: THREE.MeshPhysicalMaterial;
  parquet: THREE.MeshPhysicalMaterial;
  marble: THREE.MeshPhysicalMaterial;
  rug: THREE.MeshStandardMaterial;
  soot: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  bottle: THREE.MeshPhysicalMaterial;
  shade: THREE.MeshStandardMaterial;
  ember: THREE.MeshStandardMaterial;
  crystal: THREE.MeshStandardMaterial;
}

export function createLoungeMaterials(
  base: Materials,
  walnutImage: CanvasImageSource,
  anisotropy: number,
): LoungeMaterials {
  const parquet = parquetTexture(walnutImage);
  parquet.repeat.set(1 / 1.2, 1 / 1.2);
  parquet.anisotropy = anisotropy;
  const marble = marbleTexture();
  marble.repeat.set(1 / 1.4, 1 / 1.4);
  const silk = silkRoughness();
  silk.repeat.set(1 / 0.5, 1);
  return {
    walnut: base.walnut,
    darkWalnut: (() => {
      const m = base.walnut.clone();
      m.color.set(0x4a3a32);
      return m;
    })(),
    brass: base.brass,
    brassPolished: base.brassPolished,
    silk: new THREE.MeshStandardMaterial({
      color: 0x4c1420,
      roughness: 0.75,
      roughnessMap: silk,
      metalness: 0,
    }),
    velvet: new THREE.MeshPhysicalMaterial({
      color: 0x2c0610,
      roughness: 0.92,
      sheen: 0.8,
      sheenColor: new THREE.Color(0x8a3a48),
      sheenRoughness: 0.3,
    }),
    cushion: new THREE.MeshPhysicalMaterial({
      color: 0x8a6a48,
      roughness: 0.6,
      sheen: 1,
      sheenColor: new THREE.Color(0xf0d8a8),
      sheenRoughness: 0.3,
    }),
    parquet: new THREE.MeshPhysicalMaterial({
      map: parquet,
      color: 0xb09080,
      roughness: 0.62,
      clearcoat: 0.35,
      clearcoatRoughness: 0.45,
    }),
    marble: new THREE.MeshPhysicalMaterial({
      map: marble,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
    }),
    rug: new THREE.MeshStandardMaterial({
      map: rugTexture(),
      roughness: 1,
    }),
    soot: new THREE.MeshStandardMaterial({ color: 0x0c0807, roughness: 1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.14,
      metalness: 0,
      transparent: true,
      opacity: 0.28,
      clearcoat: 1,
      depthWrite: false,
    }),
    bottle: new THREE.MeshPhysicalMaterial({
      color: 0x0e1a12,
      roughness: 0.18,
      clearcoat: 1,
    }),
    shade: new THREE.MeshStandardMaterial({
      color: 0xe8d4b4,
      emissive: 0xffa860,
      emissiveIntensity: 0.55,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }),
    ember: new THREE.MeshStandardMaterial({
      color: 0x1a0c08,
      emissive: 0xff4a10,
      emissiveIntensity: 1.2,
      roughness: 1,
    }),
    crystal: new THREE.MeshStandardMaterial({
      color: 0xffe6c0,
      emissive: 0xffc27a,
      emissiveIntensity: 0.75,
      roughness: 0.2,
    }),
  };
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

/** A wall plane with UVs in metres, facing +z before rotation. */
function wallPlane(
  parent: THREE.Object3D,
  material: THREE.Material,
  w: number,
  h: number,
  position: [number, number, number],
  rotationY = 0,
) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1)
    uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  const m = mesh(g, material);
  m.castShadow = false;
  m.position.set(...position);
  m.rotation.y = rotationY;
  parent.add(m);
  return m;
}

function rounded(
  parent: THREE.Object3D,
  material: THREE.Material,
  [w, h, d]: [number, number, number],
  [x, y, z]: [number, number, number],
  radius: number,
) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  height: number,
  [x, y, z]: [number, number, number],
  segments = 16,
) {
  const m = mesh(
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material,
  );
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Additive light pool laid on a surface: cheap "bounced" light. */
export function lightPool(
  parent: THREE.Object3D,
  size: [number, number],
  position: [number, number, number],
  rotation: [number, number, number],
  colour: THREE.ColorRepresentation,
  opacity: number,
) {
  const material = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color: colour,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(...size), material);
  m.position.set(...position);
  m.rotation.set(...rotation);
  m.renderOrder = 2;
  parent.add(m);
  return material;
}

function halo(
  parent: THREE.Object3D,
  scale: number,
  position: [number, number, number],
  opacity = 0.6,
) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0xffd2a0,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale, 1);
  sprite.position.set(...position);
  parent.add(sprite);
  return material;
}

/* ---------------------------------------------------------------- */
/* Shell: floor, walls, ceiling                                      */
/* ---------------------------------------------------------------- */

const DADO = 1.0;
const CORNICE = 3.7;

/** Walnut dado, silk field and cornice for one wall run. */
function panelledRun(
  parent: THREE.Object3D,
  m: LoungeMaterials,
  x0: number,
  x1: number,
  top: number,
  bottom = 0,
) {
  const w = x1 - x0;
  const cx = (x0 + x1) / 2;
  if (bottom < DADO) {
    box(
      parent,
      m.walnut,
      [w, DADO - bottom, 0.05],
      [cx, (DADO + bottom) / 2, 0.025],
    );
    box(parent, m.brassPolished, [w, 0.012, 0.03], [cx, DADO, 0.06]);
    box(parent, m.darkWalnut, [w, 0.16, 0.07], [cx, 0.08 + bottom, 0.035]);
  }
  const silkFrom = Math.max(DADO, bottom);
  if (top > silkFrom) {
    wallPlane(parent, m.silk, w, Math.min(top, CORNICE) - silkFrom, [
      cx,
      (Math.min(top, CORNICE) + silkFrom) / 2,
      0.001,
    ]);
  }
  if (top > CORNICE) {
    box(
      parent,
      m.walnut,
      [w, top - CORNICE, 0.08],
      [cx, (top + CORNICE) / 2, 0.04],
    );
    box(parent, m.brassPolished, [w, 0.014, 0.05], [cx, CORNICE + 0.02, 0.09]);
    box(parent, m.darkWalnut, [w, 0.1, 0.16], [cx, CORNICE + 0.12, 0.08]);
  }
}

/** A fluted walnut pilaster with brass reeds. */
function pilaster(parent: THREE.Object3D, m: LoungeMaterials, x: number) {
  box(parent, m.walnut, [0.26, CORNICE, 0.09], [x, CORNICE / 2, 0.045]);
  for (const dx of [-0.07, 0, 0.07]) {
    box(
      parent,
      m.brassPolished,
      [0.012, CORNICE - 0.6, 0.012],
      [x + dx, CORNICE / 2 + 0.1, 0.095],
    );
  }
  box(parent, m.darkWalnut, [0.32, 0.22, 0.12], [x, 0.11, 0.06]);
}

export function buildShell(scene: THREE.Object3D, m: LoungeMaterials) {
  // Parquet floor with UVs in metres.
  const floorG = new THREE.PlaneGeometry(HALF_W * 2, FRONT - BACK + 2);
  const uv = floorG.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1)
    uv.setXY(i, uv.getX(i) * HALF_W * 2, uv.getY(i) * (FRONT - BACK + 2));
  const floor = mesh(floorG, m.parquet);
  floor.castShadow = false;
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (FRONT + BACK) / 2 + 1;
  scene.add(floor);

  // Back wall flanks either side of the chimney breast.
  const back = new THREE.Group();
  back.position.z = BACK;
  scene.add(back);
  panelledRun(back, m, -HALF_W, -BREAST_HALF, HEIGHT);
  panelledRun(back, m, BREAST_HALF, DOOR_X - DOOR_HALF - 0.12, HEIGHT);
  panelledRun(back, m, DOOR_X + DOOR_HALF + 0.12, HALF_W, HEIGHT);
  panelledRun(
    back,
    m,
    DOOR_X - DOOR_HALF - 0.12,
    DOOR_X + DOOR_HALF + 0.12,
    HEIGHT,
    DOOR_H + 0.14,
  );

  // Side walls, panelled in bays.
  for (const side of [-1, 1]) {
    const wall = new THREE.Group();
    wall.position.x = side * HALF_W;
    wall.rotation.y = -side * (Math.PI / 2);
    scene.add(wall);
    const span = FRONT - BACK;
    panelledRun(wall, m, -span / 2, span / 2, HEIGHT);
    wall.position.z = (FRONT + BACK) / 2;
    for (let z = -span / 2 + 1.1; z < span / 2; z += 2.2) pilaster(wall, m, z);
  }
  for (const x of [-BREAST_HALF - 0.13, BREAST_HALF + 0.13]) {
    const g = new THREE.Group();
    g.position.set(x, 0, BACK);
    scene.add(g);
    pilaster(g, m, 0);
  }

  // Coffered ceiling: dark field, walnut beams edged in brass.
  const ceiling = wallPlane(scene, m.darkWalnut, HALF_W * 2, FRONT - BACK, [
    0,
    HEIGHT,
    (FRONT + BACK) / 2,
  ]);
  ceiling.rotation.x = Math.PI / 2;
  for (let x = -HALF_W + 1.5; x < HALF_W; x += 1.5) {
    box(
      scene,
      m.walnut,
      [0.16, 0.18, FRONT - BACK],
      [x, HEIGHT - 0.09, (FRONT + BACK) / 2],
    );
    box(
      scene,
      m.brassPolished,
      [0.02, 0.01, FRONT - BACK],
      [x, HEIGHT - 0.185, (FRONT + BACK) / 2],
    );
  }
  for (let z = BACK + 1.6; z < FRONT; z += 1.6) {
    box(scene, m.walnut, [HALF_W * 2, 0.18, 0.16], [0, HEIGHT - 0.09, z]);
    box(
      scene,
      m.brassPolished,
      [HALF_W * 2, 0.01, 0.02],
      [0, HEIGHT - 0.185, z],
    );
  }
}

/* ---------------------------------------------------------------- */
/* Hearth                                                            */
/* ---------------------------------------------------------------- */

export function buildHearth(scene: THREE.Object3D, m: LoungeMaterials) {
  const depth = BREAST_FACE - BACK;
  const zc = BACK + depth / 2;
  // Chimney breast built around the fire opening.
  const sideW = BREAST_HALF - FIRE_HALF;
  for (const s of [-1, 1]) {
    box(
      scene,
      m.walnut,
      [sideW, HEIGHT, depth],
      [s * (FIRE_HALF + sideW / 2), HEIGHT / 2, zc],
    );
  }
  box(
    scene,
    m.walnut,
    [FIRE_HALF * 2, HEIGHT - FIRE_H, depth],
    [0, (HEIGHT + FIRE_H) / 2, zc],
  );

  // Firebox, blackened.
  const inner = 0.3;
  box(
    scene,
    m.soot,
    [FIRE_HALF * 2, FIRE_H, 0.02],
    [0, FIRE_H / 2, BREAST_FACE - inner],
  );
  for (const s of [-1, 1]) {
    const side = box(
      scene,
      m.soot,
      [0.02, FIRE_H, inner],
      [s * (FIRE_HALF - 0.01), FIRE_H / 2, BREAST_FACE - inner / 2],
    );
    side.rotation.y = s * 0.25;
  }
  box(
    scene,
    m.soot,
    [FIRE_HALF * 2, 0.02, inner],
    [0, FIRE_H - 0.01, BREAST_FACE - inner / 2],
  );

  // Marble surround, mantel and hearth slab.
  const face = BREAST_FACE + 0.05;
  const surroundH = 1.22;
  const jamb = 0.42;
  for (const s of [-1, 1]) {
    box(
      scene,
      m.marble,
      [jamb, surroundH, 0.1],
      [s * (FIRE_HALF + jamb / 2), surroundH / 2, face],
    );
    // Deco stepped console under the mantel.
    box(
      scene,
      m.marble,
      [0.16, 0.08, 0.14],
      [s * (FIRE_HALF + jamb - 0.1), surroundH - 0.04, face + 0.03],
    );
  }
  box(
    scene,
    m.marble,
    [FIRE_HALF * 2, surroundH - FIRE_H, 0.1],
    [0, (surroundH + FIRE_H) / 2, face],
  );
  box(
    scene,
    m.marble,
    [2.16, 0.06, 0.32],
    [0, surroundH + 0.03, BREAST_FACE + 0.16],
  );
  box(
    scene,
    m.marble,
    [2.04, 0.03, 0.28],
    [0, surroundH + 0.075, BREAST_FACE + 0.14],
  );
  box(scene, m.marble, [2.3, 0.05, 0.6], [0, 0.025, BREAST_FACE + 0.3]);
  // Brass bead framing the opening, and a low brass fender.
  for (const s of [-1, 1]) {
    box(
      scene,
      m.brassPolished,
      [0.02, FIRE_H, 0.02],
      [s * (FIRE_HALF + 0.01), FIRE_H / 2, face + 0.055],
    );
    box(
      scene,
      m.brassPolished,
      [0.02, 0.12, 0.02],
      [s * 1.05, 0.11, BREAST_FACE + 0.58],
    );
  }
  box(
    scene,
    m.brassPolished,
    [FIRE_HALF * 2 + 0.04, 0.02, 0.02],
    [0, FIRE_H + 0.01, face + 0.055],
  );
  box(
    scene,
    m.brassPolished,
    [2.12, 0.025, 0.025],
    [0, 0.17, BREAST_FACE + 0.58],
  );

  // Logs and embers.
  const logs = new THREE.Group();
  logs.position.set(0, 0.1, BREAST_FACE - 0.15);
  scene.add(logs);
  for (const [x, rz, ry] of [
    [-0.12, 0.06, 0.15],
    [0.14, -0.05, -0.2],
    [0, 0.0, 1.45],
  ] as const) {
    const log = mesh(
      new THREE.CylinderGeometry(0.06, 0.07, 0.62, 10),
      m.ember,
      true,
    );
    log.rotation.set(0, ry, Math.PI / 2 + rz);
    log.position.set(x, ry > 1 ? 0.09 : 0, ry > 1 ? -0.05 : 0);
    logs.add(log);
  }
  // Andirons.
  for (const s of [-1, 1]) {
    box(
      scene,
      m.brassPolished,
      [0.03, 0.22, 0.03],
      [s * 0.3, 0.13, BREAST_FACE - 0.04],
    );
  }

  // Flames: crossed planes, additive.
  const flame = flameMaterial();
  const flames: THREE.Mesh[] = [];
  for (const [ry, x, s] of [
    [0.35, -0.08, 1],
    [-0.4, 0.1, 0.9],
    [0, 0, 1.1],
  ] as const) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.62 * s, 0.6 * s), flame);
    f.position.set(x, 0.12 + 0.3 * s, BREAST_FACE - 0.14);
    f.rotation.y = ry;
    f.renderOrder = 3;
    scene.add(f);
    flames.push(f);
  }
  const fireGlow = halo(scene, 1.1, [0, 0.36, BREAST_FACE + 0.05], 0.2);
  fireGlow.color.set(0xff9a50);
  const hearthPool = lightPool(
    scene,
    [3.2, 2.6],
    [0, 0.012, BREAST_FACE + 1.1],
    [-Math.PI / 2, 0, 0],
    0xff9a50,
    0.32,
  );

  // Overmantel: walnut panel with the rising-sun inlay in brass.
  const panelW = 1.5;
  const panelH = 1.9;
  const panelY = surroundH + 0.25 + panelH / 2;
  const panel = mesh(bevelled(panelW, panelH, 0.04, 0.012), m.walnut);
  panel.position.set(0, panelY, BREAST_FACE);
  scene.add(panel);
  const inlayMat = m.brassPolished.clone();
  inlayMat.alphaMap = sunburstAlpha();
  inlayMat.alphaTest = 0.5;
  const inlay = mesh(
    new THREE.PlaneGeometry(panelW - 0.1, panelH - 0.1),
    inlayMat,
  );
  inlay.castShadow = false;
  inlay.position.set(0, panelY, BREAST_FACE + 0.041);
  scene.add(inlay);
  // Picture light above.
  const bar = mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.7, 16),
    m.brassPolished,
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, panelY + panelH / 2 + 0.14, BREAST_FACE + 0.16);
  scene.add(bar);
  box(
    scene,
    m.brassPolished,
    [0.03, 0.03, 0.16],
    [0, panelY + panelH / 2 + 0.1, BREAST_FACE + 0.08],
  );
  lightPool(
    scene,
    [1.9, 1.4],
    [0, panelY + 0.45, BREAST_FACE + 0.045],
    [0, 0, 0],
    0xffd2a0,
    0.22,
  );

  // Fan sconces either side of the overmantel.
  const sconceGlow: THREE.SpriteMaterial[] = [];
  for (const s of [-1, 1]) {
    const x = s * 1.03;
    const y = 2.5;
    box(scene, m.brassPolished, [0.08, 0.36, 0.02], [x, y, BREAST_FACE + 0.01]);
    const shade = mesh(
      new THREE.CylinderGeometry(
        0.13,
        0.045,
        0.18,
        20,
        1,
        true,
        -Math.PI / 2,
        Math.PI,
      ),
      m.shade,
    );
    shade.castShadow = false;
    shade.position.set(x, y + 0.13, BREAST_FACE + 0.03);
    scene.add(shade);
    sconceGlow.push(halo(scene, 0.9, [x, y + 0.2, BREAST_FACE + 0.12], 0.5));
    lightPool(
      scene,
      [1.0, 1.6],
      [x, y + 0.25, BREAST_FACE + 0.005],
      [0, 0, 0],
      0xffc890,
      0.28,
    );
  }

  return {
    flames,
    flameMaterial: flame,
    fireGlow,
    hearthPool,
    sconceGlow,
    firePosition: new THREE.Vector3(0, 0.45, BREAST_FACE + 0.05),
    pictureLight: new THREE.Vector3(
      0,
      panelY + panelH / 2 + 0.1,
      BREAST_FACE + 0.2,
    ),
    overmantel: new THREE.Vector3(0, panelY, BREAST_FACE),
  };
}

/* ---------------------------------------------------------------- */
/* The Members' Directory and the screening-room doorway             */
/* ---------------------------------------------------------------- */

export function buildDirectory(
  scene: THREE.Object3D,
  m: LoungeMaterials,
  names: readonly string[],
) {
  const g = new THREE.Group();
  g.position.set(DIRECTORY_X, 1.6, BACK);
  scene.add(g);
  const frame = mesh(bevelled(0.9, 1.26, 0.06, 0.015), m.walnut);
  g.add(frame);
  const board = mesh(
    new THREE.PlaneGeometry(0.72, 1.08),
    new THREE.MeshStandardMaterial({
      map: directoryTexture(names),
      metalness: 0.9,
      roughness: 0.38,
      emissive: 0x3a2610,
      emissiveIntensity: 0.1,
    }),
  );
  board.castShadow = false;
  board.position.z = 0.062;
  g.add(board);
  // Picture light.
  const bar = mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.5, 12),
    m.brassPolished,
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 0.76, 0.16);
  g.add(bar);
  box(g, m.brassPolished, [0.025, 0.025, 0.14], [0, 0.72, 0.08]);
  const glow = lightPool(
    g,
    [1.1, 1.5],
    [0, 0.1, 0.065],
    [0, 0, 0],
    0xffd8a8,
    0.1,
  );
  const target = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  target.position.z = 0.08;
  g.add(target);
  return {
    target,
    glow,
    label: new THREE.Vector3(DIRECTORY_X, 2.55, BACK + 0.1),
  };
}

function curtain(
  m: LoungeMaterials,
  width: number,
  height: number,
  side: number,
) {
  const g = new THREE.PlaneGeometry(width, height, 28, 24);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const tie = -height / 2 + 1.0;
  const outer = (side * width) / 2;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Gathered towards the outer edge at the tie-back, falling free below.
    const gather = 0.42 + 0.58 * Math.min(1, Math.abs(y - tie) / 1.1);
    const u = x / width + 0.5;
    const fold = Math.sin(u * Math.PI * 7) * 0.04 * (1.3 - gather * 0.5);
    pos.setXYZ(i, outer - (outer - x) * gather, y, fold);
  }
  g.computeVertexNormals();
  return mesh(g, m.velvet);
}

export function buildDoorway(
  scene: THREE.Object3D,
  m: LoungeMaterials,
  name: string,
) {
  const x0 = DOOR_X - DOOR_HALF;
  const x1 = DOOR_X + DOOR_HALF;
  // Walnut architrave with a brass bead.
  for (const x of [x0 - 0.06, x1 + 0.06]) {
    box(
      scene,
      m.walnut,
      [0.12, DOOR_H + 0.12, 0.1],
      [x, (DOOR_H + 0.12) / 2, BACK + 0.05],
    );
    box(
      scene,
      m.brassPolished,
      [0.012, DOOR_H, 0.012],
      [x + (x < DOOR_X ? 0.055 : -0.055), DOOR_H / 2, BACK + 0.1],
    );
  }
  box(
    scene,
    m.walnut,
    [DOOR_HALF * 2 + 0.24, 0.14, 0.1],
    [DOOR_X, DOOR_H + 0.07, BACK + 0.05],
  );
  // Velvet pelmet and drapes, tied back.
  rounded(
    scene,
    m.velvet,
    [DOOR_HALF * 2 + 0.2, 0.2, 0.14],
    [DOOR_X, DOOR_H - 0.06, BACK + 0.14],
    0.04,
  );
  for (const side of [-1, 1]) {
    const c = curtain(m, 0.42, DOOR_H - 0.12, side);
    c.position.set(
      DOOR_X + side * (DOOR_HALF - 0.12),
      (DOOR_H - 0.12) / 2,
      BACK + 0.13,
    );
    scene.add(c);
    rounded(
      scene,
      m.brass,
      [0.05, 0.05, 0.05],
      [DOOR_X + side * (DOOR_HALF - 0.02), 1.0, BACK + 0.16],
      0.02,
    );
  }
  // Plaque.
  const plaque = mesh(
    new THREE.PlaneGeometry(0.66, 0.124),
    new THREE.MeshStandardMaterial({
      map: plaqueTexture(name),
      metalness: 0.9,
      roughness: 0.35,
      emissive: 0x4a3016,
      emissiveIntensity: 0.4,
    }),
  );
  plaque.castShadow = false;
  plaque.position.set(DOOR_X, DOOR_H + 0.32, BACK + 0.02);
  scene.add(plaque);

  // The passage beyond: a short corridor towards the screening room.
  const deep = 1.8;
  const corridorMat = new THREE.MeshBasicMaterial({
    map: corridorTexture(),
    color: 0x666666,
  });
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_HALF * 2, DOOR_H),
    corridorMat,
  );
  far.position.set(DOOR_X, DOOR_H / 2, BACK - deep);
  scene.add(far);
  for (const x of [x0, x1]) {
    wallPlane(
      scene,
      m.silk,
      deep,
      DOOR_H,
      [x, DOOR_H / 2, BACK - deep / 2],
      x < DOOR_X ? Math.PI / 2 : -Math.PI / 2,
    );
  }
  const corridorTop = wallPlane(scene, m.soot, DOOR_HALF * 2, deep, [
    DOOR_X,
    DOOR_H,
    BACK - deep / 2,
  ]);
  corridorTop.rotation.x = Math.PI / 2;
  const corridorFloor = wallPlane(scene, m.rug, DOOR_HALF * 2, deep, [
    DOOR_X,
    0.002,
    BACK - deep / 2,
  ]);
  corridorFloor.rotation.x = -Math.PI / 2;
  const spill = lightPool(
    scene,
    [1.6, 2.0],
    [DOOR_X, 0.014, BACK + 0.8],
    [-Math.PI / 2, 0, 0],
    0xffc890,
    0,
  );
  const target = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_HALF * 2 + 0.3, DOOR_H + 0.5),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  target.position.set(DOOR_X, (DOOR_H + 0.5) / 2, BACK + 0.2);
  scene.add(target);
  return {
    target,
    corridor: corridorMat,
    spill,
    light: new THREE.Vector3(DOOR_X, 1.7, BACK - 1.2),
    label: new THREE.Vector3(DOOR_X, DOOR_H + 0.62, BACK + 0.1),
  };
}

/* ---------------------------------------------------------------- */
/* Furniture                                                         */
/* ---------------------------------------------------------------- */

/** A deep velvet sofa; its seat faces +x before rotation. */
function sofa(m: LoungeMaterials) {
  const g = new THREE.Group();
  const L = 2.1;
  const D = 0.92;
  rounded(g, m.velvet, [D, 0.26, L], [0, 0.22, 0], 0.05);
  for (let i = 0; i < 3; i += 1) {
    const z = -L / 2 + 0.2 + (i + 0.5) * ((L - 0.4) / 3);
    rounded(
      g,
      m.velvet,
      [0.66, 0.16, (L - 0.4) / 3 - 0.015],
      [0.1, 0.42, z],
      0.06,
    );
    const back = rounded(
      g,
      m.velvet,
      [0.22, 0.42, (L - 0.4) / 3 - 0.02],
      [-0.27, 0.66, z],
      0.08,
    );
    back.rotation.z = -0.12;
  }
  rounded(g, m.velvet, [0.2, 0.52, L], [-0.36, 0.58, 0], 0.08);
  for (const s of [-1, 1]) {
    rounded(g, m.velvet, [D, 0.46, 0.2], [0, 0.48, s * (L / 2 - 0.1)], 0.09);
    const roll = mesh(new THREE.CylinderGeometry(0.11, 0.11, D, 20), m.velvet);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.7, s * (L / 2 - 0.1));
    g.add(roll);
    for (const x of [-D / 2 + 0.08, D / 2 - 0.08]) {
      cylinder(
        g,
        m.brassPolished,
        0.018,
        0.1,
        [x, 0.05, s * (L / 2 - 0.08)],
        10,
      );
    }
  }
  // Two silk cushions.
  for (const z of [-0.55, 0.5]) {
    const c = rounded(g, m.cushion, [0.12, 0.38, 0.4], [-0.08, 0.66, z], 0.06);
    c.rotation.set(0, 0, -0.32);
  }
  return g;
}

function lathe(points: [number, number][], segments = 24) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

function sideTable(
  parent: THREE.Object3D,
  m: LoungeMaterials,
  x: number,
  z: number,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  cylinder(g, m.marble, 0.24, 0.035, [0, 0.56, 0], 28);
  cylinder(g, m.brassPolished, 0.02, 0.54, [0, 0.27, 0], 12);
  cylinder(g, m.brassPolished, 0.16, 0.02, [0, 0.01, 0], 24);
  // Lamp: brass column and a pleated linen drum.
  g.add(
    mesh(
      lathe([
        [0.0, 0.58],
        [0.08, 0.58],
        [0.07, 0.62],
        [0.03, 0.66],
        [0.022, 0.92],
        [0.0, 0.92],
      ]),
      m.brassPolished,
    ),
  );
  const shade = mesh(
    new THREE.CylinderGeometry(0.13, 0.19, 0.24, 28, 1, true),
    m.shade,
  );
  shade.castShadow = false;
  shade.position.y = 1.0;
  g.add(shade);
  const glow = halo(g, 0.7, [0, 1.0, 0], 0.22);
  const pool = lightPool(
    g,
    [1.6, 1.6],
    [0, 0.015, 0],
    [-Math.PI / 2, 0, 0],
    0xffbc80,
    0.3,
  );
  return { glow, pool, light: new THREE.Vector3(x, 0.98, z) };
}

export function buildFurniture(scene: THREE.Object3D, m: LoungeMaterials) {
  // Rug.
  const rug = mesh(new THREE.PlaneGeometry(2.9, 3.9), m.rug);
  rug.castShadow = false;
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.006, SEATING_Z - 0.1);
  scene.add(rug);

  for (const side of [-1, 1]) {
    const s = sofa(m);
    s.position.set(side * 1.62, 0, SEATING_Z);
    s.rotation.y = side < 0 ? 0 : Math.PI;
    scene.add(s);
  }

  // Coffee table: marble top on a brass frame.
  const table = new THREE.Group();
  table.position.set(0, 0, SEATING_Z);
  scene.add(table);
  rounded(table, m.marble, [0.72, 0.05, 1.3], [0, 0.42, 0], 0.02);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      box(
        table,
        m.brassPolished,
        [0.025, 0.38, 0.025],
        [sx * 0.31, 0.2, sz * 0.58],
      );
    }
  for (const sx of [-1, 1])
    box(table, m.brassPolished, [0.02, 0.02, 1.18], [sx * 0.31, 0.08, 0]);
  // Champagne on ice, two coupes, a brass tray.
  rounded(table, m.brassPolished, [0.42, 0.02, 0.56], [0, 0.455, 0.2], 0.008);
  const bucket = mesh(
    lathe([
      [0, 0],
      [0.09, 0],
      [0.1, 0.02],
      [0.115, 0.2],
      [0.125, 0.21],
      [0.12, 0.215],
      [0.105, 0.03],
      [0, 0.03],
    ]),
    m.brassPolished,
  );
  bucket.position.set(0, 0.465, 0.32);
  table.add(bucket);
  const bottle = mesh(
    lathe([
      [0, 0],
      [0.037, 0],
      [0.038, 0.2],
      [0.03, 0.25],
      [0.014, 0.31],
      [0.014, 0.35],
      [0, 0.35],
    ]),
    m.bottle,
  );
  bottle.position.set(0.01, 0.5, 0.31);
  bottle.rotation.z = 0.12;
  table.add(bottle);
  box(table, m.brassPolished, [0.03, 0.04, 0.03], [0.054, 0.845, 0.31]);
  for (const [x, z] of [
    [-0.1, 0.06],
    [0.09, 0.0],
  ] as const) {
    const coupe = mesh(
      lathe(
        [
          [0, 0],
          [0.035, 0],
          [0.008, 0.01],
          [0.006, 0.09],
          [0.012, 0.1],
          [0.055, 0.12],
          [0.06, 0.135],
        ],
        20,
      ),
      m.glass,
      true,
    );
    coupe.castShadow = false;
    coupe.position.set(x, 0.465, z);
    table.add(coupe);
  }
  // Books.
  box(table, m.velvet, [0.22, 0.04, 0.3], [0.05, 0.47, -0.35]);
  box(table, m.cushion, [0.2, 0.03, 0.27], [0.05, 0.505, -0.35]);

  const lamps = [
    sideTable(scene, m, -1.62, SEATING_Z + 1.35),
    sideTable(scene, m, 1.62, SEATING_Z + 1.35),
  ];
  return { lamps };
}

/* ---------------------------------------------------------------- */
/* Chandelier                                                        */
/* ---------------------------------------------------------------- */

export function buildChandelier(scene: THREE.Object3D, m: LoungeMaterials) {
  const g = new THREE.Group();
  g.position.set(0, 0, SEATING_Z);
  scene.add(g);
  cylinder(g, m.brassPolished, 0.012, 0.7, [0, HEIGHT - 0.35, 0], 8);
  rounded(g, m.brassPolished, [0.3, 0.04, 0.3], [0, HEIGHT - 0.2, 0], 0.015);
  const tiers = [
    { r: 0.38, y: 3.08, h: 0.26, n: 24 },
    { r: 0.27, y: 3.2, h: 0.24, n: 18 },
    { r: 0.16, y: 3.32, h: 0.2, n: 12 },
  ];
  const count = tiers.reduce((sum, t) => sum + t.n, 0);
  const rods = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.009, 0.009, 1, 6),
    m.crystal,
    count,
  );
  const matrix = new THREE.Matrix4();
  let i = 0;
  for (const t of tiers) {
    const ring = mesh(
      new THREE.TorusGeometry(t.r, 0.012, 8, 48),
      m.brassPolished,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t.y + t.h / 2;
    g.add(ring);
    for (let k = 0; k < t.n; k += 1) {
      const a = (k / t.n) * Math.PI * 2;
      matrix.compose(
        new THREE.Vector3(Math.cos(a) * t.r, t.y, Math.sin(a) * t.r),
        new THREE.Quaternion(),
        new THREE.Vector3(1, t.h, 1),
      );
      rods.setMatrixAt(i, matrix);
      i += 1;
    }
  }
  rods.castShadow = false;
  g.add(rods);
  const core = halo(g, 1.1, [0, 3.18, 0], 0.45);
  // A faint cone of haze under the chandelier: the room's air made visible.
  // Brightest where the cone faces the viewer, so it has no hard edges.
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 1.3, 2.9, 40, 1, true),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { strength: { value: 0.07 } },
      vertexShader: /* glsl */ `
        varying float vFacing;
        varying float vHeight;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec3 n = normalize(mat3(modelMatrix) * normal);
          vFacing = abs(dot(n, normalize(cameraPosition - world.xyz)));
          vHeight = uv.y;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float strength;
        varying float vFacing;
        varying float vHeight;
        void main() {
          float a = pow(vFacing, 3.0) * vHeight * vHeight * strength;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.6) * a, 1.0);
        }
      `,
    }),
  );
  haze.position.y = 3.0 - 1.45;
  haze.renderOrder = 4;
  g.add(haze);
  const ceilingPool = lightPool(
    g,
    [3.2, 3.2],
    [0, HEIGHT - 0.2, 0],
    [Math.PI / 2, 0, 0],
    0xffcf98,
    0.3,
  );
  return { core, ceilingPool, light: new THREE.Vector3(0, 2.95, SEATING_Z) };
}

/* ---------------------------------------------------------------- */
/* Side-wall sconces (light pools only; no real lights)              */
/* ---------------------------------------------------------------- */

export function buildWallSconces(scene: THREE.Object3D, m: LoungeMaterials) {
  for (const side of [-1, 1]) {
    for (const z of [-2.4, 0.0, 2.4]) {
      const x = side * (HALF_W - 0.02);
      const g = new THREE.Group();
      g.position.set(x, 2.3, z);
      g.rotation.y = -side * (Math.PI / 2);
      scene.add(g);
      g.add(mesh(metricBox(0.08, 0.34, 0.02), m.brassPolished));
      const shade = mesh(
        new THREE.CylinderGeometry(
          0.12,
          0.045,
          0.17,
          18,
          1,
          true,
          -Math.PI / 2,
          Math.PI,
        ),
        m.shade,
      );
      shade.castShadow = false;
      shade.position.set(0, 0.13, 0.02);
      g.add(shade);
      halo(g, 0.8, [0, 0.2, 0.1], 0.45);
      lightPool(g, [1.0, 1.7], [0, 0.2, 0.01], [0, 0, 0], 0xffc890, 0.26);
    }
  }
}

/** Warm interior environment for reflections on brass, lacquer and glass. */
export function loungeEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0505);
  const glow = (
    w: number,
    h: number,
    p: [number, number, number],
    c: THREE.Color,
  ) => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }),
    );
    plane.position.set(...p);
    plane.lookAt(0, 0, 0);
    env.add(plane);
  };
  glow(2, 1, [0, -0.5, -4], new THREE.Color(2.6, 1.1, 0.35)); // the fire
  glow(1.5, 1.5, [0, 3.5, 0], new THREE.Color(2.0, 1.4, 0.8)); // chandelier
  glow(1, 1, [-3, 1, 1.5], new THREE.Color(1.6, 1.0, 0.55)); // lamps
  glow(1, 1, [3, 1, 1.5], new THREE.Color(1.6, 1.0, 0.55));
  glow(8, 3, [0, 1, 5], new THREE.Color(0.32, 0.1, 0.12)); // oxblood walls
  glow(8, 3, [-5, 1, 0], new THREE.Color(0.28, 0.08, 0.1));
  glow(8, 3, [5, 1, 0], new THREE.Color(0.28, 0.08, 0.1));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  env.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return target;
}
