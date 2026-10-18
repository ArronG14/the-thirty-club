/**
 * The real-time Grand Casino. Presentation only: the casino UI tells it
 * which station the camera belongs at and what each game decided; it never
 * decides an outcome, a prize or navigation. One scene, one WebGL context:
 * the roulette wheel and the slot reels live in the lobby itself, so the
 * camera simply travels to them. Loaded lazily; the CSS lobby is its poster
 * and its fallback.
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
import type { SceneAssetKey } from '../config/casinoAssets';
import {
  buildChandelier,
  buildFurniture,
  buildShell,
  casinoEnvironment,
  createCasinoMaterials,
  ROOM,
  type CasinoMaterials,
  type WallSpec,
} from './casinoArchitecture';
import {
  approach,
  ballState,
  cameraPose,
  finalStop,
  fovFor,
  planReel,
  planSpin,
  pocketAngle,
  reelPosition,
  reelTotalSeconds,
  SHOTS,
  shotFor,
  TRAVEL_SECONDS,
  viaFor,
  WHEEL,
  wheelAngle,
  type ReelPlan,
  type Shot,
  type SpinPlan,
  type Station,
} from './casinoMath';
import {
  buildRoulette,
  buildSlots,
  reelRotation,
  STAKE_COLOURS,
  WHEEL_POS,
} from './casinoStations';
import { artTexture } from './casinoTextures';
import { loadOptional } from './optionalTexture';

export interface CasinoInput {
  /** Where the camera belongs. A change starts a cinematic move. */
  station: Station;
  reducedMotion: boolean;
  /** Lights fall for a prize reveal. */
  dimmed: boolean;
  /** Chips on the bet slip, drawn as a stack on the felt. */
  stake: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface CasinoAnchors {
  roulette: ScreenPoint;
  slots: ScreenPoint;
}

export type CasinoTarget = 'roulette' | 'slots';
export type CasinoFallbackReason = 'performance' | 'context-lost' | 'error';

export interface CasinoEvents {
  onReady(): void;
  onFallback(reason: CasinoFallbackReason): void;
  onFrame(anchors: CasinoAnchors): void;
  onSelect(target: CasinoTarget): void;
  /** The lever or the button on the machine was touched. */
  onLever(): void;
  /** The camera has finished travelling to `station`. */
  onArrive(station: Station): void;
}

export type AssetUrls = Partial<Record<SceneAssetKey, string | null>>;

/** Where Alise's stake is stacked on the felt (near her end of the table). */
const TABLE_STAKE = { x: -1.4 + 0.3, z: -1.3 + 1.2 } as const;

const DUST = 140;
const WARMUP_MS = 1000;
const SAMPLE_MS = 1500;
const TAU = Math.PI * 2;

interface RouletteSpin {
  plan: SpinPlan;
  from: number;
  resolve(): void;
  resolved: boolean;
}

interface SlotSpin {
  plans: ReelPlan[];
  from: number;
  resolve(): void;
  resolved: boolean;
  lever: number;
}

export class CasinoScene {
  static async create(
    canvas: HTMLCanvasElement,
    events: CasinoEvents,
    assets: AssetUrls,
  ) {
    await loadSceneFonts();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    try {
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const materials = await createCasinoMaterials(anisotropy);
      const loader = new THREE.TextureLoader();
      const [left, centre, right, marquee, mural] = await Promise.all([
        loadOptional(loader, assets.wallArtLeft, anisotropy),
        loadOptional(loader, assets.wallArtCentre, anisotropy),
        loadOptional(loader, assets.wallArtRight, anisotropy),
        loadOptional(loader, assets.slotMarquee, anisotropy),
        loadOptional(loader, assets.ceilingMural, anisotropy),
      ]);
      if (mural) {
        materials.ceiling.map?.dispose();
        materials.ceiling.map = mural;
        materials.ceiling.needsUpdate = true;
      }
      const scene = new CasinoScene(canvas, renderer, materials, events, {
        left: left ?? artTexture(0),
        centre: centre ?? artTexture(1),
        right: right ?? artTexture(2),
        marquee,
      });
      await scene.start();
      return scene;
    } catch (error) {
      renderer.dispose();
      renderer.forceContextLoss();
      throw error;
    }
  }

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private readonly parts;
  private readonly lights;
  private readonly dust: {
    positions: Float32Array;
    geometry: THREE.BufferGeometry;
  };
  private readonly stakeColour = new THREE.Color();
  private input: CasinoInput | null = null;
  private station: Station = 'lobby';
  private pose: Shot = { ...SHOTS.lobby };
  private travel: {
    from: Shot;
    to: Shot;
    via: ReturnType<typeof viaFor>;
    t0: number;
    duration: number;
    station: Station;
  } | null = null;
  private roulette: RouletteSpin | null = null;
  private slot: SlotSpin | null = null;
  private rouletteRest = 0;
  private reelPositions = [0, 1, 2];
  private flash = { until: 0, strength: 0, long: false };
  private hover: CasinoTarget | null = null;
  private dim = 1;
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
  private winUntil = 0;
  private winKind: 'win' | 'jackpot' | null = null;
  /** DEVELOPMENT ONLY: overrides the camera while composing. */
  debugShot: Shot | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly materials: CasinoMaterials,
    private readonly events: CasinoEvents,
    art: {
      left: THREE.Texture;
      centre: THREE.Texture;
      right: THREE.Texture;
      marquee: THREE.Texture | null;
    },
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color(0x070304);
    scene.fog = new THREE.FogExp2(0x0d0507, 0.026);
    const env = casinoEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.45;

