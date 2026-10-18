/**
 * The entrance, modelled in metres: +y up, the facade on z = 0, the viewer
 * on +z. Static pieces are merged per material after construction.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  drumShade,
  drumStrip,
  glowTexture,
  interiorTexture,
  letteringTexture,
  medallionTexture,
  reededGlass,
} from './canvasTextures';
import type { Materials } from './materials';

export const DOOR_W = 0.8; // each leaf
export const DOOR_H = 2.85;
export const DOOR_T = 0.075;
export const OPEN_HALF = 1.05;
export const OPEN_H = 3.75;
export const RECESS = 0.55;
export const SCONCE_X = 1.3;

/* ---------------------------------------------------------------- */
/* Geometry helpers                                                  */
/* ---------------------------------------------------------------- */

/** BoxGeometry with UVs in metres so every surface shares a texel scale. */
export function metricBox(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const sizes: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  sizes.forEach(([su, sv], face) => {
    for (let i = face * 4; i < face * 4 + 4; i += 1) {
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  });
  return g;
}

/** A mesh that casts and receives shadow; static unless told otherwise. */
export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  dynamic = false,
) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.static = !dynamic;
  return m;
}

export function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  [w, h, d]: [number, number, number],
  [x, y, z]: [number, number, number],
) {
  const m = mesh(metricBox(w, h, d), material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function rect(path: THREE.Path, x0: number, y0: number, w: number, h: number) {
  path.moveTo(x0, y0);
  path.lineTo(x0 + w, y0);
  path.lineTo(x0 + w, y0 + h);
  path.lineTo(x0, y0 + h);
  path.closePath();
  return path;
}

/** A raised, bevelled panel or plate (front face at z = depth). */
export function bevelled(
  w: number,
  h: number,
  depth: number,
  bevel: number,
  holes: THREE.Path[] = [],
) {
  const s = rect(new THREE.Shape(), -w / 2, -h / 2, w, h) as THREE.Shape;
  s.holes.push(...holes);
  return new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 6,
  });
}

/** U-shaped frame standing on the floor around an opening. */
function uFrame(
  innerHalf: number,
  innerH: number,
  border: number,
  depth: number,
  bevel: number,
) {
  const o = innerHalf + border;
  const s = new THREE.Shape();
  s.moveTo(-o, 0);
  s.lineTo(-o, innerH + border);
  s.lineTo(o, innerH + border);
  s.lineTo(o, 0);
  s.lineTo(innerHalf, 0);
  s.lineTo(innerHalf, innerH);
  s.lineTo(-innerHalf, innerH);
  s.lineTo(-innerHalf, 0);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: depth - bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
  });
}

/**
 * Bakes every static descendant of `root` into one mesh per material,
 * expressed in `root`'s local space. Cuts draw calls by roughly 5×.
 */
export function mergeStatic(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const merged: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.userData.static) return;
    merged.push(child);
  });
  for (const child of merged) {
    const material = child.material as THREE.Material;
    let g = child.geometry.index
      ? child.geometry.toNonIndexed()
      : child.geometry.clone();
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
    g = g.applyMatrix4(
      new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld),
    );
    const list = buckets.get(material) ?? [];
    list.push(g);
    buckets.set(material, list);
    child.removeFromParent();
    child.geometry.dispose();
  }
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
}

/* ---------------------------------------------------------------- */
/* Facade, recess and surround                                       */
/* ---------------------------------------------------------------- */

