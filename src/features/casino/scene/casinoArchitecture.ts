/**
 * The Grand Casino's room: materials, shell, panelling, furniture and the
 * chandelier. The two stations (roulette table, slot machine) live in
 * casinoStations.ts. Static meshes are made with `mesh()`/`box()` so
 * `mergeStatic` can bake the room into a handful of draw calls.
 */
import * as THREE from 'three';
import {
  bevelled,
  box,
  mesh,
  metricBox,
} from '../../entrance/scene/architecture';
import {
  brushedBrassRoughness,
  glowTexture,
} from '../../entrance/scene/canvasTextures';
import walnutDiff from '../../entrance/scene/assets/walnut_diff.webp?url';
import walnutNor from '../../entrance/scene/assets/walnut_nor.webp?url';
import walnutRough from '../../entrance/scene/assets/walnut_rough.webp?url';
import {
  ceilingTexture,
  floorTexture,
  velvetWallTexture,
} from './casinoTextures';

export const ROOM = {
  halfW: 4,
  back: -5,
  front: 5.6,
  height: 4.4,
  dado: 1.0,
  cornice: 3.9,
} as const;

export interface CasinoMaterials {
  walnut: THREE.MeshPhysicalMaterial;
  darkWalnut: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshStandardMaterial;
  brassPolished: THREE.MeshStandardMaterial;
  velvetWall: THREE.MeshPhysicalMaterial;
  velvetSeat: THREE.MeshPhysicalMaterial;
  velvetGreen: THREE.MeshPhysicalMaterial;
  leather: THREE.MeshPhysicalMaterial;
  floor: THREE.MeshPhysicalMaterial;
  ceiling: THREE.MeshStandardMaterial;
  enamel: THREE.MeshPhysicalMaterial;
  blackMarble: THREE.MeshPhysicalMaterial;
  cove: THREE.MeshBasicMaterial;
  bulb: THREE.MeshBasicMaterial;
  crystal: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  ivory: THREE.MeshStandardMaterial;
  coupe: THREE.MeshPhysicalMaterial;
}