    const statics = new THREE.Group();
    scene.add(statics);
    const walls = wallSpecs(art);
    const shell = buildShell(statics, materials, walls);
    buildFurniture(statics, materials);
    const chandelier = buildChandelier(statics, materials);
    const roulette = buildRoulette(statics, materials);
    const slots = buildSlots(statics, materials, art.marquee);
    mergeStatic(statics);
    this.parts = { shell, chandelier, roulette, slots, env };

    // Lights: a dim hemisphere, the chandelier's pool (the one shadow
    // caster), and a spot on each station. Everything else is emissive.
    const hemi = new THREE.HemisphereLight(0x6a3530, 0x0f0807, 0.85);
    const house = new THREE.SpotLight(0xffd0a0, 26, 12, 1.0, 0.9, 1.5);
    house.position.set(0, 4.2, -1.4);
    house.target.position.set(0, 0, -1.4);
    house.castShadow = true;
    house.shadow.mapSize.set(1024, 1024);
    house.shadow.bias = -0.0004;
    house.shadow.normalBias = 0.02;
    const table = new THREE.SpotLight(0xffe2b8, 38, 7, 0.5, 0.7, 1.6);
    table.position.set(-1.4, 4.1, -0.5);
    table.target.position.set(-1.4, 0.9, -1.75);
    const machine = new THREE.SpotLight(0xffd9a8, 24, 7, 0.55, 0.7, 1.6);
    machine.position.set(2.3, 4.0, -1.6);
    machine.target.position.set(2.3, 1.3, -3.9);
    const fill = new THREE.PointLight(0xffb67a, 3.5, 7, 1.8);
    fill.position.set(0, 2.2, 3.2);
    scene.add(
      hemi,
      house,
      house.target,
      table,
      table.target,
      machine,
      machine.target,
      fill,
    );
    this.lights = { hemi, house, table, machine, fill };

