/**
 * Real-time Members' Lounge. Presentation only: the lounge UI tells it the
 * camera focus and whether the screening room is open; it never decides
 * membership or navigation. Loaded lazily, after the entrance scene has
 * released its WebGL context. The CSS lounge is its poster and fallback.
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
import { createMaterials } from '../../entrance/scene/materials';
import { GrainVignette, HdrClamp } from '../../entrance/scene/postfx';
import {
  judgeFrameTime,
  qualitySettings,
  type QualityTier,
} from '../../entrance/scene/sceneMath';
import {
  buildChandelier,
  buildDirectory,
  buildDoorway,
  buildFurniture,
  buildHearth,
  buildShell,
  buildWallSconces,
  createLoungeMaterials,
  loungeEnvironment,
  type LoungeMaterials,
} from './loungeArchitecture';
import {
  approach,
  ARRIVAL,
  arrivalExposure,
  arrivalProgress,
  flicker,
  shotFov,
  SHOTS,
  type LoungeFocus,
  type Shot,
} from './loungeMath';

export interface LoungeInput {
  focus: LoungeFocus;
  /** Play the arrival dolly from the doorway (first entry this session). */
  arriving: boolean;
  /** The screening-room doorway is lit when the room is open. */
  screeningOpen: boolean;
  reducedMotion: boolean;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera and inside the viewport. */
  visible: boolean;
}

export interface LoungeAnchors {
  screening: ScreenPoint;
  directory: ScreenPoint;
}

export type LoungeTarget = 'screening' | 'directory';
export type LoungeFallbackReason = 'performance' | 'context-lost' | 'error';

export interface LoungeEvents {
  onReady(): void;
  onFallback(reason: LoungeFallbackReason): void;
  onFrame(anchors: LoungeAnchors): void;
  onSelect(target: LoungeTarget): void;
}

const DUST = 160;
const WARMUP_MS = 1000;
const SAMPLE_MS = 1500;