async function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  colour: boolean,
  repeat: [number, number],
  anisotropy: number,
) {
  const tex = await loader.loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / repeat[0], 1 / repeat[1]);
  tex.anisotropy = anisotropy;
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createCasinoMaterials(
  anisotropy: number,
): Promise<CasinoMaterials> {
  const loader = new THREE.TextureLoader();
  const [d, n, r] = await Promise.all([
    loadTexture(loader, walnutDiff, true, [0.5, 1.0], anisotropy),
    loadTexture(loader, walnutNor, false, [0.5, 1.0], anisotropy),
    loadTexture(loader, walnutRough, false, [0.5, 1.0], anisotropy),
  ]);
  const brushed = brushedBrassRoughness();
  brushed.repeat.set(3, 3);

  const velvet = velvetWallTexture();
  velvet.anisotropy = anisotropy;
  const floor = floorTexture();
  floor.anisotropy = anisotropy;

  return {
    walnut: new THREE.MeshPhysicalMaterial({
      color: 0x8a776c,
      map: d,
      normalMap: n,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: r,
      roughness: 0.9,
      clearcoat: 0.6,
      clearcoatRoughness: 0.28,
    }),
    darkWalnut: new THREE.MeshPhysicalMaterial({
      color: 0x2a1a14,
      roughness: 0.42,
      clearcoat: 0.9,
      clearcoatRoughness: 0.18,
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
      roughness: 0.24,
    }),
    velvetWall: new THREE.MeshPhysicalMaterial({
      map: velvet,
      roughness: 0.95,
      sheen: 0.8,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(0xc2506a),
    }),
    velvetSeat: new THREE.MeshPhysicalMaterial({
      color: 0x6a1426,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0xd9607a),
    }),
    velvetGreen: new THREE.MeshPhysicalMaterial({
      color: 0x0d3b2a,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color(0x3fa07a),
    }),
    leather: new THREE.MeshPhysicalMaterial({
      color: 0x0f0b0b,
      roughness: 0.45,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    }),
    floor: new THREE.MeshPhysicalMaterial({
      map: floor,
      roughness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
    ceiling: new THREE.MeshStandardMaterial({
      map: ceilingTexture(),
      roughness: 0.5,
    }),
    enamel: new THREE.MeshPhysicalMaterial({
      color: 0x5e0f20,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
    blackMarble: new THREE.MeshPhysicalMaterial({
      color: 0x16131a,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    cove: new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 1.35, 0.6),
    }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    crystal: new THREE.MeshPhysicalMaterial({
      color: 0xfff1d6,
      emissive: 0xffd9a0,
      emissiveIntensity: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.85,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
    }),
    ivory: new THREE.MeshStandardMaterial({
      color: 0xf4ebdd,
      roughness: 0.18,
      emissive: 0x3a3226,
    }),
    coupe: new THREE.MeshPhysicalMaterial({
      color: 0xf3ead6,
      roughness: 0.03,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  };
}

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

export function lathe(
  parent: THREE.Object3D,
  material: THREE.Material,
  profile: readonly (readonly [number, number])[],
  position: [number, number, number],
  segments = 32,
) {
  const m = mesh(
    new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      segments,
    ),
    material,
  );
  m.position.set(...position);
  parent.add(m);
  return m;
}

export function cylinder(
  parent: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  height: number,
  position: [number, number, number],
  segments = 24,
  radiusBottom = radius,
) {
  const m = mesh(
    new THREE.CylinderGeometry(radius, radiusBottom, height, segments),
    material,
  );
  m.position.set(...position);
  parent.add(m);
  return m;
}

export function rounded(
  parent: THREE.Object3D,
  material: THREE.Material,
  [w, h, d]: [number, number, number],
  [x, y, z]: [number, number, number],
  radius: number,
) {
  const shape = new THREE.Shape();
  const hw = w / 2 - radius;
  const hh = h / 2 - radius;
  shape.moveTo(-hw - radius, -hh);
  shape.lineTo(-hw - radius, hh);
  shape.absarc(-hw, hh, radius, Math.PI, Math.PI / 2, true);
  shape.lineTo(hw, hh + radius);
  shape.absarc(hw, hh, radius, Math.PI / 2, 0, true);
  shape.lineTo(hw + radius, -hh);
  shape.absarc(hw, -hh, radius, 0, -Math.PI / 2, true);
  shape.lineTo(-hw, -hh - radius);
  shape.absarc(-hw, -hh, radius, -Math.PI / 2, -Math.PI, true);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - radius),
    bevelEnabled: true,
    bevelThickness: radius / 2,
    bevelSize: radius / 2,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -d / 2 + radius / 2);
  const m = mesh(g, material);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A plane whose UVs are in metres, so tiling is physically sized. */
function metricPlane(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  }
  return g;
}

/** Soft additive light pool laid on a surface: cheap bounced light. */
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

export function halo(
  parent: THREE.Object3D,
  scale: number,
  position: [number, number, number],
  opacity = 0.6,
  colour: THREE.ColorRepresentation = 0xffd2a0,
) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: colour,
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
/* Shell                                                             */
/* ---------------------------------------------------------------- */

interface Frame {
  /** Centre along the wall (m). */
  x: number;
  y: number;
  w: number;
  h: number;
  texture: THREE.Texture;
}

/** A framed picture lit from above: walnut and brass around the canvas. */
function pictureFrame(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  { x, y, w, h, texture }: Frame,
  glows: THREE.MeshBasicMaterial[],
) {
  const t = 0.07;
  box(parent, m.walnut, [w + 2 * t, t, 0.07], [x, y + h / 2 + t / 2, 0.06]);
  box(parent, m.walnut, [w + 2 * t, t, 0.07], [x, y - h / 2 - t / 2, 0.06]);
  box(parent, m.walnut, [t, h, 0.07], [x - w / 2 - t / 2, y, 0.06]);
  box(parent, m.walnut, [t, h, 0.07], [x + w / 2 + t / 2, y, 0.06]);
  const tw = w + 2 * t + 0.03;
  const th = h + 2 * t + 0.03;
  box(parent, m.brassPolished, [tw, 0.014, 0.08], [x, y + th / 2, 0.062]);
  box(parent, m.brassPolished, [tw, 0.014, 0.08], [x, y - th / 2, 0.062]);
  box(parent, m.brassPolished, [0.014, th, 0.08], [x - tw / 2, y, 0.062]);
  box(parent, m.brassPolished, [0.014, th, 0.08], [x + tw / 2, y, 0.062]);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.6,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.22,
    }),
  );
  art.position.set(x, y, 0.045);
  parent.add(art);
  // Picture light: a brass arm and a warm wash down the canvas.
  box(
    parent,
    m.brassPolished,
    [Math.min(0.5, w * 0.6), 0.03, 0.04],
    [x, y + th / 2 + 0.1, 0.2],
  );
  box(
    parent,
    m.brassPolished,
    [0.012, 0.12, 0.012],
    [x, y + th / 2 + 0.05, 0.12],
  );
  glows.push(
    lightPool(
      parent,
      [w * 1.5, h * 1.1],
      [x, y, 0.05],
      [0, 0, 0],
      0xffd9a0,
      0.18,
    ),
  );
}

