/**
 * The Gift Vault chamber: a D-shaped rotunda in dark polished stone with a
 * curved bank of brass-framed deposit boxes, a monumental round vault door
 * in the front wall, a leather-topped viewing table and a brass oculus.
 * Static geometry is merged per material; Alise's compartments are built
 * separately because their doors, dials and bolts move.
 */
import * as THREE from 'three';
import { brushedBrassRoughness } from '../../entrance/scene/canvasTextures';
import { mesh, metricBox } from '../../entrance/scene/architecture';
import marbleDiff from '../../entrance/scene/assets/marble_diff.webp?url';
import marbleRough from '../../entrance/scene/assets/marble_rough.webp?url';
import stoneDiff from '../../entrance/scene/assets/stone_diff.webp?url';
import stoneNor from '../../entrance/scene/assets/stone_nor.webp?url';
import stoneRough from '../../entrance/scene/assets/stone_rough.webp?url';
import {
  BANK,
  cellFrame,
  columnAngle,
  FRONT_Z,
  PORTAL,
  type Cell,
} from './vaultMath';
import {
  atlasRect,
  dialFace,
  envelopeTexture,
  leatherTexture,
  numberPlate,
  plateAtlas,
  setPlaneUv,
} from './vaultTextures';

export interface VaultMaterials {
  floor: THREE.MeshPhysicalMaterial;
  wall: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  brassPolished: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  carcass: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  plates: THREE.MeshStandardMaterial;
  dial: THREE.MeshStandardMaterial;
  cove: THREE.MeshBasicMaterial;
  envelope: THREE.MeshStandardMaterial;
}

async function scan(
  loader: THREE.TextureLoader,
  url: string,
  colour: boolean,
  size: number,
  anisotropy: number,
) {
  const tex = await loader.loadAsync(url);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / size, 1 / size);
  tex.anisotropy = anisotropy;
  if (colour) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export async function createVaultMaterials(
  anisotropy: number,
): Promise<VaultMaterials> {
  const loader = new THREE.TextureLoader();
  const [sD, sN, sR, mD, mR] = await Promise.all([
    scan(loader, stoneDiff, true, 1.6, anisotropy),
    scan(loader, stoneNor, false, 1.6, anisotropy),
    scan(loader, stoneRough, false, 1.6, anisotropy),
    scan(loader, marbleDiff, true, 1.2, anisotropy),
    scan(loader, marbleRough, false, 1.2, anisotropy),
  ]);
  const brushed = brushedBrassRoughness();
  brushed.repeat.set(3, 3);
  const wallMap = sD.clone();
  wallMap.repeat.set(1 / 2.2, 1 / 2.2);
  const leather = leatherTexture();
  return {
    floor: new THREE.MeshPhysicalMaterial({
      color: 0x2c2826,
      map: sD,
      normalMap: sN,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughnessMap: sR,
      roughness: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.09,
    }),
    wall: new THREE.MeshStandardMaterial({
      color: 0x3c3633,
      map: wallMap,
      normalMap: sN,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: sR,
      roughness: 0.9,
    }),
    marble: new THREE.MeshStandardMaterial({
      color: 0x6d625a,
      map: mD,
      roughnessMap: mR,
      roughness: 0.32,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xbf9a5e,
      metalness: 1,
      roughness: 0.62,
      roughnessMap: brushed,
    }),
    brassPolished: new THREE.MeshStandardMaterial({
      color: 0xd2b075,
      metalness: 1,
      roughness: 0.28,
    }),
    gunmetal: new THREE.MeshStandardMaterial({
      color: 0x2e2925,
      metalness: 0.82,
      roughness: 0.5,
      roughnessMap: brushed,
    }),
    steel: new THREE.MeshStandardMaterial({
      color: 0x5c5650,
      metalness: 0.9,
      roughness: 0.4,
      roughnessMap: brushed,
    }),
    carcass: new THREE.MeshStandardMaterial({
      color: 0x0b0908,
      roughness: 0.95,
    }),
    leather: new THREE.MeshStandardMaterial({
      map: leather,
      roughness: 0.62,
      emissive: new THREE.Color(0x3a0c0e),
      emissiveIntensity: 0,
    }),
    plates: new THREE.MeshStandardMaterial({
      map: plateAtlas(101),
      metalness: 1,
      roughness: 0.38,
    }),
    dial: new THREE.MeshStandardMaterial({
      map: dialFace(),
      metalness: 1,
      roughness: 0.3,
    }),
    cove: new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.75, 0.52, 0.3),
    }),
    envelope: new THREE.MeshStandardMaterial({
      map: envelopeTexture(),
      roughness: 0.85,
      emissive: new THREE.Color(0xfff0d8),
      emissiveIntensity: 0,
    }),
  };
}