export function buildFacade(scene: THREE.Object3D, m: Materials) {
  const depth = 0.7;
  // Wall built around the opening so the recess reveals are real faces.
  box(scene, m.stone, [4, 7, depth], [-(OPEN_HALF + 2), 3.5, -depth / 2]);
  box(scene, m.stone, [4, 7, depth], [OPEN_HALF + 2, 3.5, -depth / 2]);
  box(
    scene,
    m.stone,
    [OPEN_HALF * 2, 7 - OPEN_H, depth],
    [0, OPEN_H + (7 - OPEN_H) / 2, -depth / 2],
  );

  // Stepped surround: stone pier, brass bead, walnut architrave.
  scene.add(mesh(uFrame(OPEN_HALF, OPEN_H, 0.46, 0.09, 0.02), m.stone));
  scene.add(
    mesh(
      uFrame(OPEN_HALF + 0.17, OPEN_H + 0.17, 0.018, 0.115, 0.006),
      m.brassPolished,
    ),
  );
  scene.add(mesh(uFrame(OPEN_HALF, OPEN_H, 0.16, 0.15, 0.03), m.walnut));

  // Art Deco setbacks crowning the surround.
  const steps: [number, number][] = [
    [3.2, 0.16],
    [2.5, 0.16],
    [1.7, 0.18],
  ];
  let y = OPEN_H + 0.46;
  steps.forEach(([w, h], i) => {
    box(
      scene,
      m.stone,
      [w, h, 0.12 - i * 0.015],
      [0, y + h / 2, 0.06 - i * 0.0075],
    );
    box(
      scene,
      m.brassPolished,
      [w + 0.004, 0.012, 0.13 - i * 0.015],
      [0, y + 0.006, 0.06 - i * 0.0075],
    );
    y += h;
  });

  // Brass fluting on the piers.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const flute = mesh(
        new THREE.CylinderGeometry(0.006, 0.006, OPEN_H - 0.3, 8),
        m.brass,
      );
      flute.position.set(
        side * (OPEN_HALF + 0.24 + i * 0.05),
        OPEN_H / 2 + 0.05,
        0.095,
      );
      scene.add(flute);
    }
  }

  // Recess back: walnut panelling either side of the doors.
  const back = -RECESS - 0.1;
  for (const side of [-1, 1]) {
    box(
      scene,
      m.walnut,
      [OPEN_HALF - DOOR_W, OPEN_H, 0.1],
      [(side * (OPEN_HALF + DOOR_W)) / 2, OPEN_H / 2, back],
    );
    // Jamb moulding with a brass edge.
    box(
      scene,
      m.walnut,
      [0.07, DOOR_H + 0.1, 0.12],
      [side * (DOOR_W + 0.035), (DOOR_H + 0.1) / 2, -RECESS + 0.02],
    );
    box(
      scene,
      m.brassPolished,
      [0.008, DOOR_H + 0.1, 0.122],
      [side * (DOOR_W + 0.074), (DOOR_H + 0.1) / 2, -RECESS + 0.02],
    );
  }
  box(
    scene,
    m.walnut,
    [DOOR_W * 2 + 0.14, 0.12, 0.14],
    [0, DOOR_H + 0.06, -RECESS + 0.03],
  );
  box(
    scene,
    m.brassPolished,
    [DOOR_W * 2 + 0.14, 0.012, 0.142],
    [0, DOOR_H + 0.125, -RECESS + 0.03],
  );
  // Marble threshold step.
  box(
    scene,
    m.threshold,
    [DOOR_W * 2 + 0.3, 0.035, RECESS + 0.12],
    [0, 0.0175, -RECESS / 2 + 0.02],
  );
}

/* ---------------------------------------------------------------- */
/* Fanlight above the doors                                          */
/* ---------------------------------------------------------------- */

export function buildFanlight(scene: THREE.Object3D, m: Materials) {
  const bottom = DOOR_H + 0.13;
  const h = OPEN_H - bottom;
  const z = -RECESS - 0.02;
  // Reeded amber glass lit from the room; colour scales its intensity.
  const glass = new THREE.MeshBasicMaterial({ map: reededGlass() });
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(DOOR_W * 2 + 0.1, h),
    glass,
  );
  pane.position.set(0, bottom + h / 2, z - 0.03);
  scene.add(pane);
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len = Math.min(
      Math.abs(dx) > 1e-3 ? (DOOR_W + 0.05) / Math.abs(dx) : Infinity,
      dy > 1e-3 ? h / dy : Infinity,
    );
    const bar = mesh(new THREE.BoxGeometry(len, 0.014, 0.02), m.brassPolished);
    bar.position.set((dx * len) / 2, bottom + (dy * len) / 2, z);
    bar.rotation.z = a;
    scene.add(bar);
  }
  for (const r of [0.22, 0.46]) {
    const arc = mesh(
      new THREE.TorusGeometry(r, 0.008, 6, 48, Math.PI),
      m.brassPolished,
    );
    arc.position.set(0, bottom, z);
    scene.add(arc);
  }
  return glass;
}