/** Fluted walnut pilaster with brass reeds. */
function pilaster(parent: THREE.Object3D, m: CasinoMaterials, x: number) {
  box(parent, m.walnut, [0.26, ROOM.cornice, 0.1], [x, ROOM.cornice / 2, 0.05]);
  for (const dx of [-0.07, 0, 0.07]) {
    box(
      parent,
      m.brassPolished,
      [0.012, ROOM.cornice - 0.6, 0.012],
      [x + dx, ROOM.cornice / 2 + 0.1, 0.105],
    );
  }
  box(parent, m.darkWalnut, [0.32, 0.22, 0.13], [x, 0.11, 0.065]);
  box(
    parent,
    m.brassPolished,
    [0.32, 0.03, 0.13],
    [x, ROOM.cornice - 0.06, 0.065],
  );
}

function curtain(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  x: number,
  width: number,
  height: number,
) {
  const g = new THREE.PlaneGeometry(width, height, 36, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const px = pos.getX(i);
    pos.setZ(i, 0.09 + Math.sin(px * 17) * 0.07 + Math.sin(px * 5.3) * 0.03);
  }
  g.computeVertexNormals();
  const c = mesh(g, m.velvetSeat);
  c.position.set(x, height / 2 + 0.05, 0.12);
  parent.add(c);
  // Valance, pelmet and a brass rod with finials.
  box(
    parent,
    m.velvetSeat,
    [width + 0.2, 0.34, 0.2],
    [x, height + 0.05 - 0.17, 0.2],
  );
  box(
    parent,
    m.brassPolished,
    [width + 0.2, 0.025, 0.21],
    [x, height - 0.34, 0.2],
  );
  for (const sx of [-1, 1]) {
    const f = mesh(new THREE.SphereGeometry(0.04, 12, 8), m.brassPolished);
    f.position.set(x + sx * (width / 2 + 0.14), height - 0.1, 0.2);
    parent.add(f);
  }
  // A tieback in brass.
  const tie = mesh(
    new THREE.TorusGeometry(0.06, 0.012, 8, 20),
    m.brassPolished,
  );
  tie.position.set(x + (x > 0 ? -1 : 1) * (width / 2 - 0.02), 1.6, 0.23);
  parent.add(tie);
}

function sconce(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  x: number,
  y: number,
  glows: THREE.SpriteMaterial[],
) {
  box(parent, m.brassPolished, [0.1, 0.34, 0.03], [x, y, 0.12]);
  const shade = mesh(
    new THREE.CylinderGeometry(0.055, 0.075, 0.2, 12, 1, true),
    m.crystal,
  );
  shade.position.set(x, y + 0.02, 0.17);
  shade.userData.static = false;
  parent.add(shade);
  glows.push(
    halo(
      parent,
      0.8,
      [x, y + 0.02, 0.22],
      0.4,
      0xffc78a,
    ) as THREE.SpriteMaterial,
  );
}

export interface WallSpec {
  length: number;
  pilasters: readonly number[];
  frames?: readonly Frame[];
  curtains?: readonly { x: number; width: number }[];
  sconces?: readonly number[];
}