/** A box placed in a column's local frame (x across, y up, z towards centre). */
function place(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  angle: number,
  local: [number, number, number],
  radius = BANK.radius,
) {
  const m = mesh(metricBox(...size), material);
  const pivot = new THREE.Object3D();
  pivot.position.set(radius * Math.sin(angle), 0, -radius * Math.cos(angle));
  pivot.rotation.y = -angle;
  m.position.set(...local);
  pivot.add(m);
  parent.add(pivot);
  return m;
}

/** The viewing table sits to one side, clear of the view to the boxes. */
const TABLE = { x: -2.05, z: 0.75 } as const;

const pitch = 2 * BANK.radius * Math.sin(BANK.step / 2);

/* ---------------------------------------------------------------- */
/* Shell                                                             */
/* ---------------------------------------------------------------- */

export function buildChamber(root: THREE.Object3D, m: VaultMaterials) {
  // Floor: one polished slab; brass rings inlaid around the table.
  const floor = mesh(new THREE.PlaneGeometry(14, 14), m.floor);
  const uv = floor.geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i += 1)
    uv.setXY(i, uv.getX(i) * 14, uv.getY(i) * 14);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1;
  root.add(floor);
  for (const [r, w] of [
    [1.15, 0.022],
    [1.24, 0.008],
    [2.35, 0.016],
  ] as const) {
    const ring = mesh(new THREE.RingGeometry(r, r + w, 96), m.brassPolished);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.002, -0.35);
    root.add(ring);
  }
  // Sixteen brass rays between the rings: a compass laid in the stone.
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const long = i % 2 === 0;
    const ray = mesh(
      new THREE.PlaneGeometry(0.012, long ? 1.08 : 0.6),
      m.brassPolished,
    );
    ray.rotation.x = -Math.PI / 2;
    ray.rotation.z = a;
    const mid = 1.27 + (long ? 0.54 : 0.3);
    ray.position.set(Math.sin(a) * mid, 0.002, -0.35 + Math.cos(a) * mid);
    root.add(ray);
  }

  // Curved bank columns: plinth, frame, cornice and cove above.
  const top = BANK.base + BANK.rows * BANK.rowHeight;
  for (let c = 0; c < BANK.columns; c += 1) {
    const a = columnAngle(c);
    place(root, m.marble, [pitch + 0.002, BANK.base - 0.06, 0.34], a, [
      0,
      (BANK.base - 0.06) / 2,
      -0.1,
    ]);
    place(root, m.brass, [pitch + 0.002, 0.06, 0.05], a, [
      0,
      BANK.base - 0.03,
      0.05,
    ]);
    // Frame: verticals at each edge and a rail between rows.
    for (const side of [-1, 1])
      place(root, m.brass, [0.03, top - BANK.base, 0.06], a, [
        (side * pitch) / 2,
        (BANK.base + top) / 2,
        -0.005,
      ]);
    for (let r = 0; r <= BANK.rows; r += 1)
      place(root, m.brass, [pitch, 0.03, 0.06], a, [
        0,
        BANK.base + r * BANK.rowHeight,
        -0.005,
      ]);
    // The carcass behind every compartment.
    place(root, m.carcass, [pitch, top - BANK.base, 0.04], a, [
      0,
      (BANK.base + top) / 2,
      -BANK.depth - 0.02,
    ]);
    // Cornice, cove strip and the stone above.
    place(root, m.brass, [pitch + 0.004, 0.09, 0.14], a, [0, top + 0.07, 0.03]);
    const cove = place(root, m.cove, [pitch, 0.018, 0.02], a, [
      0,
      top + 0.13,
      0.085,
    ]);
    cove.castShadow = false;
    place(root, m.wall, [pitch + 0.004, 4.6 - top, 0.3], a, [
      0,
      (top + 4.6) / 2 + 0.04,
      -0.25,
    ]);
  }
  // Stone continues past the bank to the side walls, then the straight front.
  const edge = columnAngle(BANK.columns - 1) + BANK.step / 2;
  for (const side of [-1, 1]) {
    for (let a = edge + BANK.step / 2; a < Math.PI / 2 + 0.01; a += BANK.step)
      place(root, m.wall, [pitch + 0.02, 4.6, 0.4], side * a, [0, 2.3, -0.2]);
    const run = FRONT_Z + 0.2;
    const wall = mesh(metricBox(0.4, 4.6, run), m.wall);
    wall.position.set(side * (BANK.radius + 0.2), 2.3, run / 2 - 0.1);
    root.add(wall);
  }
  buildFrontWall(root, m);

  // Ceiling, oculus ring and the lantern in it.
  const ceiling = mesh(
    metricBox(BANK.radius * 2 + 1, 0.2, BANK.radius + FRONT_Z + 1),
    m.wall,
  );
  ceiling.position.set(0, 4.7, (FRONT_Z - BANK.radius) / 2);
  root.add(ceiling);
  const oculus = mesh(
    new THREE.TorusGeometry(0.85, 0.05, 12, 72),
    m.brassPolished,
  );
  oculus.rotation.x = Math.PI / 2;
  oculus.position.set(0, 4.58, -0.4);
  root.add(oculus);
  const lantern = mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.04, 48),
    m.cove,
  );
  lantern.position.set(0, 4.59, -0.4);
  lantern.castShadow = false;
  root.add(lantern);

  // The viewing table: stone pedestal, brass-edged leather top.
  const pedestal = mesh(
    new THREE.CylinderGeometry(0.16, 0.26, 0.76, 32),
    m.marble,
  );
  pedestal.position.set(TABLE.x, 0.38, TABLE.z);
  root.add(pedestal);
  const tableTop = mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.05, 64),
    m.brass,
  );
  tableTop.position.set(TABLE.x, 0.785, TABLE.z);
  root.add(tableTop);
  const leather = mesh(
    new THREE.CylinderGeometry(0.565, 0.565, 0.012, 64),
    m.leather,
  );
  leather.position.set(TABLE.x, 0.814, TABLE.z);
  root.add(leather);
}