/* ---------------------------------------------------------------- */
/* Door leaves and the time-lock                                     */
/* ---------------------------------------------------------------- */

export interface Drum {
  texture: THREE.Texture;
  mesh: THREE.Mesh;
}

export interface Leaf {
  pivot: THREE.Group;
  drums: Drum[];
  /** Points beneath each counter group, for the HTML unit labels. */
  labelAnchors: THREE.Object3D[];
  clockBounds: THREE.Object3D[];
  bolt: THREE.Mesh | null;
}

const DRUM_W = 0.104;
const DRUM_H = 0.172;
const PLATE_W = 0.66;
const PLATE_H = 0.4;
const PLATE_Y = 1.36;
const WINDOW_Y = 0.045; // window centre above the plate centre
const GROUP_X = [-0.16, 0.16];

/**
 * One leaf with its hinge at the pivot and the meeting edge at x = DOOR_W
 * (the right leaf mirrors its joinery). Each leaf carries half the
 * time-lock: two counter groups behind an engraved plate.
 */
function buildLeaf(
  m: Materials,
  side: 'left' | 'right',
  strip: THREE.Texture,
): Leaf {
  const pivot = new THREE.Group();
  const leaf = new THREE.Group();
  pivot.add(leaf);
  if (side === 'right') leaf.scale.x = -1;
  const cx = DOOR_W / 2;

  box(
    leaf,
    m.mahogany,
    [DOOR_W - 0.004, DOOR_H - 0.012, DOOR_T],
    [cx, DOOR_H / 2 + 0.008, -DOOR_T / 2],
  );

  // Fielded panels framed by brass beads.
  for (const [py, ph] of [
    [2.12, 1.08],
    [0.62, 0.78],
  ] as const) {
    const panel = mesh(bevelled(0.58, ph, 0.022, 0.014), m.mahogany);
    panel.position.set(cx + 0.02, py, 0);
    leaf.add(panel);
    const w = 0.64;
    const h = ph + 0.06;
    const ring = rect(new THREE.Shape(), -w / 2, -h / 2, w, h) as THREE.Shape;
    ring.holes.push(
      rect(new THREE.Path(), -w / 2 + 0.01, -h / 2 + 0.01, w - 0.02, h - 0.02),
    );
    const bead = mesh(
      new THREE.ExtrudeGeometry(ring, { depth: 0.006, bevelEnabled: false }),
      m.brassPolished,
    );
    bead.position.set(cx + 0.02, py, 0);
    leaf.add(bead);
  }

  // Rising-sun marquetry, completed across both leaves.
  const sunY = 1.62;
  const panelLeft = cx + 0.02 - 0.29;
  const panelTop = 2.12 + 0.54;
  for (let i = 0; i < 9; i += 1) {
    const a = Math.PI / 2 + ((i + 0.5) / 9) * (Math.PI / 2);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const len =
      Math.min((panelLeft - DOOR_W) / dx, (panelTop - sunY) / dy) - 0.02;
    const start = 0.16;
    const ray = mesh(
      new THREE.BoxGeometry(len - start, i % 2 ? 0.006 : 0.011, 0.005),
      m.brassPolished,
    );
    const mid = (start + len) / 2;
    ray.position.set(DOOR_W + dx * mid, sunY + dy * mid, 0.024);
    ray.rotation.z = a;
    leaf.add(ray);
  }
  const sunShape = new THREE.Shape();
  sunShape.moveTo(0, 0);
  sunShape.absarc(0, 0, 0.12, Math.PI / 2, Math.PI, false);
  sunShape.lineTo(0, 0);
  const sun = mesh(
    new THREE.ExtrudeGeometry(sunShape, {
      depth: 0.006,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 2,
    }),
    m.brassPolished,
  );
  sun.position.set(DOOR_W, sunY, 0.022);
  leaf.add(sun);

  // Medallion half, unmirrored, so "3" and "0" part with the doors.
  const r = 0.085;
  const half = new THREE.Shape();
  half.moveTo(0, -r);
  half.absarc(0, 0, r, -Math.PI / 2, Math.PI / 2, side === 'left');
  half.lineTo(0, -r);
  const medTex = medallionTexture();
  medTex.repeat.set(1 / (2 * r), 1 / (2 * r));
  medTex.offset.set(0.5, 0.5);
  const medallion = mesh(
    new THREE.ExtrudeGeometry(half, {
      depth: 0.01,
      bevelEnabled: true,
      bevelSize: 0.004,
      bevelThickness: 0.004,
      bevelSegments: 2,
    }),
    new THREE.MeshStandardMaterial({
      map: medTex,
      metalness: 0.85,
      roughness: 0.3,
    }),
    true,
  );
  medallion.position.set(DOOR_W, sunY, 0.03);
  if (side === 'right') medallion.scale.x = -1;
  leaf.add(medallion);

  // Time-lock plate with four counter windows.
  const plateX = DOOR_W - PLATE_W / 2 - 0.035;
  const offsets = [-DRUM_W / 2 - 0.004, DRUM_W / 2 + 0.004];
  const windows = GROUP_X.flatMap((gx) =>
    offsets.map((dx) =>
      rect(
        new THREE.Path(),
        gx + dx - DRUM_W / 2,
        WINDOW_Y - DRUM_H / 2,
        DRUM_W,
        DRUM_H,
      ),
    ),
  );
  const plate = mesh(
    bevelled(PLATE_W, PLATE_H, 0.026, 0.008, windows),
    m.brass,
  );
  plate.position.set(plateX, PLATE_Y, 0);
  leaf.add(plate);

  const clockBounds = [-1, 1].flatMap((x) =>
    [-1, 1].map((y) => {
      const anchor = new THREE.Object3D();
      anchor.position.set(
        plateX + (x * PLATE_W) / 2,
        PLATE_Y + (y * PLATE_H) / 2,
        0.03,
      );
      leaf.add(anchor);
      return anchor;
    }),
  );
  const drums: Drum[] = [];
  const labelAnchors: THREE.Object3D[] = [];
  const shadeMat = new THREE.MeshBasicMaterial({
    map: drumShade(),
    transparent: true,
    depthWrite: false,
  });
  GROUP_X.forEach((gx) => {
    offsets.forEach((dx) => {
      const t = strip.clone();
      const drum = new THREE.Mesh(
        new THREE.PlaneGeometry(DRUM_W, DRUM_H),
        new THREE.MeshStandardMaterial({
          map: t,
          roughness: 0.85,
          envMapIntensity: 0.25,
        }),
      );
      drum.position.set(plateX + gx + dx, PLATE_Y + WINDOW_Y, 0.007);
      drum.receiveShadow = true;
      if (side === 'right') drum.scale.x = -1;
      leaf.add(drum);
      drums.push({ texture: t, mesh: drum });
      const shade = mesh(new THREE.PlaneGeometry(DRUM_W, DRUM_H), shadeMat);
      shade.castShadow = false;
      shade.position.copy(drum.position);
      shade.position.z += 0.002;
      leaf.add(shade);
    });
    const anchor = new THREE.Object3D();
    anchor.position.set(plateX + gx, PLATE_Y - 0.125, 0.03);
    leaf.add(anchor);
    labelAnchors.push(anchor);
  });

  // The bolt: crosses the meeting stiles until midnight, then withdraws.
  let bolt: THREE.Mesh | null = null;
  if (side === 'left') {
    bolt = mesh(
      new THREE.CylinderGeometry(0.014, 0.014, 0.16, 20),
      m.brassPolished,
      true,
    );
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(DOOR_W + 0.01, PLATE_Y + 0.17, 0.042);
    leaf.add(bolt);
  }
  // Each leaf carries its own keeper beside the meeting stile.
  const keeper = mesh(bevelled(0.03, 0.05, 0.03, 0.004), m.brassPolished);
  keeper.position.set(DOOR_W - 0.06, PLATE_Y + 0.17, 0.012);
  leaf.add(keeper);

  // Pull handle on standoffs.
  const handle = mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.62, 20),
    m.brassPolished,
  );
  handle.position.set(DOOR_W - 0.075, 0.82, 0.075);
  leaf.add(handle);
  for (const hy of [0.56, 1.08]) {
    const stand = mesh(
      new THREE.CylinderGeometry(0.009, 0.012, 0.075, 12),
      m.brassPolished,
    );
    stand.rotation.x = Math.PI / 2;
    stand.position.set(DOOR_W - 0.075, hy, 0.038);
    leaf.add(stand);
  }
  box(leaf, m.brass, [DOOR_W - 0.01, 0.2, 0.004], [cx, 0.11, 0.002]);

  mergeStatic(leaf);
  return { pivot, drums, labelAnchors, clockBounds, bolt };
}