/** One panelled wall, built in local space: x along it, +z into the room. */
function panelledWall(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  spec: WallSpec,
  pools: THREE.MeshBasicMaterial[],
  glows: THREE.SpriteMaterial[],
) {
  const { length: L } = spec;
  const { dado, cornice, height } = ROOM;
  // Velvet field, dado, skirting, cornice and cove light.
  const field = mesh(metricPlane(L, cornice - dado), m.velvetWall);
  field.position.set(0, (cornice + dado) / 2, 0.002);
  parent.add(field);
  box(parent, m.walnut, [L, dado, 0.06], [0, dado / 2, 0.03]);
  box(parent, m.brassPolished, [L, 0.016, 0.04], [0, dado, 0.065]);
  box(parent, m.darkWalnut, [L, 0.16, 0.09], [0, 0.08, 0.045]);
  box(
    parent,
    m.walnut,
    [L, height - cornice, 0.12],
    [0, (height + cornice) / 2, 0.06],
  );
  box(parent, m.brassPolished, [L, 0.016, 0.06], [0, cornice + 0.01, 0.12]);
  box(parent, m.cove, [L, 0.03, 0.02], [0, cornice + 0.1, 0.135]);
  box(parent, m.darkWalnut, [L, 0.1, 0.18], [0, cornice + 0.2, 0.09]);
  for (const x of spec.pilasters) pilaster(parent, m, x);
  // Brass-bordered panels in each bay.
  const edges = [-L / 2, ...spec.pilasters, L / 2];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const x0 = edges[i]! + (i === 0 ? 0 : 0.13);
    const x1 = edges[i + 1]! - (i === edges.length - 2 ? 0 : 0.13);
    const w = x1 - x0 - 0.5;
    if (w < 0.6) continue;
    const cx = (x0 + x1) / 2;
    const y0 = dado + 0.3;
    const y1 = cornice - 0.3;
    box(parent, m.brass, [w, 0.014, 0.02], [cx, y0, 0.02]);
    box(parent, m.brass, [w, 0.014, 0.02], [cx, y1, 0.02]);
    box(
      parent,
      m.brass,
      [0.014, y1 - y0, 0.02],
      [cx - w / 2, (y0 + y1) / 2, 0.02],
    );
    box(
      parent,
      m.brass,
      [0.014, y1 - y0, 0.02],
      [cx + w / 2, (y0 + y1) / 2, 0.02],
    );
  }
  for (const f of spec.frames ?? []) pictureFrame(parent, m, f, pools);
  for (const c of spec.curtains ?? [])
    curtain(parent, m, c.x, c.width, cornice - 0.05);
  for (const x of spec.sconces ?? []) sconce(parent, m, x, 2.45, glows);
}

export function buildShell(
  scene: THREE.Object3D,
  m: CasinoMaterials,
  walls: {
    back: WallSpec;
    side: { left: WallSpec; right: WallSpec };
    front: WallSpec;
  },
) {
  const { halfW, back, front, height } = ROOM;
  const depth = front - back;
  const midZ = (front + back) / 2;
  const pools: THREE.MeshBasicMaterial[] = [];
  const glows: THREE.SpriteMaterial[] = [];

  const floor = mesh(new THREE.PlaneGeometry(halfW * 2, depth), m.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, midZ);
  scene.add(floor);
  const ceiling = mesh(new THREE.PlaneGeometry(halfW * 2, depth), m.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, midZ);
  scene.add(ceiling);

  const place = (spec: WallSpec, x: number, z: number, ry: number) => {
    const wall = new THREE.Group();
    wall.position.set(x, 0, z);
    wall.rotation.y = ry;
    scene.add(wall);
    panelledWall(wall, m, spec, pools, glows);
  };
  place(walls.back, 0, back, 0);
  place(walls.side.left, -halfW, midZ, Math.PI / 2);
  place(walls.side.right, halfW, midZ, -Math.PI / 2);
  place(walls.front, 0, front, Math.PI);
  return { pools, glows };
}

/* ---------------------------------------------------------------- */
/* Furniture                                                         */
/* ---------------------------------------------------------------- */

/** A stool: brass pole and foot, velvet seat. */
export function stool(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  [x, z]: [number, number],
  height = 0.68,
) {
  cylinder(parent, m.brassPolished, 0.17, 0.03, [x, 0.015, z], 24);
  cylinder(
    parent,
    m.brassPolished,
    0.022,
    height - 0.1,
    [x, height / 2 - 0.02, z],
    12,
  );
  lathe(
    parent,
    m.velvetSeat,
    [
      [0, 0],
      [0.19, 0],
      [0.205, 0.03],
      [0.19, 0.07],
      [0.1, 0.09],
      [0, 0.095],
    ],
    [x, height - 0.08, z],
    28,
  );
  const ring = mesh(
    new THREE.TorusGeometry(0.19, 0.01, 6, 28),
    m.brassPolished,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, height - 0.075, z);
  parent.add(ring);
}

