/**
 * Real-time entrance renderer. Presentation only: it is told the stage,
 * the remaining time and the anticipation by useEntrance and never decides
 * them. Loaded lazily; the SVG facade is its poster and fallback.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { pad, type Remaining } from '../domain/countdown';
import type { EntranceStage } from '../domain/entranceMachine';
import {
  buildBell,
  buildDoors,
  buildFacade,
  buildFanlight,
  buildFloor,
  buildLettering,
  buildSconces,
  mergeStatic,
  RECESS,
  warmEnvironment,
} from './architecture';
import { glowTexture, loadSceneFonts } from './canvasTextures';
import { GrainVignette } from './postfx';
import { createMaterials } from './materials';
import {
  advanceDrum,
  boltRetraction,
  cameraTravel,
  doorSwing,
  drumOffsetFor,
  fitFov,
  judgeFrameTime,
  qualitySettings,
  smoothstepTowards,
  type QualityTier,
} from './sceneMath';

export interface SceneInput {
  stage: EntranceStage;
  anticipation: number;
  remaining: Remaining;
  reducedMotion: boolean;
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SceneAnchors {
  bell: ScreenRect;
  /** Beneath DAYS, HOURS, MINUTES, SECONDS, in viewport pixels. */
  labels: { x: number; y: number }[];
}

export type FallbackReason = 'performance' | 'context-lost' | 'error';

export interface SceneEvents {
  onReady(): void;
  onFallback(reason: FallbackReason): void;
  onFrame(anchors: SceneAnchors): void;
  onDoorTap(): void;
}

const CAMERA = new THREE.Vector3(0, 1.42, 5.6);
const LOOK = new THREE.Vector3(0, 2.02, -0.4);
const DUST = 220;
/** Real-time windows for judging performance (a slow device frames slowly). */
const WARMUP_MS = 1000;
const SAMPLE_MS = 1500;

const counting = (s: EntranceStage) => s === 'locked' || s === 'final-minute';