/** The straight front wall, 85 cm thick, pierced by the round vault door. */
function buildFrontWall(root: THREE.Object3D, m: VaultMaterials) {
  const half = BANK.radius + 0.4;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, 4.6);
  shape.lineTo(-half, 4.6);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, PORTAL.y, PORTAL.radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const wall = mesh(
    new THREE.ExtrudeGeometry(shape, {
      depth: PORTAL.wall,
      bevelEnabled: false,
      curveSegments: 48,
    }),
    m.wall,
  );
  wall.position.z = FRONT_Z;
  root.add(wall);
  // Steel lining of the bore and brass rings at both mouths.
  const boreMaterial = m.steel.clone();
  boreMaterial.side = THREE.DoubleSide;
  const bore = mesh(
    new THREE.CylinderGeometry(
      PORTAL.radius,
      PORTAL.radius,
      PORTAL.wall,
      64,
      1,
      true,
    ),
    boreMaterial,
  );
  bore.rotation.x = Math.PI / 2;
  bore.position.set(0, PORTAL.y, FRONT_Z + PORTAL.wall / 2);
  root.add(bore);
  for (const z of [FRONT_Z, FRONT_Z + PORTAL.wall]) {
    const ring = mesh(
      new THREE.TorusGeometry(PORTAL.radius + 0.04, 0.05, 14, 80),
      m.brassPolished,
    );
    ring.position.set(0, PORTAL.y, z);
    root.add(ring);
  }
  // The great door, swung open on its hinge outside the chamber.
  const hinge = new THREE.Object3D();
  hinge.position.set(
    PORTAL.radius + 0.12,
    PORTAL.y,
    FRONT_Z + PORTAL.wall + 0.05,
  );
  hinge.rotation.y = 1.95;
  root.add(hinge);
  const door = new THREE.Object3D();
  door.position.set(-(PORTAL.radius + 0.12), 0, 0.26);
  hinge.add(door);
  const slab = mesh(
    new THREE.CylinderGeometry(
      PORTAL.radius - 0.04,
      PORTAL.radius - 0.04,
      0.5,
      72,
    ),
    m.steel,
  );
  slab.rotation.x = Math.PI / 2;
  door.add(slab);
  for (const [r, t] of [
    [1.0, 0.035],
    [0.72, 0.03],
    [0.3, 0.05],
  ] as const) {
    const ring = mesh(new THREE.TorusGeometry(r, t, 10, 64), m.brassPolished);
    ring.position.z = -0.26;
    door.add(ring);
  }
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    const bolt = mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.26, 16),
      m.brassPolished,
    );
    bolt.position.set(
      Math.cos(a) * (PORTAL.radius + 0.06),
      Math.sin(a) * (PORTAL.radius + 0.06),
      0,
    );
    bolt.rotation.z = a - Math.PI / 2;
    door.add(bolt);
  }
  for (let i = 0; i < 3; i += 1) {
    const spoke = mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.1, 10),
      m.brassPolished,
    );
    spoke.rotation.z = (i / 3) * Math.PI;
    spoke.position.z = 0.32;
    door.add(spoke);
  }
  const hub = mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 32),
    m.brassPolished,
  );
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.3;
  door.add(hub);
  for (const y of [-0.7, 0.7]) {
    const knuckle = mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.42, 20),
      m.steel,
    );
    knuckle.position.set(PORTAL.radius + 0.12, y, 0);
    hinge.add(knuckle);
  }
}

