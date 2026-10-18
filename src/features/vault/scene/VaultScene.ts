/**
 * The real-time Private Gift Vault. Presentation only: the vault view tells
 * it which compartments exist and in what state, where the camera belongs,
 * and when to play an opening the server has ALREADY committed. It never
 * decides a state, a clue or a location, and it never sees a location.
 * Loaded lazily; the CSS chamber is its poster and its fallback.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mergeStatic } from '../../entrance/scene/architecture';
import {
  glowTexture,
  loadSceneFonts,
} from '../../entrance/scene/canvasTextures';
import { GrainVignette, HdrClamp } from '../../entrance/scene/postfx';
import {
  judgeFrameTime,
  qualitySettings,
  type QualityTier,
} from '../../entrance/scene/sceneMath';
import type { VaultState } from '../../../shared/concierge/types';
import {
  buildChamber,
  buildCompartment,
  buildDecorativeBoxes,
  createVaultMaterials,
  vaultEnvironment,
  type Compartment,
  type VaultMaterials,
} from './vaultArchitecture';
import {
  approach,
  assignCells,
  blendShot,
  BANK,
  cellFrame,
  chamberShot,
  detentAt,
  distance,
  DOOR_OPEN,
  entryShot,
  focusShot,
  fovFor,
  insideShot,
  openingPose,
  readyBreath,
  type OpeningPose,
  type Shot,
} from './vaultMath';

export interface SceneCompartment {
  id: string;
  number: number;
  state: VaultState;
}

export type VaultView = 'chamber' | 'focus' | 'inside';

export interface VaultSceneInput {
  focus: string | null;
  view: VaultView;
  states: Record<string, VaultState>;
  /** A compartment the server has opened whose ceremony has not played. */
  sealed: string | null;
  reducedMotion: boolean;
}

export interface LabelAnchor {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export type VaultFallbackReason = 'performance' | 'context-lost' | 'error';
export type Mechanism = 'tick' | 'bolts' | 'release' | 'swing' | 'glow';

export interface VaultEvents {
  onReady(): void;
  onFallback(reason: VaultFallbackReason): void;
  onFrame(anchors: LabelAnchor[]): void;
  onSelect(id: string): void;
  onMechanism(kind: Mechanism): void;
}

const WARMUP_MS = 1000;
const SAMPLE_MS = 1500;
const INTRO_SECONDS = 3.6;
const MOVE_SECONDS = 1.7;
const DUST = 110;

interface Ceremony {
  compartment: Compartment;
  again: boolean;
  from: Shot;
  t0: number;
  resolve(): void;
  lastDetent: number;
  cues: Set<Mechanism>;
  pose: OpeningPose;
}

export class VaultScene {
  static async create(
    canvas: HTMLCanvasElement,
    events: VaultEvents,
    compartments: readonly SceneCompartment[],
    intro: boolean,
  ) {
    await loadSceneFonts();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    try {
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const materials = await createVaultMaterials(anisotropy);
      const scene = new VaultScene(
        canvas,
        renderer,
        materials,
        events,
        compartments,
        intro,
      );
      await scene.start();
      return scene;
    } catch (error) {
      renderer.dispose();
      renderer.forceContextLoss();
      throw error;
    }
  }

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.03, 30);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private readonly compartments: Compartment[];
  private readonly byId = new Map<string, Compartment>();
  private readonly lights;
  private readonly env: THREE.WebGLRenderTarget;
  private readonly dust: {
    positions: Float32Array;
    geometry: THREE.BufferGeometry;
  };
  private readonly doors = new Map<string, number>();
  private readonly opened = new Set<string>();
  private input: VaultSceneInput | null = null;
  private pose: Shot;
  private move: { from: Shot; t0: number; duration: number } | null = null;
  private ceremony: Ceremony | null = null;
  private targetKey = '';
  private hover: string | null = null;
  private elapsed = 0;
  private lastRender = -1;
  private lastActivity = 0;
  private ready = false;
  private disposed = false;
  private tier: QualityTier = 0;
  private settled = false;
  private warmupFrom = -1;
  private sampleFrom = -1;
  private sampleFrames = 0;
  private readonly projected = new THREE.Vector3();

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly materials: VaultMaterials,
    private readonly events: VaultEvents,
    list: readonly SceneCompartment[],
    private readonly intro: boolean,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color(0x050403);
    scene.fog = new THREE.FogExp2(0x070504, 0.05);
    this.env = vaultEnvironment(renderer);
    scene.environment = this.env.texture;
    scene.environmentIntensity = 0.4;