export class EntranceScene {
  static async create(canvas: HTMLCanvasElement, events: SceneEvents) {
    await loadSceneFonts();
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    try {
      const materials = await createMaterials(
        Math.min(8, renderer.capabilities.getMaxAnisotropy()),
      );
      const scene = new EntranceScene(canvas, renderer, materials, events);
      await scene.start();
      return scene;
    } catch (error) {
      renderer.dispose();
      throw error;
    }
  }

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grain: ShaderPass;
  private readonly timer = new THREE.Timer();
  private readonly parts;
  private readonly lights;
  private readonly drums;
  private readonly dust: {
    positions: Float32Array;
    speeds: Float32Array;
    geometry: THREE.BufferGeometry;
  };
  private readonly raycaster = new THREE.Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointer = new THREE.Vector2();
  private readonly parallax = new THREE.Vector2();
  private input: SceneInput | null = null;
  private stageStartedAt = 0;
  private elapsed = 0;
  private lastRender = -1;
  private lastActivity = 0;
  private pressedAt = -100;
  private speakingUntil = -100;
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
    materials: Awaited<ReturnType<typeof createMaterials>>,
    private readonly events: SceneEvents,
  ) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = this.scene;
    scene.background = new THREE.Color(0x060505);
    scene.fog = new THREE.FogExp2(0x0b0807, 0.055);
    const env = warmEnvironment(renderer);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.45;

    // Architecture: static pieces collected and merged per material.
    const statics = new THREE.Group();
    scene.add(statics);
    buildFacade(statics, materials);
    const fanlight = buildFanlight(statics, materials);
    const sconces = buildSconces(statics, materials);
    buildLettering(statics);
    mergeStatic(statics);
    const doors = buildDoors(scene, materials);
    const bell = buildBell(scene, materials);
    const floor = buildFloor(scene, materials);
    this.parts = { fanlight, sconces, doors, bell, floor, materials, env };

    // Lighting: night ambience, a grazing downlight in the recess ceiling,
    // the sconces, and the room behind the doors.
    scene.add(new THREE.HemisphereLight(0x3a2a24, 0x080505, 0.35));
    const down = new THREE.SpotLight(0xffd3a0, 26, 7, 0.62, 0.75, 2);
    down.position.set(0, 3.68, -0.12);
    down.target.position.set(0, 0.9, -RECESS);
    down.castShadow = true;
    down.shadow.mapSize.set(1024, 1024);
    down.shadow.bias = -0.0004;
    down.shadow.normalBias = 0.02;
    const letters = new THREE.SpotLight(0xffd7a8, 14, 4, 0.7, 0.9, 2);
    letters.position.set(0, 3.2, 1.2);
    letters.target.position.set(0, 4.05, 0);
    const interior = new THREE.PointLight(0xffd8a8, 0, 9, 1.6);
    interior.position.set(0, 1.8, -1.6);
    scene.add(down, down.target, letters, letters.target, interior);
    this.lights = { down, interior };

    // Drums ordered left to right on screen: DD HH MM SS.
    scene.updateMatrixWorld(true);
    this.drums = [...doors.left.drums, ...doors.right.drums]
      .map((d) => ({
        ...d,
        x: d.mesh.getWorldPosition(new THREE.Vector3()).x,
        shown: -1,
        offset: 0,
        goal: 0,
      }))
      .sort((a, b) => a.x - b.x);

    // Drifting dust in front of the doors.
    const positions = new Float32Array(DUST * 3);
    const speeds = new Float32Array(DUST);
    for (let i = 0; i < DUST; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 2.6;
      positions[i * 3 + 1] = Math.random() * 3.6;
      positions[i * 3 + 2] = -0.5 + Math.random() * 2.8;
      speeds[i] = 0.02 + Math.random() * 0.05;
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
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      ),
    );
    this.dust = { positions, speeds, geometry };

    // Post-processing.
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(256, 256),
      0.55,
      0.65,
      0.9,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grain = new ShaderPass(GrainVignette);
    this.composer.addPass(this.grain);

    this.applyTier(0);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
  }

  /**
   * Compiles every shader before the first frame (in parallel where the
   * browser supports it) so the page never freezes mid-dissolve.
   */
  private async start() {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (!this.disposed) this.renderer.setAnimationLoop(this.loop);
  }

  update(input: SceneInput) {
    if (!this.input || this.input.stage !== input.stage) {
      this.stageStartedAt = this.elapsed;
      this.lastActivity = this.elapsed;
    }
    this.input = input;
  }

  /** The bell was rung: press the push and light the grille. */
  ring(speakingForMs: number) {
    this.pressedAt = this.elapsed;
    this.speakingUntil = this.elapsed + speakingForMs / 1000;
    this.lastActivity = this.elapsed;
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
    this.parts.floor.mirror.dispose();
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
    if (this.input?.stage !== 'awaiting-entry') return;
    const box = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const { left, right } = this.parts.doors;
    if (
      this.raycaster.intersectObjects([left.pivot, right.pivot], true).length
    ) {
      this.events.onDoorTap();
    }
  };

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    const ratio = this.renderer.getPixelRatio() * 0.4;
    this.parts.floor.mirror
      .getRenderTarget()
      .setSize(Math.round(width * ratio), Math.round(height * ratio));
    this.camera.aspect = width / height;
    this.camera.fov = fitFov(this.camera.aspect, CAMERA.z);
    this.camera.updateProjectionMatrix();
    this.lastActivity = this.elapsed;
  }

  private applyTier(tier: QualityTier) {
    this.tier = tier;
    const q = qualitySettings(tier, window.devicePixelRatio);
    this.renderer.setPixelRatio(q.pixelRatio);
    this.composer.setPixelRatio(q.pixelRatio);
    this.parts.floor.mirror.visible = q.reflections;
    this.parts.materials.marble.opacity = q.reflections ? 0.74 : 1;
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.lights.down.castShadow = q.shadows;
      this.scene.traverse((o) => {
        if (o instanceof THREE.Mesh)
          (o.material as THREE.Material).needsUpdate = true;
      });
    }
    this.bloom.enabled = q.bloom;
    this.resize();
  }

  /**
   * Steps quality down, or gives up, if frames are consistently slow.
   * Judged on wall-clock windows so a struggling device is caught within
   * seconds; stops once a tier holds, so idle throttling is not mistaken
   * for slowness.
   */
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
      if (import.meta.env.DEV) console.warn('[entrance] frame failed', error);
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
    const since = t - this.stageStartedAt;
    const { stage, reducedMotion } = input;

    // Idle at 30 fps once settled; full rate whenever anything is moving.
    const busy =
      !counting(stage) ||
      stage === 'final-minute' ||
      t - this.lastActivity < 3 ||
      t < this.speakingUntil ||
      !this.settled;
    if (!busy && t - this.lastRender < 1 / 31) return;
    this.lastRender = t;

    const { doors, fanlight, sconces, bell, floor } = this.parts;
    const warm = counting(stage) ? input.anticipation : 1;

    // Counter drums roll forward to each new figure.
    const r = input.remaining;
    const figures =
      pad(r.days) + pad(r.hours) + pad(r.minutes) + pad(r.seconds);
    this.drums.forEach((d, i) => {
      const digit = Number(figures[i] ?? 0);
      if (d.shown < 0 || reducedMotion) {
        d.goal =
          d.shown < 0
            ? drumOffsetFor(digit)
            : advanceDrum(d.goal, d.shown, digit);
        d.offset = d.goal;
      } else {
        d.goal = advanceDrum(d.goal, d.shown, digit);
        d.offset = smoothstepTowards(d.offset, d.goal, dt);
      }
      d.shown = digit;
      d.texture.offset.y = d.offset;
      if (Math.abs(d.goal - d.offset) > 1e-3) this.lastActivity = t;
    });

    // The bolt withdraws during the unlocking beat; the doors then swing.
    const bolt = doors.left.bolt;
    if (bolt) {
      const retract =
        stage === 'unlocking'
          ? reducedMotion
            ? 1
            : boltRetraction(since)
          : counting(stage)
            ? 0
            : 1;
      bolt.position.x = 0.81 - retract * 0.095;
    }
    const open =
      stage === 'opening' ? (reducedMotion ? 1 : doorSwing(since)) : 0;
    doors.left.pivot.rotation.y = open * 1.72;
    doors.right.pivot.rotation.y = -open * 1.72;

    // Light: the final minute builds, midnight blazes, the room floods.
    const blaze = stage === 'unlocking' ? Math.min(1, since * 1.5) : 0;
    const breathe =
      stage === 'awaiting-entry' ? 0.85 + 0.15 * Math.sin(t * 1.4) : 1;
    doors.leak.opacity =
      (0.35 + warm * 0.65) * breathe * Math.max(0, 1 - open * 4);
    doors.leak.color.setRGB(3 + blaze * 3, 2.1 + blaze * 2, 1.1 + blaze);
    floor.spill.opacity =
      (0.1 + warm * 0.35 + blaze * 0.2) * breathe + open * 0.6;
    fanlight.color.setScalar(0.55 + warm * 0.9 + open * 0.6);
    for (const light of sconces.lights) light.intensity = 3 + warm * 1.4;
    sconces.haloMat.opacity = 0.45 + warm * 0.3;
    this.lights.down.intensity = 24 + warm * 10;
    this.lights.interior.intensity = open * 12;
    (doors.interior.material as THREE.MeshBasicMaterial).color.setScalar(
      0.45 + open * 0.75,
    );
    this.bloom.strength = 0.5 + warm * 0.3 + blaze * 0.25 + open * 0.25;

    // Bell press and the grille lit while the butler speaks.
    const pressed = t - this.pressedAt;
    bell.push.position.z = 0.012 - (pressed < 0.18 ? 0.004 : 0);
    const speaking =
      t < this.speakingUntil ? Math.min(1, (t - this.pressedAt) * 4) : 0;
    bell.grilleMat.color.setRGB(
      0.08 + speaking * 2.2,
      0.05 + speaking * 1.4,
      0.03 + speaking * 0.6,
    );

    // Camera: breathing and parallax, then through the doors at midnight.
    if (!reducedMotion) this.parallax.lerp(this.pointer, Math.min(1, dt * 2.5));
    else this.parallax.set(0, 0);
    const sway = reducedMotion ? 0 : Math.sin(t * 0.35) * 0.015;
    const travel =
      stage === 'opening' && !reducedMotion ? cameraTravel(since) : 0;
    const camera = this.camera;
    camera.position.set(
      CAMERA.x + this.parallax.x * 0.14,
      CAMERA.y - this.parallax.y * 0.06 + sway,
      CAMERA.z - travel * (CAMERA.z + RECESS + 0.9),
    );
    camera.position.y += travel * (1.55 - camera.position.y);
    camera.lookAt(LOOK.x, LOOK.y, LOOK.z - travel * 2);

    // Dust.
    if (!reducedMotion) {
      const { positions, speeds } = this.dust;
      for (let i = 0; i < DUST; i += 1) {
        const y = positions[i * 3 + 1]! + speeds[i]! * dt * 0.3;
        positions[i * 3 + 1] = y > 3.6 ? 0 : y;
        positions[i * 3] =
          positions[i * 3]! + Math.sin(t * 0.3 + i) * dt * 0.01;
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
    // Only sample full-rate frames, before the ceremony begins.
    if (counting(stage)) this.measure(time);
  }

  private project(v: THREE.Vector3, box: DOMRect) {
    const p = v.clone().project(this.camera);
    return {
      x: box.left + ((p.x + 1) / 2) * box.width,
      y: box.top + ((1 - p.y) / 2) * box.height,
    };
  }

  private anchors(): SceneAnchors {
    const box = this.canvas.getBoundingClientRect();
    const [a, b] = this.parts.bell.bounds.map((v) => this.project(v, box));
    const { left, right } = this.parts.doors;
    const anchors = [
      left.labelAnchors[0],
      left.labelAnchors[1],
      right.labelAnchors[1],
      right.labelAnchors[0],
    ];
    return {
      bell: {
        left: Math.min(a!.x, b!.x),
        top: Math.min(a!.y, b!.y),
        width: Math.abs(b!.x - a!.x),
        height: Math.abs(b!.y - a!.y),
      },
      labels: anchors.map((anchor) =>
        this.project(anchor!.getWorldPosition(new THREE.Vector3()), box),
      ),
    };
  }
}
