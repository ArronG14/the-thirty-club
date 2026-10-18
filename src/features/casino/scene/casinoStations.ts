/**
 * The two stations in the casino: the roulette table with its working wheel
 * and ball, and the antique slot machine with three working reels, a lever
 * and lamps. Static parts use `mesh()`/`box()` (merged by the scene);
 * anything that moves is a plain Mesh or Group and is returned as a handle.
 */
import * as THREE from 'three';
import {
  medallionTexture,
  reededGlass,
} from '../../entrance/scene/canvasTextures';
import { POCKETS } from '../domain/roulette';
import { REEL_LENGTH } from '../domain/slots';
import {
  box,
  cylinder,
  halo,
  lathe,
  lightPool,
  mesh,
  rounded,
  stool,
  type CasinoMaterials,
} from './casinoArchitecture';
import { POCKET_STEP, trackHeight, WHEEL } from './casinoMath';
import {
  feltTexture,
  marqueeTexture,
  reelTexture,
  wheelHeadTexture,
} from './casinoTextures';

/* ---------------------------------------------------------------- */
/* Roulette                                                          */
/* ---------------------------------------------------------------- */

export const TABLE = {
  x: -1.4,
  z: -1.3,
  length: 3.0,
  width: 1.25,
  topY: 0.92,
} as const;

/** Centre of the wheel's pocket floor. */
export const WHEEL_POS = new THREE.Vector3(
  TABLE.x,
  TABLE.topY + 0.12,
  TABLE.z - 0.75,
);