/* ---------------------------------------------------------------- */
/* The other members' boxes                                          */
/* ---------------------------------------------------------------- */

export function buildDecorativeBoxes(
  root: THREE.Object3D,
  m: VaultMaterials,
  reserved: readonly Cell[],
) {
  const taken = new Set(reserved.map((c) => `${c.column}:${c.row}`));
  let plateIndex = 0;
  for (let column = 0; column < BANK.columns; column += 1) {
    for (let row = 0; row < BANK.rows; row += 1) {
      if (taken.has(`${column}:${row}`)) continue;
      const frame = cellFrame({ column, row });
      const pivot = new THREE.Object3D();
      pivot.position.set(...frame.centre);
      pivot.rotation.y = frame.yaw;
      root.add(pivot);
      const door = mesh(
        metricBox(BANK.doorWidth, BANK.doorHeight, 0.025),
        m.gunmetal,
      );
      door.position.z = -0.0125;
      pivot.add(door);
      const plateGeometry = new THREE.PlaneGeometry(0.13, 0.056);
      setPlaneUv(plateGeometry, atlasRect(plateIndex));
      plateIndex += 1;
      const plate = mesh(plateGeometry, m.plates);
      plate.position.set(0, 0.11, 0.002);
      pivot.add(plate);
      const escutcheon = mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16),
        m.brass,
      );
      escutcheon.rotation.x = Math.PI / 2;
      escutcheon.position.set(0, -0.03, 0.006);
      pivot.add(escutcheon);
      const pull = mesh(metricBox(0.1, 0.014, 0.02), m.brassPolished);
      pull.position.set(0, -0.12, 0.012);
      pivot.add(pull);
    }
  }
}

/* ---------------------------------------------------------------- */
/* Alise's compartments                                              */
/* ---------------------------------------------------------------- */

export interface Compartment {
  id: string;
  number: number;
  cell: Cell;
  group: THREE.Group;
  /** Rotates about the hinge (negative opens towards the chamber). */
  hinge: THREE.Object3D;
  dial: THREE.Mesh;
  bolts: THREE.Object3D;
  seam: THREE.MeshBasicMaterial;
  plate: THREE.MeshStandardMaterial;
  lining: THREE.MeshStandardMaterial;
  envelope: THREE.Mesh;
  /** Invisible target for taps. */
  proxy: THREE.Mesh;
  /** Where the label sits, in world space. */
  anchor: THREE.Vector3;
}