    const cells = assignCells(list.length);
    const statics = new THREE.Group();
    scene.add(statics);
    buildChamber(statics, materials);
    buildDecorativeBoxes(statics, materials, cells);
    mergeStatic(statics);
    this.compartments = list
      .slice(0, cells.length)
      .map((c, i) =>
        buildCompartment(scene, materials, c.id, c.number, cells[i]!),
      );
    for (const c of this.compartments) {
      this.byId.set(c.id, c);
      const isOpen = c && list.find((x) => x.id === c.id)?.state === 'opened';
      this.doors.set(c.id, isOpen ? DOOR_OPEN : 0);
      if (isOpen) this.opened.add(c.id);
    }

    // Light: a dim hemisphere, the oculus pool (the one shadow caster), a
    // grazing wash across the bank, the vault door's glow, and one warm
    // lamp that follows Alise into whichever compartment she opens.
    const hemi = new THREE.HemisphereLight(0x4a3628, 0x0b0806, 0.75);
    const oculus = new THREE.SpotLight(0xffd8a8, 14, 10, 0.9, 0.85, 1.4);
    oculus.position.set(0, 4.5, -0.4);
    oculus.target.position.set(0, 0, -1.1);
    oculus.castShadow = true;
    oculus.shadow.mapSize.set(1024, 1024);
    oculus.shadow.bias = -0.0004;
    oculus.shadow.normalBias = 0.02;
    // Two washes cross the bank from either side, so their reflections on the
    // metal doors fall away to the far side instead of back at Alise.
    const washes = [-1, 1].map((side) => {
      const light = new THREE.SpotLight(0xffd2a0, 6, 10, 0.75, 1, 1.25);
      light.position.set(side * 2.3, 3.7, 1.3);
      light.target.position.set(-side * 0.9, 1.15, -BANK.radius);
      return light;
    });
    const portal = new THREE.PointLight(0xffb878, 4, 5, 1.8);
    portal.position.set(0, 2.6, 2.4);
    // Outside the great door, where the first visit begins: a warm overhead
    // light on the door's face and the mouth of the bore.
    const vestibule = new THREE.SpotLight(0xffcf9a, 9, 8, 0.85, 0.9, 1.4);
    vestibule.position.set(0.4, 3.9, 5.2);
    vestibule.target.position.set(0.6, 1.3, 2.9);
    const lamp = new THREE.PointLight(0xffd29a, 0, 1.4, 2);
    scene.add(
      hemi,
      oculus,
      oculus.target,
      ...washes,
      ...washes.map((w) => w.target),
      portal,
      vestibule,
      vestibule.target,
      lamp,
    );
    this.lights = { hemi, oculus, washes, portal, lamp };