export function buildRoulette(scene: THREE.Object3D, m: CasinoMaterials) {
  const t = TABLE;
  const g = new THREE.Group();
  g.position.set(t.x, 0, t.z);
  scene.add(g);

  // Cabinet, top slab and brass bead.
  box(g, m.darkWalnut, [1.22, 0.86, 2.92], [0, 0.43, 0]);
  box(g, m.brassPolished, [1.3, 0.05, 3.0], [0, 0.04, 0]);
  box(g, m.walnut, [1.52, 0.05, 3.22], [0, 0.895, 0]);
  box(g, m.brassPolished, [1.54, 0.012, 3.24], [0, 0.865, 0]);
  const felt = mesh(
    new THREE.PlaneGeometry(t.width, t.length),
    new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 1 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, 0.922, 0);
  g.add(felt);

  // Padded leather rail all round.
  const long = new THREE.CapsuleGeometry(0.055, 3.1, 6, 14);
  for (const sx of [-1, 1]) {
    const rail = mesh(long, m.leather);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * 0.69, 0.955, 0);
    g.add(rail);
  }
  const short = new THREE.CapsuleGeometry(0.055, 1.28, 6, 14);
  for (const sz of [-1, 1]) {
    const rail = mesh(short, m.leather);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.955, sz * 1.6);
    g.add(rail);
  }

  // The wheel's stationary bowl: skirt, rim and sloped ball track.
  const wx = WHEEL_POS.x - t.x;
  const wz = WHEEL_POS.z - t.z;
  const bowl = new THREE.Group();
  bowl.position.set(wx, 0, wz);
  g.add(bowl);
  cylinder(bowl, m.walnut, 0.47, 0.12, [0, 0.98, 0], 64);
  const rim = mesh(new THREE.TorusGeometry(0.435, 0.04, 10, 64), m.darkWalnut);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = WHEEL_POS.y + trackHeight(WHEEL.rimRadius) + 0.012;
  bowl.add(rim);
  const rimBrass = mesh(
    new THREE.TorusGeometry(0.4, 0.008, 8, 64),
    m.brassPolished,
  );
  rimBrass.rotation.x = Math.PI / 2;
  rimBrass.position.y = WHEEL_POS.y + trackHeight(WHEEL.rimRadius) + 0.006;
  bowl.add(rimBrass);
  const trackGeo = new THREE.RingGeometry(
    WHEEL.headRadius,
    WHEEL.rimRadius,
    96,
    6,
  );
  const tp = trackGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i += 1) {
    const r = Math.hypot(tp.getX(i), tp.getY(i));
    tp.setZ(i, trackHeight(r));
  }
  trackGeo.computeVertexNormals();
  trackGeo.rotateX(-Math.PI / 2);
  const track = mesh(
    trackGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x25110a,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  );
  track.position.y = WHEEL_POS.y - 0.001;
  bowl.add(track);
  const trackLine = mesh(
    new THREE.TorusGeometry(WHEEL.headRadius, 0.004, 6, 96),
    m.brassPolished,
  );
  trackLine.rotation.x = Math.PI / 2;
  trackLine.position.y = WHEEL_POS.y + 0.002;
  bowl.add(trackLine);

  // Stools at the near end.
  for (const dx of [-0.35, 0.35]) stool(scene, m, [t.x + dx, t.z + 2.15]);
  stool(scene, m, [t.x + 1.25, t.z + 1.1]);

  // The croupier's chips, racked beside the wheel.
  const chipGeo = new THREE.CylinderGeometry(0.019, 0.019, 0.0065, 20);
  const colours = [0x9d1228, 0x0b0b0c, 0x0c6b3e, 0xc9a663, 0x3a2a5a];
  const rack = new THREE.InstancedMesh(
    chipGeo,
    new THREE.MeshStandardMaterial({ roughness: 0.4 }),
    colours.length * 9,
  );
  const mx = new THREE.Matrix4();
  colours.forEach((c, stack) => {
    for (let k = 0; k < 9; k += 1) {
      mx.makeTranslation(
        t.x - 0.46 + stack * 0.05,
        0.9255 + k * 0.0067,
        t.z - 1.26,
      );
      rack.setMatrixAt(stack * 9 + k, mx);
      rack.setColorAt(stack * 9 + k, new THREE.Color(c));
    }
  });
  scene.add(rack);

  // Alise's stake: a stack that grows with the chips on the slip.
  const stake = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.021, 0.021, 0.0075, 24),
    new THREE.MeshStandardMaterial({ roughness: 0.35 }),
    40,
  );
  stake.count = 0;
  stake.frustumCulled = false;
  scene.add(stake);

  // ---- The rotating head ----
  const head = new THREE.Group();
  head.position.copy(WHEEL_POS);
  scene.add(head);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(WHEEL.headRadius, 96),
    new THREE.MeshPhysicalMaterial({
      map: wheelHeadTexture(),
      roughness: 0.3,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.receiveShadow = true;
  head.add(disc);
  // Frets between the pockets.
  const frets = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.004, 0.016, 0.115),
    m.brassPolished,
    POCKETS,
  );
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < POCKETS; i += 1) {
    const a = (i + 0.5) * POCKET_STEP;
    q.setFromEuler(e.set(0, -a, 0));
    mx.compose(
      new THREE.Vector3(Math.sin(a) * 0.245, 0.008, -Math.cos(a) * 0.245),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    frets.setMatrixAt(i, mx);
  }
  head.add(frets);
  // Cone, ring, spindle and turret.
  const cone = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.19, 0],
        [0.175, 0.012],
        [0.135, 0.034],
        [0.09, 0.06],
        [0.052, 0.078],
        [0.03, 0.084],
        [0, 0.086],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      48,
    ),
    m.walnut,
  );
  head.add(cone);
  const coneRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.19, 0.007, 8, 64),
    m.brassPolished,
  );
  coneRing.rotation.x = Math.PI / 2;
  coneRing.position.y = 0.004;
  head.add(coneRing);
  const spindle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.012, 0.12, 14),
    m.brassPolished,
  );
  spindle.position.y = 0.14;
  head.add(spindle);
  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.024, 18, 12),
    m.brassPolished,
  );
  finial.position.y = 0.21;
  head.add(finial);
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.1, 8),
      m.brassPolished,
    );
    arm.rotation.z = Math.PI / 2;
    arm.position.set(Math.sin(a) * 0.05, 0.145, -Math.cos(a) * 0.05);
    arm.rotation.y = -a + Math.PI / 2;
    arm.rotation.order = 'YXZ';
    head.add(arm);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 10, 8),
      m.brassPolished,
    );
    tip.position.set(Math.sin(a) * 0.1, 0.145, -Math.cos(a) * 0.1);
    head.add(tip);
  }

  // The ball.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(WHEEL.ballRadius, 20, 14),
    m.ivory,
  );
  ball.castShadow = true;
  ball.position.copy(WHEEL_POS);
  scene.add(ball);

  // Hover/pulse pool beneath the table, and the hit area.
  const pool = lightPool(
    scene,
    [3.4, 4.8],
    [t.x, 0.01, t.z],
    [-Math.PI / 2, 0, 0],
    0xffc88a,
    0.16,
  );
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.3, 3.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.position.set(t.x, 0.65, t.z);
  scene.add(proxy);
  const wheelGlow = halo(
    scene,
    1.5,
    [WHEEL_POS.x, WHEEL_POS.y + 0.2, WHEEL_POS.z],
    0.0,
    0xffd9a0,
  );

  return {
    head,
    ball,
    stake,
    stakeChips: stake,
    proxy,
    pool,
    wheelGlow,
    label: new THREE.Vector3(t.x, 1.55, t.z - 0.2),
  };
}