    // Motes drifting through the light.
    const positions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 1] = Math.random() * 3.8;
      positions[i * 3 + 2] = -4 + Math.random() * 8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    scene.add(
      new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          size: 0.012,
          map: glowTexture(),
          color: 0xffdcae,
          transparent: true,
          opacity: 0.45,
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
      0.55,
      0.6,
      1.0,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainVignette);
    this.composer.addPass(this.grain);

    this.parts.roulette.ball.visible = false;
    this.applyTier(0);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    // Look-development builds (see tools/capture-casino) keep full quality in
    // software-rendered browsers; ordinary builds never set this.
    if (import.meta.env.VITE_CASINO_LOOKDEV === '1') this.settled = true;
    if (import.meta.env.DEV) {
      if (window.location.search.includes('lookdev')) this.settled = true;
    }
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

  update(input: CasinoInput) {
    if (import.meta.env.DEV)
      (window as unknown as { __casino?: CasinoScene }).__casino = this;
    if (!this.input) {
      this.station = input.station;
      this.pose = { ...shotFor(input.station, this.camera.aspect) };
    } else if (input.station !== this.station) {
      this.beginTravel(input.station, input.reducedMotion);
    }
    this.input = input;
    this.setStake(input.stake);
    this.lastActivity = this.elapsed;
  }

  /**
   * Runs the wheel and ball to `pocket` (an index on the wheel, as given by
   * `pocketIndex`). Resolves when the ball has settled; the wheel then
   * coasts to rest on its own.
   */
  spinRoulette(pocket: number): Promise<void> {
    if (this.disposed || this.roulette) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const plan = planSpin({
        pocket,
        wheelStart: this.rouletteRest,
        reducedMotion: this.input?.reducedMotion ?? false,
      });
      this.parts.roulette.ball.visible = true;
      this.roulette = { plan, from: this.elapsed, resolve, resolved: false };
      this.lastActivity = this.elapsed;
    });
  }

  /** Spins the three reels to `stops` (strip indices). Resolves on the last. */
  spinSlots(stops: readonly number[]): Promise<void> {
    if (this.disposed || this.slot) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const reduced = this.input?.reducedMotion ?? false;
      const plans = stops.map((stop, reel) =>
        planReel({
          start: this.reelPositions[reel]!,
          stop,
          reel,
          reducedMotion: reduced,
        }),
      );
      this.winKind = null;
      this.slot = {
        plans,
        from: this.elapsed,
        resolve,
        resolved: false,
        lever: 0,
      };
      this.lastActivity = this.elapsed;
    });
  }

  /** Lights the payline and warms the room after a result. */
  celebrate(kind: 'win' | 'jackpot') {
    this.winKind = kind;
    this.winUntil = this.elapsed + (kind === 'jackpot' ? 5 : 2.6);
    this.flash = {
      until: this.elapsed + (kind === 'jackpot' ? 2.4 : 1.2),
      strength: kind === 'jackpot' ? 1 : 0.55,
      long: kind === 'jackpot',
    };
    this.lastActivity = this.elapsed;
  }

  /** Shows the stake as a stack of chips on the felt. */
  private setStake(total: number) {
    const stack = this.parts.roulette.stake;
    const n = Math.min(40, Math.ceil(total / 10));
    if (stack.count === n && stack.userData.total === total) return;
    stack.userData.total = total;
    stack.count = n;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i += 1) {
      const column = Math.floor(i / 10);
      m.makeTranslation(
        TABLE_STAKE.x + column * 0.05,
        0.9255 + (i % 10) * 0.0078,
        TABLE_STAKE.z,
      );
      stack.setMatrixAt(i, m);
      stack.setColorAt(
        i,
        this.stakeColour.setHex(STAKE_COLOURS[column % STAKE_COLOURS.length]!),
      );
    }
    stack.instanceMatrix.needsUpdate = true;
    if (stack.instanceColor) stack.instanceColor.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('click', this.onClick);
    window.removeEventListener('pointermove', this.onPointerMove);
    // Never leave a caller waiting on a scene that no longer exists.
    this.roulette?.resolve();
    this.slot?.resolve();
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      ) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials as THREE.Material[]) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
          material.dispose();
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      }
    });
    textures.forEach((t) => t.dispose());
    this.parts.env.dispose();
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

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      (event.clientY / window.innerHeight) * 2 - 1,
    );
    this.lastActivity = this.elapsed;
    if (event.pointerType === 'touch' || this.station !== 'lobby') {
      this.hover = null;
      return;
    }
    const hit = this.pick(event.clientX, event.clientY);
    this.hover = hit === 'roulette' || hit === 'slots' ? hit : null;
    this.canvas.style.cursor = this.hover ? 'pointer' : '';
  };

  private pick(clientX: number, clientY: number) {
    const box = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - box.left) / box.width) * 2 - 1,
      -((clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const { roulette, slots } = this.parts;
    const [hit] = this.raycaster.intersectObjects(
      [slots.buttonProxy, slots.leverProxy, roulette.proxy, slots.proxy],
      false,
    );
    if (!hit) return null;
    if (hit.object === roulette.proxy) return 'roulette' as const;
    if (hit.object === slots.proxy) return 'slots' as const;
    return 'lever' as const;
  }

  private readonly onClick = (event: MouseEvent) => {
    this.lastActivity = this.elapsed;
    const hit = this.pick(event.clientX, event.clientY);
    if (!hit) return;
    if (this.station === 'lobby') {
      // The lever and button belong to the machine.
      this.events.onSelect(hit === 'lever' ? 'slots' : hit);
    } else if (this.station === 'slots' && hit === 'lever') {
      this.events.onLever();
    }
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
    this.materials.floor.clearcoat = q.reflections ? 1 : 0;
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.lights.house.castShadow = q.shadows;
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          (o.material as THREE.Material).needsUpdate = true;
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
    const span = nowMs - this.sampleFrom;
    if (span < SAMPLE_MS) return;
    const verdict = judgeFrameTime(span / this.sampleFrames, this.tier);
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
      if (import.meta.env.DEV) console.warn('[casino] frame failed', error);
      this.renderer.setAnimationLoop(null);
      this.events.onFallback('error');
    }
  };

  private beginTravel(to: Station, reduced: boolean) {
    const from = this.station;
    this.travel = {
      from: { ...this.pose },
      to: shotFor(to, this.camera.aspect),
      via: this.travel ? [] : viaFor(from, to),
      t0: this.elapsed,
      duration: reduced ? 0.0001 : TRAVEL_SECONDS,
      station: to,
    };
    this.station = to;
    this.hover = null;
    this.canvas.style.cursor = '';
  }

  private frame(time: number) {
    const input = this.input;
    if (!input || this.disposed) return;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    const t = this.elapsed;
    const { reducedMotion } = input;

    const busy =
      this.travel !== null ||
      this.roulette !== null ||
      this.slot !== null ||
      t < this.winUntil ||
      t < this.flash.until ||
      t - this.lastActivity < 2.5 ||
      !this.settled;
    if (!busy && t - this.lastRender < 1 / 31) return;
    this.lastRender = t;

    this.updateCamera(dt, t, reducedMotion);
    this.updateRoulette(t);
    this.updateSlots(t, dt, reducedMotion);
    this.updateLights(t, dt, reducedMotion);

    // Dust.
    if (!reducedMotion) {
      const { positions } = this.dust;
      for (let i = 0; i < DUST; i += 1) {
        const y = positions[i * 3 + 1]! + dt * 0.02 * (1 + (i % 5) * 0.3);
        positions[i * 3 + 1] = y > 3.8 ? 0.2 : y;
      }
      this.dust.geometry.attributes.position!.needsUpdate = true;
    }

    this.grain.uniforms.time!.value = t % 10;
    if (import.meta.env.VITE_CASINO_LOOKDEV === '1') {
      this.renderer.info.autoReset = false;
      this.renderer.info.reset();
    }
    this.composer.render(dt);
    if (import.meta.env.VITE_CASINO_LOOKDEV === '1') {
      const { render, memory } = this.renderer.info;
      (window as unknown as { __casinoInfo?: unknown }).__casinoInfo = {
        calls: render.calls,
        triangles: render.triangles,
        textures: memory.textures,
        geometries: memory.geometries,
      };
    }
    this.events.onFrame(this.anchors());

    if (!this.ready) {
      this.ready = true;
      this.events.onReady();
    }
    this.measure(time);
  }

  private updateCamera(dt: number, t: number, reduced: boolean) {
    const debug = import.meta.env.DEV ? this.debugShot : null;
    let shot: Shot;
    if (debug) {
      shot = debug;
      this.travel = null;
    } else if (this.travel) {
      const p = Math.min(1, (t - this.travel.t0) / this.travel.duration);
      const pose = cameraPose(
        this.travel.from,
        this.travel.to,
        this.travel.via,
        p,
      );
      shot = {
        eye: pose.eye,
        look: pose.look,
        halfWidth: pose.halfWidth,
        halfHeight: pose.halfHeight,
      };
      if (p >= 1) {
        const arrived = this.travel.station;
        this.travel = null;
        shot = { ...shotFor(arrived, this.camera.aspect) };
        this.events.onArrive(arrived);
      }
    } else {
      shot = shotFor(this.station, this.camera.aspect);
    }
    this.pose = {
      eye: shot.eye,
      look: shot.look,
      halfWidth: shot.halfWidth,
      halfHeight: shot.halfHeight,
    };
    const idle = !this.travel && !reduced;
    this.parallax.lerp(
      idle && this.station === 'lobby' ? this.pointer : new THREE.Vector2(),
      Math.min(1, dt * 2),
    );
    const sway = idle ? Math.sin(t * 0.3) * 0.015 : 0;
    const cam = this.camera;
    cam.position.set(
      shot.eye[0] + this.parallax.x * 0.14,
      shot.eye[1] - this.parallax.y * 0.05 + sway,
      shot.eye[2],
    );
    const look = new THREE.Vector3(...shot.look);
    cam.lookAt(look);
    const fov = fovFor(
      cam.aspect,
      cam.position.distanceTo(look),
      shot.halfWidth,
    );
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.shiftForPanel(dt, reduced);
  }

  /**
   * In landscape the game's panel sits on the right, so inside a game the
   * picture is slid left (a view offset, not a camera move) to keep the
   * subject clear of it.
   */
  private panelShift = 0;
  private shiftForPanel(dt: number, reduced: boolean) {
    const cam = this.camera;
    const wanted = cam.aspect > 1.2 && this.station !== 'lobby' ? 0.34 : 0;
    this.panelShift = reduced
      ? wanted
      : approach(this.panelShift, wanted, dt, 3);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.panelShift > 0.002 && w && h) {
      cam.setViewOffset(
        w * (1 + this.panelShift),
        h,
        w * this.panelShift,
        0,
        w,
        h,
      );
    } else if (cam.view?.enabled) {
      cam.clearViewOffset();
    }
  }

  private updateRoulette(t: number) {
    const { head, ball } = this.parts.roulette;
    const spin = this.roulette;
    if (!spin) {
      head.rotation.y = this.rouletteRest;
      this.placeBallAtRest();
      return;
    }
    const local = t - spin.from;
    const { plan } = spin;
    head.rotation.y = wheelAngle(plan, local);
    const b = ballState(plan, local);
    ball.position.set(
      WHEEL_POS.x + Math.sin(b.phi) * b.radius,
      WHEEL_POS.y + WHEEL.ballRadius + b.lift,
      WHEEL_POS.z - Math.cos(b.phi) * b.radius,
    );
    if (!spin.resolved && local >= plan.ballSeconds + 0.35) {
      spin.resolved = true;
      spin.resolve();
    }
    if (local >= plan.wheelSeconds) {
      this.rouletteRest = wheelAngle(plan, plan.wheelSeconds) % TAU;
      this.roulette = null;
      if (!spin.resolved) spin.resolve();
      this.placeBallAtRest(plan.pocket);
    }
  }

  private restPocket = 0;

  private placeBallAtRest(pocket?: number) {
    if (pocket !== undefined) this.restPocket = pocket;
    const phi = pocketAngle(this.restPocket) - this.rouletteRest;
    this.parts.roulette.ball.position.set(
      WHEEL_POS.x + Math.sin(phi) * WHEEL.pocketRadius,
      WHEEL_POS.y + WHEEL.ballRadius,
      WHEEL_POS.z - Math.cos(phi) * WHEEL.pocketRadius,
    );
  }

  private updateSlots(t: number, dt: number, reduced: boolean) {
    const { reels, lever, bulbs, bulbCount, buttonLamp, winGlow } =
      this.parts.slots;
    const spin = this.slot;
    if (spin) {
      const local = t - spin.from;
      let done = true;
      spin.plans.forEach((plan, i) => {
        const pos = reelPosition(plan, local);
        this.reelPositions[i] = pos;
        reels[i]!.rotation.x = reelRotation(pos);
        if (local < reelTotalSeconds(plan)) done = false;
      });
      // The lever is pulled, then eases back.
      const pull = Math.min(1, local / 0.28);
      const back = Math.max(0, (local - 0.28) / 0.7);
      lever.rotation.x = reduced
        ? -0.25
        : -0.25 +
          1.25 * Math.sin(pull * Math.PI * 0.5) * (1 - Math.min(1, back));
      if (done) {
        spin.plans.forEach((plan, i) => {
          this.reelPositions[i] = finalStop(plan);
          reels[i]!.rotation.x = reelRotation(finalStop(plan));
        });
        this.slot = null;
        spin.resolve();
      }
    } else {
      lever.rotation.x = approach(lever.rotation.x, -0.25, dt, 6);
    }

    // Lamps: a slow chase at rest, faster while the reels turn.
    const colour = new THREE.Color();
    const speed = reduced
      ? 0
      : this.slot
        ? 14
        : this.station === 'slots'
          ? 3
          : 1.2;
    const celebrating = t < this.winUntil;
    for (let i = 0; i < bulbCount; i += 1) {
      const wave = reduced ? 0.7 : 0.5 + 0.5 * Math.sin(t * speed - i * 0.55);
      const k = celebrating
        ? 0.8 + 0.2 * Math.sin(t * 5 - i * 0.5)
        : 0.35 + wave * 0.65;
      bulbs.setColorAt(i, colour.setRGB(2.2 * k, 1.5 * k, 0.8 * k));
    }
    if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    // The button breathes when the machine is waiting for her.
    const breathe = this.slot ? 0.4 : 0.75 + 0.25 * Math.sin(t * 2.4);
    buttonLamp.color.setRGB(2.4 * (reduced ? 0.9 : breathe), 0.25, 0.25);
    // Payline highlight after a win; steady under reduced motion.
    if (celebrating && this.winKind) {
      const left = (this.winUntil - t) / (this.winKind === 'jackpot' ? 5 : 2.6);
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 6);
      winGlow.opacity = Math.min(1, left * 2) * (0.1 + pulse * 0.18);
    } else {
      winGlow.opacity = approach(winGlow.opacity, 0, dt, 6);
    }
  }

  private updateLights(t: number, dt: number, reduced: boolean) {
    const { house, table, machine } = this.lights;
    const wantDim = this.input?.dimmed ? 0.34 : 1;
    this.dim = reduced ? wantDim : approach(this.dim, wantDim, dt, 2.4);
    let boost = 1;
    if (t < this.flash.until) {
      const k = (this.flash.until - t) / (this.flash.long ? 2.4 : 1.2);
      boost =
        1 + this.flash.strength * 0.5 * Math.sin(Math.min(1, k) * Math.PI);
    }
    const shimmer = reduced ? 1 : 0.97 + 0.03 * Math.sin(t * 3.1);
    house.intensity = 26 * shimmer * this.dim;
    // A station's key light rises as the camera arrives, so the room keeps
    // its mood in the lobby and the game is lit once she is at it.
    const atRoulette = this.station === 'roulette' ? 1.35 : 1;
    const atSlots = this.station === 'slots' ? 1.4 : 1;
    table.intensity = 38 * atRoulette * this.dim * boost;
    machine.intensity = 24 * atSlots * this.dim * boost;
    this.renderer.toneMappingExposure =
      1.12 * (0.55 + 0.45 * this.dim) * (1 + (boost - 1) * 0.5);
    const { chandelier, roulette, slots } = this.parts;
    chandelier.core.opacity = 0.32 * this.dim;
    // Hover feedback: the pool under a station warms when pointed at.
    const hr = this.hover === 'roulette' ? 0.34 : 0.16;
    const hs = this.hover === 'slots' ? 0.3 : 0.14;
    roulette.pool.opacity = approach(roulette.pool.opacity, hr, dt, 8);
    slots.pool.opacity = approach(slots.pool.opacity, hs, dt, 8);
    roulette.wheelGlow.opacity = this.roulette ? 0.12 : 0;
    slots.marqueeHalo.opacity = (0.2 + (this.slot ? 0.1 : 0)) * this.dim;
  }

  private project(v: THREE.Vector3, box: DOMRect): ScreenPoint {
    const p = v.clone().project(this.camera);
    return {
      x: box.left + ((p.x + 1) / 2) * box.width,
      y: box.top + ((1 - p.y) / 2) * box.height,
      visible: p.z < 1 && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.95,
    };
  }

  private anchors(): CasinoAnchors {
    const box = this.canvas.getBoundingClientRect();
    return {
      roulette: this.project(this.parts.roulette.label, box),
      slots: this.project(this.parts.slots.label, box),
    };
  }
}