    const positions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 2.4;
      positions[i * 3 + 1] = Math.random() * 4.4;
      positions[i * 3 + 2] = -1.6 + Math.random() * 2.4;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: 0.01,
          map: glowTexture(),
          color: 0xffdcae,
          transparent: true,
          opacity: 0.35,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    this.dust = { positions, geometry };

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.composer.addPass(new ShaderPass(HdrClamp));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      0.3,
      0.5,
      1.0,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainVignette);
    this.composer.addPass(this.grain);

    this.pose = chamberShot(1);
    this.applyTier(0);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    if (import.meta.env.DEV && window.location.search.includes('lookdev'))
      this.settled = true;
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('click', this.onClick);
    window.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
  }

  private async start() {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (!this.disposed) this.renderer.setAnimationLoop(this.loop);
  }

  /* ------------------------------------------------------------ */
  /* Public control                                                */
  /* ------------------------------------------------------------ */

  update(input: VaultSceneInput) {
    if (import.meta.env.DEV)
      (window as unknown as { __vault?: VaultScene }).__vault = this;
    const first = !this.input;
    this.input = input;
    if (first) {
      const aspect = this.camera.aspect;
      const start =
        this.intro && !input.reducedMotion ? entryShot(aspect) : this.target();
      this.pose = start;
      this.targetKey = this.key();
      if (this.intro && !input.reducedMotion)
        this.move = { from: start, t0: 0, duration: INTRO_SECONDS };
    } else if (!this.ceremony && this.key() !== this.targetKey) {
      this.targetKey = this.key();
      this.move = {
        from: { ...this.pose },
        t0: this.elapsed,
        duration: input.reducedMotion ? 0.0001 : MOVE_SECONDS,
      };
    }
    this.lastActivity = this.elapsed;
  }

  /**
   * Plays the opening of `id` (already committed by the server). Resolves
   * when the camera has reached the envelope. `again` skips the mechanism.
   */
  playOpening(id: string, again: boolean): Promise<void> {
    const compartment = this.byId.get(id);
    if (this.disposed || !compartment) return Promise.resolve();
    this.ceremony?.resolve();
    return new Promise<void>((resolve) => {
      this.move = null;
      this.ceremony = {
        compartment,
        again,
        from: { ...this.pose },
        t0: this.elapsed,
        resolve,
        lastDetent: 0,
        cues: new Set(),
        pose: openingPose(0, this.input?.reducedMotion ?? false, again),
      };
      this.lastActivity = this.elapsed;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('click', this.onClick);
    window.removeEventListener('pointermove', this.onPointerMove);
    this.ceremony?.resolve();
    const textures = new Set<THREE.Texture>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry?.dispose();
        const list = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of list as THREE.Material[])
          materials.add(material);
      }
    });
    for (const material of [...materials, ...Object.values(this.materials)]) {
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    textures.forEach((t) => t.dispose());
    this.env.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    // iOS caps live WebGL contexts; release ours promptly.
    this.renderer.forceContextLoss();
  }

  /* ------------------------------------------------------------ */
  /* Input                                                         */
  /* ------------------------------------------------------------ */

  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.events.onFallback('context-lost');
  };

  private pick(clientX: number, clientY: number): string | null {
    const box = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - box.left) / box.width) * 2 - 1,
      -((clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const [hit] = this.raycaster.intersectObjects(
      this.compartments.map((c) => c.proxy),
      false,
    );
    return (hit?.object.userData.compartment as string | undefined) ?? null;
  }

  private readonly onClick = (event: MouseEvent) => {
    this.lastActivity = this.elapsed;
    if (this.ceremony) return;
    const id = this.pick(event.clientX, event.clientY);
    if (id) this.events.onSelect(id);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1,
    );
    this.lastActivity = this.elapsed;
    if (event.pointerType === 'touch') {
      this.hover = null;
      return;
    }
    this.hover = this.ceremony ? null : this.pick(event.clientX, event.clientY);
    this.canvas.style.cursor = this.hover ? 'pointer' : '';
  };

  /* ------------------------------------------------------------ */
  /* Rendering                                                     */
  /* ------------------------------------------------------------ */

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lastActivity = this.elapsed;
  }

  private applyTier(tier: QualityTier) {
    this.tier = tier;
    const q = qualitySettings(tier, window.devicePixelRatio);
    this.renderer.setPixelRatio(q.pixelRatio);
    this.composer.setPixelRatio(q.pixelRatio);
    this.materials.floor.clearcoat = q.reflections ? 1 : 0.5;
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.lights.oculus.castShadow = q.shadows;
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const list = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of list as THREE.Material[]) m.needsUpdate = true;
        }
      });
    }
    this.bloom.enabled = q.bloom;
    this.resize();
  }

  private measure(nowMs: number) {
    if (this.settled) return;
    if (this.warmupFrom < 0) this.warmupFrom = nowMs;
    if (nowMs - this.warmupFrom < WARMUP_MS) return;
    if (this.sampleFrom < 0) {
      this.sampleFrom = nowMs;
      this.sampleFrames = 0;
      return;
    }
    this.sampleFrames += 1;
    const spanMs = nowMs - this.sampleFrom;
    if (spanMs > SAMPLE_MS * 4) {
      // A long gap (backgrounded, a stall) is not a slow frame: start over.
      this.sampleFrom = -1;
      this.warmupFrom = nowMs;
      return;
    }
    if (spanMs < SAMPLE_MS) return;
    const verdict = judgeFrameTime(spanMs / this.sampleFrames, this.tier);
    this.sampleFrom = -1;
    this.warmupFrom = nowMs;
    if (verdict === 'keep') this.settled = true;
    if (verdict === 'lower') this.applyTier((this.tier + 1) as QualityTier);
    if (verdict === 'fallback') this.events.onFallback('performance');
  }

  private readonly loop = (time: number) => {
    try {
      this.frame(time);
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[vault] frame failed', error);
      this.renderer.setAnimationLoop(null);
      this.events.onFallback('error');
    }
  };

  private key() {
    const i = this.input;
    return i ? `${i.view}:${i.view === 'chamber' ? '' : (i.focus ?? '')}` : '';
  }

  /** Where the camera belongs for the current input. */
  private target(): Shot {
    const input = this.input;
    const aspect = this.camera.aspect;
    const c = input?.focus ? this.byId.get(input.focus) : undefined;
    if (!input || !c || input.view === 'chamber') return chamberShot(aspect);
    const frame = cellFrame(c.cell);
    return input.view === 'inside'
      ? insideShot(frame, aspect)
      : focusShot(frame, aspect);
  }

  private frame(time: number) {
    const input = this.input;
    if (!input || this.disposed) return;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    const t = this.elapsed;
    const reduced = input.reducedMotion;

    const busy =
      this.move !== null ||
      this.ceremony !== null ||
      t - this.lastActivity < 2.5 ||
      !this.settled;
    if (!busy && t - this.lastRender < 1 / 31) return;
    this.lastRender = t;

    this.updateCeremony(t, reduced);
    this.updateCamera(dt, t, reduced);
    this.updateCompartments(dt, t, reduced);

    if (!reduced) {
      const { positions } = this.dust;
      for (let i = 0; i < DUST; i += 1) {
        const y = positions[i * 3 + 1]! + dt * 0.018 * (1 + (i % 5) * 0.3);
        positions[i * 3 + 1] = y > 4.4 ? 0.1 : y;
      }
      this.dust.geometry.attributes.position!.needsUpdate = true;
    }

    this.grain.uniforms.time!.value = t % 10;
    this.composer.render(dt);
    this.events.onFrame(this.anchors());
    if (!this.ready) {
      this.ready = true;
      this.events.onReady();
    }
    this.measure(time);
  }

  private updateCeremony(t: number, reduced: boolean) {
    const c = this.ceremony;
    if (!c) return;
    const pose = openingPose(t - c.t0, reduced, c.again);
    c.pose = pose;
    const cue = (kind: Mechanism, when: boolean) => {
      if (when && !c.cues.has(kind)) {
        c.cues.add(kind);
        this.events.onMechanism(kind);
      }
    };
    if (!c.again && !reduced) {
      const detent = detentAt(pose.dial);
      if (detent !== c.lastDetent) {
        c.lastDetent = detent;
        this.events.onMechanism('tick');
      }
      cue('bolts', pose.bolts > 0.85);
      cue('glow', pose.seam > 0.5);
      cue('release', pose.door > 0.01);
      cue('swing', pose.door > 0.25);
    }
    if (pose.done) {
      this.opened.add(c.compartment.id);
      this.doors.set(c.compartment.id, DOOR_OPEN);
      // The camera rests where the ceremony ended; React then asks for 'inside'.
      this.pose = this.ceremonyShot(c, pose);
      this.targetKey = `inside:${c.compartment.id}`;
      this.ceremony = null;
      c.resolve();
    }
  }

  private ceremonyShot(c: Ceremony, pose: OpeningPose): Shot {
    const aspect = this.camera.aspect;
    const frame = cellFrame(c.compartment.cell);
    const travelled = blendShot(c.from, focusShot(frame, aspect), pose.travel);
    return blendShot(travelled, insideShot(frame, aspect), pose.push);
  }

  private updateCamera(dt: number, t: number, reduced: boolean) {
    let shot: Shot;
    if (this.ceremony) {
      shot = this.ceremonyShot(this.ceremony, this.ceremony.pose);
    } else if (this.move) {
      const p = Math.min(1, (t - this.move.t0) / this.move.duration);
      shot = blendShot(this.move.from, this.target(), p);
      if (p >= 1) this.move = null;
    } else {
      shot = this.target();
    }
    this.pose = shot;
    const idle =
      !this.move &&
      !this.ceremony &&
      !reduced &&
      this.input?.view === 'chamber';
    this.parallax.lerp(
      idle ? this.pointer : new THREE.Vector2(),
      Math.min(1, dt * 2),
    );
    const sway = idle ? Math.sin(t * 0.25) * 0.012 : 0;
    const cam = this.camera;
    cam.position.set(
      shot.eye[0] + this.parallax.x * 0.12,
      shot.eye[1] - this.parallax.y * 0.04 + sway,
      shot.eye[2],
    );
    cam.lookAt(shot.look[0], shot.look[1], shot.look[2]);
    const fov = fovFor(
      cam.aspect,
      distance(shot.eye, shot.look),
      shot.halfWidth,
      shot.halfHeight,
    );
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }

  private updateCompartments(dt: number, t: number, reduced: boolean) {
    const input = this.input!;
    const breath = readyBreath(t, reduced);
    let lampOn = 0;
    let lampAt: Compartment | null = null;
    for (const c of this.compartments) {
      const inCeremony =
        this.ceremony?.compartment === c ? this.ceremony.pose : null;
      let state = input.states[c.id] ?? 'locked';
      // An opening the ceremony has not yet shown stays closed and waiting.
      if (input.sealed === c.id && !this.opened.has(c.id)) state = 'ready';
      if (
        state === 'opened' &&
        !this.opened.has(c.id) &&
        !inCeremony &&
        input.sealed !== c.id
      )
        this.opened.add(c.id);
      const isOpen = this.opened.has(c.id);
      const focused = input.focus === c.id;
      const hovered = this.hover === c.id;

      // Door, dial and bolts.
      let door: number;
      if (inCeremony) {
        door = inCeremony.door * DOOR_OPEN;
        c.dial.rotation.y = inCeremony.dial;
        c.bolts.position.x = -0.05 * inCeremony.bolts;
      } else {
        const goal = isOpen ? DOOR_OPEN : 0;
        door = reduced
          ? goal
          : approach(this.doors.get(c.id) ?? 0, goal, dt, 3);
        c.bolts.position.x = isOpen ? -0.05 : 0;
      }
      this.doors.set(c.id, door);
      c.hinge.rotation.y = -door;

      // Light: ready seams breathe; open compartments glow from within.
      const ready = state === 'ready' && !isOpen;
      const seam = inCeremony
        ? Math.max(inCeremony.door > 0 ? 0 : 0.55, inCeremony.seam * 0.85) *
          (1 - inCeremony.door)
        : ready
          ? breath * (focused ? 0.7 : 0.55)
          : 0;
      c.seam.opacity = Math.min(1, seam);
      c.plate.emissiveIntensity =
        (ready ? 0.22 * breath : 0) + (focused || hovered ? 0.12 : 0);
      const interior = inCeremony ? inCeremony.interior : isOpen ? 1 : 0;
      c.lining.emissiveIntensity = interior * (focused ? 0.32 : 0.22);
      (c.envelope.material as THREE.MeshStandardMaterial).emissiveIntensity =
        interior * (focused ? 0.035 : 0.02);
      if ((focused || inCeremony) && interior > lampOn) {
        lampOn = interior;
        lampAt = c;
      }
    }
    // House lights lower as Alise approaches a compartment: the grazing wash
    // flatters the bank from afar but glares on brass at close range.
    const close = this.ceremony !== null || input.view !== 'chamber';
    const wash = close ? 2 : 6;
    for (const light of this.lights.washes)
      light.intensity = reduced
        ? wash
        : approach(light.intensity, wash, dt, 1.5);
    const lamp = this.lights.lamp;
    if (lampAt) {
      const frame = cellFrame(lampAt.cell);
      lamp.position.set(
        frame.centre[0] + frame.normal[0] * 0.08,
        frame.centre[1] + 0.12,
        frame.centre[2] + frame.normal[2] * 0.08,
      );
    }
    lamp.intensity = reduced
      ? lampOn * 0.45
      : approach(lamp.intensity, lampOn * 0.45, dt, 4);
  }

  private anchors(): LabelAnchor[] {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    return this.compartments.map((c) => {
      const p = this.projected.copy(c.anchor).project(this.camera);
      return {
        id: c.id,
        x: ((p.x + 1) / 2) * width,
        y: ((1 - p.y) / 2) * height,
        visible: p.z < 1 && Math.abs(p.x) < 0.82 && Math.abs(p.y) < 0.92,
      };
    });
  }
}