export function buildDoors(scene: THREE.Object3D, m: Materials) {
  const strip = drumStrip();
  const left = buildLeaf(m, 'left', strip);
  const right = buildLeaf(m, 'right', strip);
  left.pivot.position.set(-DOOR_W, 0, -RECESS);
  right.pivot.position.set(DOOR_W, 0, -RECESS);
  scene.add(left.pivot, right.pivot);

  // The room beyond, glimpsed through the seam and revealed at midnight.
  const interior = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 4.4),
    new THREE.MeshBasicMaterial({ map: interiorTexture() }),
  );
  interior.position.set(0, 2, -3.2);
  scene.add(interior);
  const leak = new THREE.MeshBasicMaterial({
    color: new THREE.Color(3, 2.1, 1.1),
    transparent: true,
  });
  const seam = new THREE.Mesh(
    new THREE.PlaneGeometry(0.006, DOOR_H - 0.02),
    leak,
  );
  seam.position.set(0, DOOR_H / 2, -RECESS - DOOR_T / 2);
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(DOOR_W * 2, 0.008), leak);
  sill.position.set(0, 0.04, -RECESS + 0.002);
  scene.add(seam, sill);

  return { left, right, interior, leak };
}

/* ---------------------------------------------------------------- */
/* Sconces, bell, lettering, floor                                   */
/* ---------------------------------------------------------------- */