/* ---------------------------------------------------------------- */
/* Wall layouts                                                      */
/* ---------------------------------------------------------------- */

function wallSpecs(art: {
  left: THREE.Texture;
  centre: THREE.Texture;
  right: THREE.Texture;
}) {
  const back: WallSpec = {
    length: 8,
    pilasters: [-2.6, 2.6],
    frames: [{ x: -0.35, y: 2.35, w: 1.35, h: 1.8, texture: art.centre }],
    curtains: [
      { x: -3.3, width: 1.1 },
      { x: 3.4, width: 1.0 },
    ],
    sconces: [-1.6, 0.9],
  };
  const left: WallSpec = {
    length: ROOM.front - ROOM.back,
    pilasters: [-2.6, 0.4, 3.9],
    frames: [{ x: 2.15, y: 2.4, w: 1.0, h: 1.5, texture: art.left }],
    sconces: [-1.8, -0.1, 1.1, 3.2],
  };
  const right: WallSpec = {
    length: ROOM.front - ROOM.back,
    pilasters: [-2.4, 0, 3.6],
    frames: [{ x: 1.8, y: 2.45, w: 1.0, h: 1.5, texture: art.right }],
    sconces: [-1.2, 0.5, 3.1, -3.4],
  };
  const front: WallSpec = {
    length: 8,
    pilasters: [-2.6, 2.6],
    sconces: [-1, 1],
  };
  return { back, side: { left, right }, front };
}