/** Stake colours: one denomination per ten-chip step on the stack. */
export const STAKE_COLOURS = [0xc9a663, 0x9d1228, 0x0c6b3e, 0x0b0b0c] as const;

/* ---------------------------------------------------------------- */
/* Slot machine                                                      */
/* ---------------------------------------------------------------- */

export const SLOT = { x: 2.3, z: -3.9 } as const;

const REEL_RADIUS = 0.3;
const REEL_WIDTH = 0.2;
const REEL_Y = 1.42;
const REEL_SPACING = 0.225;

/** A cylinder round the X axis whose texture runs round the circumference. */
function reelGeometry(radius: number, width: number, segments = 72) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const y = Math.sin(a);
    const z = Math.cos(a);
    for (const side of [-1, 1]) {
      positions.push((side * width) / 2, y * radius, z * radius);
      normals.push(0, y, z);
      // Canvas +x runs up the reel (angle); canvas top is the left end.
      uvs.push(i / segments, side < 0 ? 1 : 0);
    }
    if (i < segments) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

/** Local rotation.x that puts strip position `pos` on the payline. */
export const reelRotation = (pos: number) =>
  (pos + 0.5) * ((Math.PI * 2) / REEL_LENGTH);

function plaqueTexture(lines: readonly string[]) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2a0b14');
  g.addColorStop(1, '#14050a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#c9a663';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ecd699';
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? 600 : 500} ${i === 0 ? 40 : 26}px "Bodoni Moda", Georgia, serif`;
    ctx.letterSpacing = i === 0 ? '8px' : '4px';
    ctx.fillText(line, 256, 90 + i * 48);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildSlots(
  scene: THREE.Object3D,
  m: CasinoMaterials,
  marquee: THREE.Texture | null,
) {
  const g = new THREE.Group();
  g.position.set(SLOT.x, 0, SLOT.z);
  scene.add(g);

  // Plinth, lower cabinet and corner brass.
  box(g, m.darkWalnut, [1.24, 0.1, 0.92], [0, 0.05, 0.02]);
  box(g, m.brassPolished, [1.26, 0.02, 0.94], [0, 0.11, 0.02]);
  box(g, m.enamel, [1.12, 0.88, 0.8], [0, 0.55, 0]);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(
        g,
        m.brassPolished,
        [0.035, 0.88, 0.035],
        [sx * 0.565, 0.55, sz * 0.4],
      );
    }
  }
  box(g, m.brassPolished, [1.14, 0.03, 0.82], [0, 0.995, 0]);
  // Backlit amber panels flanking the front of the cabinet.
  const reeded = reededGlass();
  for (const sx of [-1, 1]) {
    box(g, m.brassPolished, [0.2, 0.56, 0.02], [sx * 0.4, 0.56, 0.402]);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.53),
      new THREE.MeshBasicMaterial({
        map: reeded,
        color: new THREE.Color(1.5, 1.25, 1),
      }),
    );
    panel.position.set(sx * 0.4, 0.56, 0.413);
    g.add(panel);
  }
  // Plaque and coin tray.
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.21),
    new THREE.MeshBasicMaterial({
      map: plaqueTexture(['SALON No. 1', 'THE THIRTY CLUB', 'ONE OF ONE']),
      color: new THREE.Color(1.15, 1.05, 0.95),
    }),
  );
  plaque.position.set(0, 0.63, 0.41);
  g.add(plaque);
  box(g, m.brassPolished, [0.46, 0.25, 0.015], [0, 0.63, 0.402]);
  rounded(g, m.brassPolished, [0.46, 0.14, 0.12], [0, 0.26, 0.4], 0.02);
  box(
    g,
    new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.6 }),
    [0.38, 0.08, 0.05],
    [0, 0.26, 0.45],
  );

  // Control console (a sloped shelf) with the lamp-buttons.
  const console_ = new THREE.Group();
  console_.position.set(0, 1.04, 0.43);
  console_.rotation.x = -0.32;
  g.add(console_);
  box(console_, m.enamel, [1.12, 0.07, 0.3], [0, 0, 0]);
  box(console_, m.brassPolished, [1.14, 0.014, 0.012], [0, 0.04, 0.15]);
  const button = mesh(
    new THREE.CylinderGeometry(0.06, 0.066, 0.03, 28),
    m.brassPolished,
  );
  button.position.set(0, 0.05, 0);
  button.userData.static = false;
  console_.add(button);
  const buttonLamp = new THREE.MeshBasicMaterial({
    color: new THREE.Color(2.4, 0.25, 0.25),
  });
  const lampMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.046, 0.046, 0.012, 24),
    buttonLamp,
  );
  lampMesh.position.set(0, 0.068, 0);
  console_.add(lampMesh);
  for (const sx of [-1, 1]) {
    for (const k of [0, 1]) {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 10, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.4, 0.7) }),
      );
      lamp.position.set(sx * (0.22 + k * 0.12), 0.05, 0.02);
      console_.add(lamp);
    }
  }

  // Head: enamel body with a brass-framed window.
  // The head is built round the reel window (a solid box would hide it).
  const winW = 0.74;
  const winH = 0.52;
  const sideW = (1.02 - winW) / 2;
  const top = REEL_Y + winH / 2;
  const bottom = REEL_Y - winH / 2;
  for (const sx of [-1, 1]) {
    box(
      g,
      m.enamel,
      [sideW, 1.1, 0.72],
      [sx * (winW / 2 + sideW / 2), 1.55, -0.02],
    );
  }
  box(g, m.enamel, [winW, 2.1 - top, 0.72], [0, (top + 2.1) / 2, -0.02]);
  box(g, m.enamel, [winW, bottom - 1.0, 0.72], [0, (1.0 + bottom) / 2, -0.02]);
  box(g, m.enamel, [1.02, 1.1, 0.1], [0, 1.55, -0.33]);
  for (const sx of [-1, 1]) {
    box(g, m.brassPolished, [0.03, 1.1, 0.03], [sx * 0.51, 1.55, 0.34]);
  }
  const fz = 0.352;
  box(
    g,
    m.brassPolished,
    [winW + 0.12, 0.06, 0.07],
    [0, REEL_Y + winH / 2 + 0.03, fz],
  );
  box(
    g,
    m.brassPolished,
    [winW + 0.12, 0.06, 0.07],
    [0, REEL_Y - winH / 2 - 0.03, fz],
  );
  box(
    g,
    m.brassPolished,
    [0.06, winH + 0.12, 0.07],
    [-winW / 2 - 0.03, REEL_Y, fz],
  );
  box(
    g,
    m.brassPolished,
    [0.06, winH + 0.12, 0.07],
    [winW / 2 + 0.03, REEL_Y, fz],
  );
  box(
    g,
    new THREE.MeshStandardMaterial({ color: 0x050303, roughness: 0.7 }),
    [winW, winH, 0.3],
    [0, REEL_Y, 0.1],
  );

  // Reels.
  const reels: THREE.Mesh[] = [];
  const reelMaterials: THREE.MeshStandardMaterial[] = [];
  for (let r = 0; r < 3; r += 1) {
    const tex = reelTexture(r);
    const material = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.3,
      roughness: 0.45,
    });
    reelMaterials.push(material);
    const reel = new THREE.Mesh(
      reelGeometry(REEL_RADIUS, REEL_WIDTH),
      material,
    );
    reel.position.set((r - 1) * REEL_SPACING, REEL_Y, 0.04);
    reel.rotation.x = reelRotation(r);
    g.add(reel);
    reels.push(reel);
    // Brass divider between reels.
    if (r > 0)
      box(
        g,
        m.brassPolished,
        [0.012, winH, 0.04],
        [(r - 0.5) * REEL_SPACING - REEL_SPACING / 2 + 0.0, REEL_Y, fz - 0.02],
      );
  }
  // Curvature shading over the reels, and the glass.
  const shade = document.createElement('canvas');
  shade.width = 4;
  shade.height = 128;
  const sctx = shade.getContext('2d')!;
  const sg = sctx.createLinearGradient(0, 0, 0, 128);
  sg.addColorStop(0, 'rgba(0,0,0,0.85)');
  sg.addColorStop(0.28, 'rgba(0,0,0,0.12)');
  sg.addColorStop(0.5, 'rgba(0,0,0,0)');
  sg.addColorStop(0.72, 'rgba(0,0,0,0.12)');
  sg.addColorStop(1, 'rgba(0,0,0,0.85)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 4, 128);
  const shadeMaterial = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(shade),
    transparent: true,
    depthWrite: false,
  });
  const shadePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    shadeMaterial,
  );
  shadePlane.position.set(0, REEL_Y, fz - 0.012);
  g.add(shadePlane);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), m.glass);
  glass.position.set(0, REEL_Y, fz + 0.002);
  g.add(glass);

  // The payline and its win highlight.
  const payline = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, 0.006),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.2, 0.35, 0.3),
      transparent: true,
      opacity: 0.55,
    }),
  );
  payline.position.set(0, REEL_Y, fz - 0.008);
  g.add(payline);
  for (const sx of [-1, 1]) {
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.05, 3),
      m.brassPolished,
    );
    arrow.rotation.z = (-sx * Math.PI) / 2;
    arrow.position.set(sx * (winW / 2 + 0.085), REEL_Y, fz);
    g.add(arrow);
  }
  const winGlow = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.0, 0.66, 0.26),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const winBar = new THREE.Mesh(new THREE.PlaneGeometry(winW, 0.17), winGlow);
  winBar.position.set(0, REEL_Y, fz - 0.004);
  winBar.renderOrder = 3;
  g.add(winBar);

  // Marquee and the crowning arch with the 30 medallion.
  const marqueeMaterial = new THREE.MeshBasicMaterial({
    map: marquee ?? marqueeTexture(),
    color: new THREE.Color(1.25, 1.15, 1.05),
  });
  const marqueePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.22),
    marqueeMaterial,
  );
  marqueePlane.position.set(0, 1.9, fz);
  g.add(marqueePlane);
  box(g, m.brassPolished, [0.96, 0.03, 0.06], [0, 2.025, fz - 0.005]);
  box(g, m.brassPolished, [0.96, 0.03, 0.06], [0, 1.775, fz - 0.005]);
  for (const sx of [-1, 1])
    box(g, m.brassPolished, [0.03, 0.28, 0.06], [sx * 0.465, 1.9, fz - 0.005]);
  const archShape = new THREE.Shape();
  archShape.moveTo(-0.52, 0);
  archShape.lineTo(-0.52, 0.06);
  archShape.absarc(0, 0.06, 0.52, Math.PI, 0, true);
  archShape.lineTo(0.52, 0);
  archShape.closePath();
  const arch = mesh(
    new THREE.ExtrudeGeometry(archShape, {
      depth: 0.6,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
      curveSegments: 24,
    }),
    m.enamel,
  );
  arch.position.set(0, 2.1, -0.32);
  g.add(arch);
  const archEdge = mesh(
    new THREE.TorusGeometry(0.52, 0.014, 8, 40, Math.PI),
    m.brassPolished,
  );
  archEdge.position.set(0, 2.16, fz - 0.005);
  g.add(archEdge);
  const medallion = new THREE.Mesh(
    new THREE.CircleGeometry(0.17, 36),
    new THREE.MeshBasicMaterial({
      map: medallionTexture(),
      color: new THREE.Color(1.3, 1.2, 1.05),
    }),
  );
  medallion.position.set(0, 2.3, fz - 0.002);
  g.add(medallion);
  box(g, m.brassPolished, [0.02, 0.1, 0.02], [0, 2.7 - 0.12, 0]);
  const finial = mesh(new THREE.SphereGeometry(0.035, 12, 10), m.brassPolished);
  finial.position.set(0, 2.66, 0);
  g.add(finial);

  // Bulbs round the marquee, the window and the arch, chased by the scene.
  const bulbPoints: THREE.Vector3[] = [];
  const bulbZ = fz + 0.01;
  for (let i = 0; i <= 12; i += 1) {
    bulbPoints.push(
      new THREE.Vector3(-0.5 + (i / 12) * 1.0, 2.05 + 0.0, bulbZ),
    );
  }
  for (let i = 1; i < 10; i += 1) {
    const a = Math.PI - (i / 10) * Math.PI;
    bulbPoints.push(
      new THREE.Vector3(
        Math.cos(a) * 0.57,
        2.16 + Math.sin(a) * 0.57 * 0.72,
        bulbZ,
      ),
    );
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      bulbPoints.push(
        new THREE.Vector3(
          sx * (winW / 2 + 0.1),
          REEL_Y - winH / 2 + (i / 5) * winH,
          bulbZ,
        ),
      );
    }
  }
  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.014, 8, 6),
    m.bulb,
    bulbPoints.length,
  );
  const mx = new THREE.Matrix4();
  bulbPoints.forEach((p, i) => {
    mx.makeTranslation(p.x, p.y, p.z);
    bulbs.setMatrixAt(i, mx);
    bulbs.setColorAt(i, new THREE.Color(2, 1.5, 0.8));
  });
  g.add(bulbs);

  // The lever: pivots at the right-hand side.
  const lever = new THREE.Group();
  lever.position.set(0.6, 1.1, 0.0);
  lever.rotation.x = -0.25;
  g.add(lever);
  const arm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.6, 12),
    m.brassPolished,
  );
  arm.position.y = 0.3;
  lever.add(arm);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 20, 14),
    new THREE.MeshPhysicalMaterial({
      color: 0x8a0f24,
      roughness: 0.2,
      clearcoat: 1,
    }),
  );
  knob.position.y = 0.62;
  lever.add(knob);
  const mount = mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.06, 16),
    m.brassPolished,
  );
  mount.rotation.z = Math.PI / 2;
  mount.position.set(0.58, 1.1, 0);
  g.add(mount);

  // Glow and the hit area (the whole machine, plus the lever).
  const pool = lightPool(
    scene,
    [2.6, 2.6],
    [SLOT.x, 0.01, SLOT.z + 0.4],
    [-Math.PI / 2, 0, 0],
    0xffc88a,
    0.14,
  );
  const marqueeHalo = halo(g, 1.9, [0, 1.9, 0.6], 0.22, 0xffcf98);
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.4, 1.1),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  proxy.position.set(SLOT.x, 1.2, SLOT.z + 0.1);
  scene.add(proxy);
  const leverProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  leverProxy.position.set(SLOT.x + 0.6, 1.75, SLOT.z + 0.1);
  scene.add(leverProxy);
  const buttonProxy = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  buttonProxy.position.set(SLOT.x, 1.1, SLOT.z + 0.5);
  scene.add(buttonProxy);

  return {
    group: g,
    reels,
    reelMaterials,
    lever,
    bulbs,
    bulbCount: bulbPoints.length,
    winGlow,
    buttonLamp,
    marqueeHalo,
    pool,
    proxy,
    leverProxy,
    buttonProxy,
    label: new THREE.Vector3(SLOT.x, 2.45, SLOT.z + 0.3),
  };
}

export { lathe };