/** A long velvet banquette against the right wall. */
function banquette(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  z0: number,
  z1: number,
) {
  const len = z1 - z0;
  const cz = (z0 + z1) / 2;
  const x = ROOM.halfW - 0.45;
  box(parent, m.darkWalnut, [0.7, 0.2, len], [x, 0.1, cz]);
  rounded(
    parent,
    m.velvetSeat,
    [0.66, 0.2, len - 0.04],
    [x, 0.3, cz],
    0.05,
  ).rotation.x = 0;
  // Back cushion, buttoned with brass studs.
  rounded(
    parent,
    m.velvetSeat,
    [0.16, 0.7, len - 0.04],
    [x + 0.26, 0.74, cz],
    0.06,
  );
  for (let k = 0; k < Math.floor(len / 0.3); k += 1) {
    for (const y of [0.6, 0.85]) {
      const stud = mesh(new THREE.SphereGeometry(0.014, 8, 6), m.brassPolished);
      stud.position.set(x + 0.17, y, z0 + 0.25 + k * 0.3);
      parent.add(stud);
    }
  }
  box(parent, m.brassPolished, [0.04, 0.03, len], [x + 0.34, 1.1, cz]);
}

/** A round marble-topped table with champagne on ice. */
function champagneTable(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  [x, z]: [number, number],
) {
  cylinder(parent, m.brassPolished, 0.2, 0.03, [x, 0.015, z], 24);
  cylinder(parent, m.brassPolished, 0.03, 0.62, [x, 0.33, z], 12);
  cylinder(parent, m.blackMarble, 0.34, 0.04, [x, 0.66, z], 32);
  const rim = mesh(new THREE.TorusGeometry(0.34, 0.01, 6, 32), m.brassPolished);
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, 0.68, z);
  parent.add(rim);
  // Ice bucket and bottle.
  lathe(
    parent,
    m.brassPolished,
    [
      [0, 0],
      [0.09, 0],
      [0.12, 0.2],
      [0.125, 0.22],
      [0.115, 0.22],
      [0.085, 0.02],
    ],
    [x - 0.1, 0.68, z],
    24,
  );
  const bottle = mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.34, 14),
    new THREE.MeshStandardMaterial({
      color: 0x14301f,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );
  bottle.position.set(x - 0.1, 0.92, z);
  parent.add(bottle);
  // Two coupes.
  for (const dx of [0.12, 0.22]) {
    lathe(
      parent,
      m.coupe,
      [
        [0, 0],
        [0.03, 0],
        [0.005, 0.01],
        [0.004, 0.08],
        [0.05, 0.1],
        [0.055, 0.13],
        [0.0, 0.115],
      ],
      [x + dx, 0.68, z + (dx > 0.15 ? 0.06 : -0.04)],
      16,
    );
  }
}

/** A velvet tub chair. */
function tubChair(
  parent: THREE.Object3D,
  m: CasinoMaterials,
  [x, z]: [number, number],
  turn: number,
) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = turn;
  parent.add(g);
  cylinder(g, m.darkWalnut, 0.3, 0.12, [0, 0.06, 0], 28);
  lathe(
    g,
    m.velvetSeat,
    [
      [0.0, 0.12],
      [0.3, 0.12],
      [0.33, 0.3],
      [0.3, 0.42],
      [0.0, 0.42],
    ],
    [0, 0, 0],
    28,
  );
  // Curved back.
  const back = mesh(
    new THREE.CylinderGeometry(
      0.34,
      0.34,
      0.42,
      28,
      1,
      true,
      Math.PI * 0.6,
      Math.PI * 0.8,
    ),
    m.velvetSeat,
  );
  back.material = m.velvetSeat.clone();
  (back.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
  back.position.set(0, 0.62, 0);
  g.add(back);
  const trim = mesh(
    new THREE.TorusGeometry(0.34, 0.012, 6, 20, Math.PI * 0.8),
    m.brassPolished,
  );
  trim.rotation.x = Math.PI / 2;
  trim.rotation.z = Math.PI * 0.6;
  trim.position.set(0, 0.84, 0);
  g.add(trim);
}

export function buildFurniture(scene: THREE.Object3D, m: CasinoMaterials) {
  banquette(scene, m, 0.4, 3.6);
  champagneTable(scene, m, [-3.0, 2.3]);
  tubChair(scene, m, [-3.0, 3.1], Math.PI);
  tubChair(scene, m, [-2.35, 2.25], -Math.PI / 2 - 0.3);
  // A bronze ashtray-free side table by the banquette, with a lamp.
  champagneTable(scene, m, [3.2, 4.3]);
}