export function buildSconces(scene: THREE.Object3D, m: Materials) {
  const shadeMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.5, 0.95, 0.48),
    side: THREE.DoubleSide,
  });
  const haloMat = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: 0xffd6a0,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lights: THREE.PointLight[] = [];
  for (const x of [-SCONCE_X, SCONCE_X]) {
    const g = new THREE.Group();
    g.position.set(x, 2.15, 0.09);
    g.add(mesh(bevelled(0.1, 0.42, 0.02, 0.006), m.brassPolished));
    const shade = mesh(
      new THREE.CylinderGeometry(
        0.15,
        0.05,
        0.2,
        24,
        1,
        true,
        -Math.PI / 2,
        Math.PI,
      ),
      shadeMat,
    );
    shade.castShadow = false;
    shade.position.set(0, 0.16, 0.03);
    g.add(shade);
    const cap = mesh(
      new THREE.CylinderGeometry(
        0.155,
        0.155,
        0.012,
        24,
        1,
        false,
        -Math.PI / 2,
        Math.PI,
      ),
      m.brassPolished,
    );
    cap.position.set(0, 0.265, 0.03);
    g.add(cap);
    const stem = mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12),
      m.brassPolished,
    );
    stem.position.set(0, -0.02, 0.04);
    g.add(stem);
    scene.add(g);

    const light = new THREE.PointLight(0xffc27a, 3.2, 6, 2);
    light.position.set(x, 2.38, 0.28);
    scene.add(light);
    lights.push(light);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(1.1, 1.1, 1);
    halo.position.set(x, 2.33, 0.2);
    scene.add(halo);
  }
  return { lights, shadeMat, haloMat };
}