export class LoungeScene {
  static async create(
    canvas: HTMLCanvasElement,
    events: LoungeEvents,
    names: readonly string[],
    screeningName: string,
  ) {
    await loadSceneFonts();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    try {
      const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const base = await createMaterials(anisotropy);
      const walnut = base.walnut.map?.image as CanvasImageSource | undefined;
      if (!walnut) throw new Error('Walnut scan unavailable');
      const materials = createLoungeMaterials(base, walnut, anisotropy);
      // Entrance-only materials are not used here.
      for (const unused of [
        base.mahogany,
        base.stone,
        base.marble,
        base.threshold,
        base.nacre,
      ]) {
        for (const value of Object.values(unused)) {
          if (value instanceof THREE.Texture) value.dispose();
        }
        unused.dispose();
      }
      const scene = new LoungeScene(
        canvas,
        renderer,
        materials,
        events,
        names,
        screeningName,
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
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;
  private readonly timer = new THREE.Timer();
  private readonly parts;
  private readonly lights;
  private readonly dust: {
    positions: Float32Array;
    geometry: THREE.BufferGeometry;
  };
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private readonly eye = new THREE.Vector3(...SHOTS.room.position);
  private readonly look = new THREE.Vector3(...SHOTS.room.look);
  private halfWidth = SHOTS.room.halfWidth;
  /** DEVELOPMENT ONLY: overrides the shot while composing. */
  debugShot: Shot | null = null;
  private doorway = 0;
  private input: LoungeInput | null = null;
  private arrivalFrom = -1;
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

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly materials: LoungeMaterials,
    private readonly events: LoungeEvents,
    names: readonly string[],
    screeningName: string,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color(0x070404);
    scene.fog = new THREE.FogExp2(0x0d0606, 0.035);
    const env = loungeEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.32;

    const statics = new THREE.Group();
    scene.add(statics);
    buildShell(statics, materials);
    const hearth = buildHearth(statics, materials);
    const directory = buildDirectory(statics, materials, names);
    const doorway = buildDoorway(statics, materials, screeningName);
    const furniture = buildFurniture(statics, materials);
    const chandelier = buildChandelier(statics, materials);
    buildWallSconces(statics, materials);
    mergeStatic(statics);
    this.parts = { hearth, directory, doorway, furniture, chandelier, env };

    // Lighting: firelight low and warm, a chandelier pool over the seating,
    // two table lamps, a picture light on the overmantel and the glow from
    // the screening-room passage. Everything else is light pools.
    scene.add(new THREE.HemisphereLight(0x4a2a24, 0x0a0505, 0.45));
    const fire = new THREE.PointLight(0xff8a3c, 9, 9, 1.7);
    fire.position.copy(hearth.firePosition).add(new THREE.Vector3(0, 0, 0.35));
    const chandelierLight = new THREE.SpotLight(0xffd0a0, 20, 8, 0.7, 0.9, 1.6);
    chandelierLight.position.copy(chandelier.light);
    chandelierLight.target.position.set(0, 0, chandelier.light.z);
    chandelierLight.castShadow = true;
    chandelierLight.shadow.mapSize.set(1024, 1024);
    chandelierLight.shadow.bias = -0.0004;
    chandelierLight.shadow.normalBias = 0.02;
    const picture = new THREE.SpotLight(0xffd8a8, 9, 4, 0.75, 0.9, 2);
    picture.position.copy(hearth.pictureLight);
    picture.target.position
      .copy(hearth.overmantel)
      .add(new THREE.Vector3(0, -0.4, 0));
    const lamps = furniture.lamps.map((lamp) => {
      const light = new THREE.PointLight(0xffbe82, 3.2, 5, 1.8);
      light.position.copy(lamp.light);
      scene.add(light);
      return light;
    });
    const passage = new THREE.PointLight(0xffc890, 0, 4.5, 1.8);
    passage.position.copy(doorway.light);
    scene.add(
      fire,
      chandelierLight,
      chandelierLight.target,
      picture,
      picture.target,
      passage,
    );
    this.lights = { fire, chandelier: chandelierLight, lamps, passage };

    // Motes drifting through the chandelier light.
    const positions = new Float32Array(DUST * 3);
    for (let i = 0; i < DUST; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = Math.random() * 3.6;
      positions[i * 3 + 2] = -3.8 + Math.random() * 5;
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
      0.6,
      0.6,
      1.0,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainVignette);
    this.composer.addPass(this.grain);

    this.applyTier(0);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    if (import.meta.env.DEV) {
      // Composing in software-rendered headless browsers: keep full quality.
      if (window.location.search.includes('lookdev')) this.settled = true;
    }
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
  }

  private async start() {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (!this.disposed) this.renderer.setAnimationLoop(this.loop);
  }

  update(input: LoungeInput) {
    if (import.meta.env.DEV)
      (window as unknown as { __lounge?: LoungeScene }).__lounge = this;
    if (!this.input) {
      // First input: place the camera, at the doorway if arriving.
      const shot = SHOTS[input.focus];
      const from =
        input.arriving && !input.reducedMotion ? ARRIVAL : shot.position;
      this.eye.set(...from);
      this.look.set(...shot.look);
      this.halfWidth = shot.halfWidth;
      if (input.arriving && !input.reducedMotion)
        this.arrivalFrom = this.elapsed;
    }
    if (this.input?.focus !== input.focus) this.lastActivity = this.elapsed;
    this.input = input;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    const textures = new Set<THREE.Texture>();
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Mesh ||
        object instanceof THREE.Points ||
        object instanceof THREE.Sprite
      ) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials as THREE.Material[]) {
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
          material.dispose();
        }
      }
    });
    textures.forEach((t) => t.dispose());
    this.parts.env.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    // iOS caps live WebGL contexts; release ours promptly.
    this.renderer.forceContextLoss();
  }

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
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    this.lastActivity = this.elapsed;
    const box = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const { directory, doorway } = this.parts;
    const [hit] = this.raycaster.intersectObjects(
      [directory.target, doorway.target],
      false,
    );
    if (hit?.object === directory.target) this.events.onSelect('directory');
    if (hit?.object === doorway.target) this.events.onSelect('screening');
  };

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
    // Tier 1 trades the glass and clearcoat sparkle for fill rate.
    this.materials.parquet.clearcoat = q.reflections ? 0.35 : 0;
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.lights.chandelier.castShadow = q.shadows;
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
      if (import.meta.env.DEV) console.warn('[lounge] frame failed', error);
      this.renderer.setAnimationLoop(null);
      this.events.onFallback('error');
    }
  };

  private frame(time: number) {
    const input = this.input;
    if (!input || this.disposed) return;
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.elapsed += dt;
    const t = this.elapsed;
    const { reducedMotion } = input;

    const arriving = this.arrivalFrom >= 0;
    const moving =
      arriving ||
      t - this.lastActivity < 2.5 ||
      Math.abs(this.doorway - (input.screeningOpen ? 1 : 0)) > 0.01 ||
      !this.settled;
    // The fire keeps the room alive at 30 fps; full rate while moving.
    if (!moving && t - this.lastRender < 1 / 31) return;
    this.lastRender = t;

    // Camera: ease towards the focused shot; arrival dollies in from the door.
    const debug = import.meta.env.DEV ? this.debugShot : null;
    const shot = debug ?? SHOTS[input.focus];
    const snap = reducedMotion || debug !== null;
    let exposure = 1.12;
    if (arriving) {
      const p = arrivalProgress(t - this.arrivalFrom);
      this.eye.set(
        ARRIVAL[0] + (shot.position[0] - ARRIVAL[0]) * p,
        ARRIVAL[1] + (shot.position[1] - ARRIVAL[1]) * p,
        ARRIVAL[2] + (shot.position[2] - ARRIVAL[2]) * p,
      );
      exposure = 1.12 * arrivalExposure(p);
      if (p >= 1) this.arrivalFrom = -1;
    } else if (snap) {
      this.eye.set(...shot.position);
    } else {
      this.eye.set(
        approach(this.eye.x, shot.position[0], dt),
        approach(this.eye.y, shot.position[1], dt),
        approach(this.eye.z, shot.position[2], dt),
      );
    }
    if (snap) {
      this.look.set(...shot.look);
      this.halfWidth = shot.halfWidth;
      this.parallax.set(0, 0);
    } else {
      this.look.set(
        approach(this.look.x, shot.look[0], dt),
        approach(this.look.y, shot.look[1], dt),
        approach(this.look.z, shot.look[2], dt),
      );
      this.halfWidth = approach(this.halfWidth, shot.halfWidth, dt);
      this.parallax.lerp(this.pointer, Math.min(1, dt * 2));
    }
    const sway = reducedMotion ? 0 : Math.sin(t * 0.3) * 0.02;
    const camera = this.camera;
    camera.position.set(
      this.eye.x + this.parallax.x * 0.12,
      this.eye.y - this.parallax.y * 0.05 + sway,
      this.eye.z,
    );
    camera.lookAt(this.look);
    const fov = shotFov(
      camera.aspect,
      camera.position.distanceTo(this.look),
      this.halfWidth,
    );
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    this.renderer.toneMappingExposure = exposure;

    // Firelight.
    const { hearth, doorway, chandelier, directory } = this.parts;
    const f = flicker(t, reducedMotion);
    this.lights.fire.intensity = 9 * f;
    hearth.flameMaterial.uniforms.time!.value = reducedMotion ? t * 0.4 : t;
    hearth.fireGlow.opacity = 0.2 * f;
    hearth.hearthPool.opacity = 0.3 * f;
    this.materials.ember.emissiveIntensity = 1.1 + (f - 0.95) * 3;
    chandelier.core.opacity = 0.7;

    // The screening-room passage lights up once the room is open.
    this.doorway = reducedMotion
      ? input.screeningOpen
        ? 1
        : 0
      : approach(this.doorway, input.screeningOpen ? 1 : 0, dt, 1.2);
    doorway.corridor.color.setScalar(0.25 + this.doorway * 1.35);
    doorway.spill.opacity = this.doorway * 0.35;
    this.lights.passage.intensity = this.doorway * 5;
    directory.glow.opacity = input.focus === 'directory' ? 0.16 : 0.1;

    // Dust.
    if (!reducedMotion) {
      const { positions } = this.dust;
      for (let i = 0; i < DUST; i += 1) {
        const y = positions[i * 3 + 1]! + dt * 0.02 * (1 + (i % 5) * 0.3);
        positions[i * 3 + 1] = y > 3.6 ? 0.2 : y;
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

  private project(v: THREE.Vector3, box: DOMRect): ScreenPoint {
    const p = v.clone().project(this.camera);
    return {
      x: box.left + ((p.x + 1) / 2) * box.width,
      y: box.top + ((1 - p.y) / 2) * box.height,
      visible: p.z < 1 && Math.abs(p.x) < 0.92 && Math.abs(p.y) < 0.95,
    };
  }

  private anchors(): LoungeAnchors {
    const box = this.canvas.getBoundingClientRect();
    return {
      screening: this.project(this.parts.doorway.label, box),
      directory: this.project(this.parts.directory.label, box),
    };
  }
}