/* ---------------------------------------------------------------- */
/* Chandelier                                                        */
/* ---------------------------------------------------------------- */

export const CHANDELIER_Z = -1.4;

export function buildChandelier(scene: THREE.Object3D, m: CasinoMaterials) {
  const g = new THREE.Group();
  g.position.set(0, 0, CHANDELIER_Z);
  scene.add(g);
  cylinder(g, m.brassPolished, 0.014, 0.9, [0, ROOM.height - 0.45, 0], 8);
  rounded(
    g,
    m.brassPolished,
    [0.4, 0.05, 0.4],
    [0, ROOM.height - 0.22, 0],
    0.02,
  );
  const tiers = [
    { r: 0.62, y: 3.1, h: 0.34, n: 30 },
    { r: 0.44, y: 3.3, h: 0.3, n: 22 },
    { r: 0.26, y: 3.5, h: 0.26, n: 14 },
  ];
  const count = tiers.reduce((sum, t) => sum + t.n, 0);
  const rods = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.009, 0.009, 1, 6),
    m.crystal,
    count,
  );
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.02, 8, 6),
    m.bulb,
    36,
  );
  const matrix = new THREE.Matrix4();
  let i = 0;
  let b = 0;
  for (const t of tiers) {
    const ring = mesh(
      new THREE.TorusGeometry(t.r, 0.014, 8, 56),
      m.brassPolished,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = t.y + t.h;
    g.add(ring);
    for (let k = 0; k < t.n; k += 1) {
      const a = (k / t.n) * Math.PI * 2;
      matrix.compose(
        new THREE.Vector3(Math.cos(a) * t.r, t.y + t.h / 2, Math.sin(a) * t.r),
        new THREE.Quaternion(),
        new THREE.Vector3(1, t.h, 1),
      );
      rods.setMatrixAt(i, matrix);
      i += 1;
    }
    const arms = t === tiers[0] ? 16 : t === tiers[1] ? 12 : 8;
    for (let k = 0; k < arms && b < 36; k += 1) {
      const a = (k / arms) * Math.PI * 2 + 0.2;
      matrix.compose(
        new THREE.Vector3(
          Math.cos(a) * t.r,
          t.y + t.h + 0.04,
          Math.sin(a) * t.r,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
      );
      bulbs.setMatrixAt(b, matrix);
      bulbs.setColorAt(b, new THREE.Color(2.4, 1.7, 0.9));
      b += 1;
    }
  }
  bulbs.count = b;
  rods.castShadow = false;
  g.add(rods, bulbs);
  // Hanging drop at the heart.
  const drop = mesh(new THREE.OctahedronGeometry(0.09, 0), m.crystal);
  drop.scale.set(1, 2.2, 1);
  drop.position.y = 2.95;
  drop.userData.static = false;
  g.add(drop);
  const core = halo(g, 1.6, [0, 3.35, 0], 0.5);
  const pool = lightPool(
    g,
    [4.4, 4.4],
    [0, ROOM.height - 0.02, 0],
    [Math.PI / 2, 0, 0],
    0xffcf98,
    0.3,
  );
  return { core, pool, light: new THREE.Vector3(0, 2.95, CHANDELIER_Z) };
}

/* ---------------------------------------------------------------- */
/* Environment                                                       */
/* ---------------------------------------------------------------- */

export function casinoEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0405);
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
  glow(2, 2, [0, 3.5, -1], new THREE.Color(2.4, 1.6, 0.9)); // chandelier
  glow(1.5, 1, [-2, 2, -3], new THREE.Color(2.0, 1.3, 0.7)); // roulette lamp
  glow(1.5, 1, [3, 2, -3], new THREE.Color(1.8, 1.1, 0.6)); // slot marquee
  glow(8, 3, [0, 1, 5], new THREE.Color(0.34, 0.09, 0.13)); // oxblood walls
  glow(8, 3, [-5, 1, 0], new THREE.Color(0.3, 0.08, 0.11));
  glow(8, 3, [5, 1, 0], new THREE.Color(0.3, 0.08, 0.11));
  glow(8, 3, [0, 1, -5], new THREE.Color(0.32, 0.09, 0.12));
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

export { bevelled, box, mesh, metricBox };