export function buildBell(scene: THREE.Object3D, m: Materials) {
  // On the right-hand jamb at hand height, where a real bell-push sits.
  const g = new THREE.Group();
  g.position.set(DOOR_W + 0.035, 1.12, -RECESS + 0.085);
  g.add(mesh(bevelled(0.058, 0.2, 0.012, 0.004), m.brassPolished));
  const ring = mesh(
    new THREE.TorusGeometry(0.018, 0.005, 10, 24),
    m.brassPolished,
  );
  ring.position.set(0, -0.035, 0.014);
  g.add(ring);
  const push = mesh(
    new THREE.SphereGeometry(0.0165, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    m.nacre,
    true,
  );
  push.rotation.x = Math.PI / 2;
  push.position.set(0, -0.035, 0.012);
  g.add(push);
  // Pierced speaker grille: the butler answers through it.
  const grilleMat = new THREE.MeshBasicMaterial({ color: 0x150d08 });
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const hole = mesh(new THREE.CircleGeometry(0.0035, 8), grilleMat);
      hole.castShadow = false;
      hole.position.set(-0.012 + col * 0.012, 0.05 + row * 0.012, 0.0125);
      g.add(hole);
    }
  }
  scene.add(g);
  mergeStatic(g);
  // Corners of the generous tap target, for projecting the HTML button.
  const bounds = [
    new THREE.Vector3(-0.11, -0.2, 0.03),
    new THREE.Vector3(0.11, 0.2, 0.03),
  ].map((v) => g.localToWorld(v.clone()));
  return { push, grilleMat, bounds };
}

export function buildLettering(scene: THREE.Object3D) {
  const t = letteringTexture();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 0.36),
    new THREE.MeshStandardMaterial({
      map: t,
      alphaMap: t,
      transparent: true,
      metalness: 1,
      roughness: 0.3,
      emissive: 0x8a6a34,
      emissiveMap: t,
      emissiveIntensity: 0.55,
    }),
  );
  plane.position.set(0, OPEN_H + 0.28, 0.1);
  scene.add(plane);
}

export function buildFloor(scene: THREE.Object3D, m: Materials) {
  const mirror = new Reflector(new THREE.PlaneGeometry(14, 14), {
    textureWidth: 512,
    textureHeight: 512,
    color: 0x6b6b6b,
    clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  const geometry = new THREE.PlaneGeometry(14, 14);
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1)
    uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 14);
  const floor = new THREE.Mesh(geometry, m.marble);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  floor.receiveShadow = true;
  scene.add(floor);

  const spill = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture(),
      color: 0xffc48a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.004, -RECESS + 0.75);
  scene.add(spill);
  return { mirror, spill: spill.material };
}

/** Warm night-street environment for reflections on brass and lacquer. */
export function warmEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x050404);
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
  glow(2, 2, [-3, 2, 3], new THREE.Color(2.2, 1.4, 0.7));
  glow(2, 2, [3, 2, 3], new THREE.Color(2.2, 1.4, 0.7));
  glow(3, 1, [0, 4, -2], new THREE.Color(1.2, 0.8, 0.45));
  glow(6, 1, [0, -2, 3], new THREE.Color(0.25, 0.12, 0.1));
  // The street behind the viewer, so camera-facing metal reads as metal.
  glow(8, 3, [0, 1, 5], new THREE.Color(0.55, 0.36, 0.2));
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