export function buildCompartment(
  root: THREE.Object3D,
  m: VaultMaterials,
  id: string,
  number: number,
  cell: Cell,
): Compartment {
  const frame = cellFrame(cell);
  const group = new THREE.Group();
  group.position.set(...frame.centre);
  group.rotation.y = frame.yaw;
  root.add(group);
  const w = BANK.doorWidth;
  const h = BANK.doorHeight;

  // The light that leaks round the door edges when the compartment is ready.
  const seam = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.3, 0.78, 0.36),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const seamPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.045, h + 0.03),
    seam,
  );
  seamPlane.position.z = -0.027;
  group.add(seamPlane);

  // Leather-lined interior: a box seen from inside, open at the front.
  const lining = m.leather.clone();
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.02, h + 0.02, BANK.depth - 0.03),
    lining,
  );
  (interior.material as THREE.Material).side = THREE.BackSide;
  interior.position.z = -(BANK.depth - 0.03) / 2 - 0.028;
  interior.receiveShadow = true;
  group.add(interior);
  const envelope = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.197),
    m.envelope.clone(),
  );
  envelope.position.set(0, -h / 2 + 0.115, -BANK.depth + 0.12);
  envelope.rotation.x = -0.32;
  group.add(envelope);

  // The door on its hinge, with plate, dial, lever and bolts.
  const hinge = new THREE.Object3D();
  hinge.position.set(-w / 2, 0, 0);
  group.add(hinge);
  const door = new THREE.Group();
  door.position.set(w / 2, 0, 0);
  hinge.add(door);
  const slab = new THREE.Mesh(metricBox(w, h, 0.025), m.gunmetal);
  slab.position.z = -0.0125;
  slab.castShadow = true;
  door.add(slab);
  const inset = new THREE.Mesh(
    metricBox(w - 0.06, h - 0.06, 0.004),
    m.gunmetal,
  );
  inset.position.z = 0.001;
  door.add(inset);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: numberPlate(number),
    metalness: 1,
    roughness: 0.3,
    transparent: true,
    alphaTest: 0.02,
    emissive: new THREE.Color(0xffd7a0),
    emissiveIntensity: 0,
  });
  plateMaterial.map!.premultiplyAlpha = false;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.17, 0.085),
    plateMaterial,
  );
  plate.position.set(0, 0.105, 0.004);
  door.add(plate);
  const dialMaterials = [m.brassPolished, m.dial, m.brassPolished];
  const dial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.056, 0.022, 48),
    dialMaterials,
  );
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0, -0.035, 0.012);
  door.add(dial);
  const pointer = new THREE.Mesh(
    new THREE.ConeGeometry(0.008, 0.016, 3),
    m.brassPolished,
  );
  pointer.position.set(0, 0.03, 0.006);
  pointer.rotation.z = Math.PI;
  door.add(pointer);
  const lever = new THREE.Mesh(metricBox(0.016, 0.1, 0.02), m.brassPolished);
  lever.position.set(w / 2 - 0.07, -0.03, 0.014);
  door.add(lever);
  const bolts = new THREE.Object3D();
  door.add(bolts);
  for (const y of [-0.12, 0, 0.12]) {
    const bolt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, 0.07, 12),
      m.brassPolished,
    );
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(w / 2 + 0.005, y, -0.012);
    bolts.add(bolt);
  }

  const proxy = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 0.08, h + 0.06),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.position.z = 0.02;
  proxy.userData.compartment = id;
  group.add(proxy);

  const anchor = new THREE.Vector3(0, -h / 2 - 0.03, 0.03);
  group.updateMatrixWorld(true);
  group.localToWorld(anchor);

  return {
    id,
    number,
    cell,
    group,
    hinge,
    dial,
    bolts,
    seam,
    plate: plateMaterial,
    lining,
    envelope,
    proxy,
    anchor,
  };
}

/** A warm, dim environment for reflections on brass, steel and stone. */
export function vaultEnvironment(renderer: THREE.WebGLRenderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x060504);
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
  glow(2, 2, [0, 4, 0], new THREE.Color(2.2, 1.5, 0.85)); // oculus
  glow(8, 0.4, [0, 2.6, -4], new THREE.Color(1.6, 1.1, 0.6)); // cove
  glow(3, 3, [0, 1.5, 4], new THREE.Color(0.7, 0.48, 0.28)); // the door behind
  glow(8, 3, [-5, 1, 0], new THREE.Color(0.16, 0.12, 0.1));
  glow(8, 3, [5, 1, 0], new THREE.Color(0.16, 0.12, 0.1));
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
