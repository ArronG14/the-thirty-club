# The Thirty Club — Entrance art direction (Phase 2B)

**Status: APPROVED by the owner (2026-10-18) and IMPLEMENTED (task V02).** Decisions 1–4 below were approved: real-time 3D with the SVG entrance as poster and fallback, the time-lock countdown, option (a) for the foyer hand-off, and CC0 scanned textures. The production scene lives in `src/features/entrance/scene/`.

- **Frames, production:** `docs/entrance/01-locked.jpg` … `06-late-arrival.jpg`, captured at iPhone 13 portrait size in desktop Chromium.
- **Frames, original lookdev prototype:** `docs/lookdev/`. The prototype page itself was removed once its scene became production code.
- **Previewing:** use the dev preview modes (`?preview=locked|final-minute|midnight|arrival|foyer`).

The proposal text below is kept as written. Where production differs, see ADR-007 in ARCHITECTURE.md.

## 1. Recommendation

Make the entrance a **lightweight real-time Three.js scene** and keep the current SVG/CSS entrance as its instant poster and fallback.

| Approach                                  | Verdict                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSS/SVG (current)                         | Ceiling reached: one visual plane, no real light transport, no reflections, and doors that cannot swing in true perspective.                                                                                                                                        |
| Pre-rendered plates or video              | Highest fidelity ceiling, but needs an offline renderer and an artist pipeline we do not have. The live countdown, the bell and the final-minute light can't be composited convincingly into baked video, and a door-swing video at phone resolution is several MB. |
| **Real-time 3D (recommended)**            | Real thickness, perspective, reflections, lacquer highlights that move with the viewer, and a door swing with a camera move through the doorway. The prototype already shows the gain at ~15k triangles.                                                            |
| Hybrid (3D plus baked lightmaps/textures) | Recommended as a production refinement: bake ambient occlusion and use authored PBR textures inside the real-time scene.                                                                                                                                            |

## 2. Composition and camera

- **Portrait first.** The camera stands about 5.6 m back at eye height (1.42 m), looking slightly up at the doorway: imposing, never top-down.
- **Framing.** The field of view is solved per aspect ratio so the doorway fills a portrait screen and the stone piers, sconces and crown run off the edges. The architecture extends beyond the viewport and the building feels larger than the phone.
- **Three depth layers:**
  - foreground: polished black marble floor carrying reflections and the light spill;
  - midground: the stepped stone surround, walnut architrave and sconces;
  - background: the doors, set 55 cm deep in the recess beneath an amber fanlight.
- **Camera life:** slow breathing drift (±1.5 cm) and touch/pointer parallax (±14 cm). Reduced motion disables both.
- **Midnight move:** the doors swing inward on real hinges, then the camera travels through the doorway into warm light, handing off to the foyer.

## 3. Architecture

| Element   | Treatment                                                                                                                                                                                                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Facade    | Coursed honed black limestone, 1.2 × 0.6 m blocks with recessed joints.                                                                                                                                                                                                             |
| Surround  | Stepped stone frame, a polished brass bead, then a deep walnut architrave. Brass fluting on the piers. Three Art Deco setbacks crown the opening with brass shadow lines.                                                                                                           |
| Lettering | THE THIRTY CLUB and EST. MMXXVI in gilded Bodoni capitals on the stone lintel, lit by a concealed uplight.                                                                                                                                                                          |
| Recess    | 55 cm reveal, walnut-panelled behind, with jamb mouldings and a brass-edged head. A marble threshold step.                                                                                                                                                                          |
| Fanlight  | Reeded amber glass lit from the room behind, with sunburst glazing bars.                                                                                                                                                                                                            |
| Doors     | Two 0.8 × 2.85 m mahogany leaves, 75 mm thick. Bevelled fielded panels framed by brass beads; brass rising-sun marquetry that completes across the meeting stiles around a "30" medallion that splits into "3" and "0"; brass pull handles on standoffs; brushed brass kick plates. |

## 4. Materials (stylised realism)

- **Mahogany:** a ribbon-figured base under a lacquer clearcoat (`MeshPhysicalMaterial`, clearcoat 1, roughness 0.14). The sconce highlights glide across the door as you tilt or move.
- **Brass:** two finishes. Brushed (anisotropic-looking draw lines in the roughness map) for plates and kick plates; polished for beads, handles and glazing bars. Both reflect a custom warm environment, so they read as metal rather than mustard.
- **Walnut:** a cooler, tighter figure with a satin coat.
- **Stone:** honed and matte, with bumped joints.
- **Marble floor:** Nero Marquina with a polished, partially transparent layer over a 0.4-resolution planar reflection, giving a soft mirror of the doors and lights.
- **Mother of pearl:** the bell push uses iridescent clearcoat nacre.
- **Prototype limit:** all maps are procedural and generated at load. For the final quality, I recommend **CC0 scanned PBR sets** from Poly Haven or ambientCG (wood veneer, black limestone, Nero Marquina, brushed brass) at 1K, compressed to KTX2/WebP. That needs your approval to download.

## 5. Lighting

- **Key:** a warm grazing downlight in the recess ceiling with one 1024² soft shadow. It rakes the door panels so the bevels and marquetry cast real shadows.
- **Practicals:** two Art Deco fan sconces with warm point lights and bloom halos. They paint gradients across the stone and throw specular streaks onto the lacquer.
- **Fill:** a very low hemisphere light plus a warm reflection environment.
- **Motivated leaks:** a thin line of light through the meeting stiles and under the doors, a pool on the floor, and the fanlight.
- **Grade:** ACES filmic tone mapping, half-resolution bloom, an optical vignette and fine film grain. The grain is what removes the "mathematically perfect" CG look.
- **Final minute:** a single `anticipation` value (0→1, the existing domain function) raises the fanlight, seam, sill, floor pool, sconces, downlight and bloom together. The change is continuous and never flashes.
- **Midnight:** at zero the seam blazes; the leaves swing about 100° inward over 3.6 s while the room's light floods the recess and floor; the camera passes through into warm white and the butler's welcome.

## 6. Atmosphere

- Light exponential fog in a warm black.
- Slow dust motes catching the light in front of the doors.
- Bloom halos on the practicals and grain over everything.
- **Proposed additions:** a soft volumetric shaft from the recess downlight; a faint breath of warm haze through the opening at midnight; and occasional sconce micro-variance, very subtle and never a flicker.

## 7. Countdown: the time-lock

The countdown becomes a **bank-vault time-lock mounted across both doors at eye level**. It is an engraved brushed-brass plate per leaf, with ivory-on-enamel number drums in recessed windows that roll mechanically on each change. DAYS and HOURS sit on the left leaf, MINUTES and SECONDS on the right. At midnight the lock reads 00 00 00 00 and the doors part, carrying each half of the mechanism with them.

- **Legibility:** the digits render about 22–25 CSS px tall on a 390 px-wide iPhone, which is legible. **The engraved unit labels are currently too small (about 5 px).** Production will enlarge the plate and labels, and fall back to a tiny HTML caption if needed.
- **Accessibility:** the existing `role="timer"` text stays in the DOM. The 3D canvas is decorative.
- **Data:** the prototype already drives the drums from the shipped `openingInstant` / `remainingUntil` / `anticipation` functions, unchanged.

## 8. Butler

- **The bell:** a slim brass bell-push on the right-hand jamb at hand height, with a mother-of-pearl push and a pierced speaker grille.
- **Ringing:** tapping it depresses the push and lights the grille from within. His line fades in as a film-style subtitle over the floor ("— THE BUTLER") and fades out after about 9 s. Nothing is shown until he is summoned, which preserves the mystery.
- **Lines:** the existing scripted repertoire is reused.
- **Hit target:** a generous invisible target of about 50 × 80 px.
- **Production additions:**
  - a real `<button>` overlay positioned over the projected bell, for keyboard and VoiceOver;
  - a single slow light glint across the push on first visit, to aid discovery;
  - optional sound, off by default.

## 9. Rendering strategy and integration

- **Progressive loading:** the existing SVG/CSS entrance renders instantly as a poster. The 3D chunk (Three.js plus scene) lazy-loads afterwards and crossfades in once its first frame is ready. On hotel Wi-Fi the guest never sees a blank screen.
- **Offline:** the chunk and textures are precached by the existing worker.
- **State:** the existing `useEntrance` hook drives the scene. Scene modules stay presentation-only, and no domain logic is duplicated.
- **Fallbacks:** the SVG entrance is used when WebGL is unavailable, when the context is lost, or on low-power or failing tiers.
- **Reduced motion:** a still camera; the doors open by a light crossfade with no camera travel.
- **Performance work before shipping:**
  - merge static geometry per material (the prototype has about 290 draw calls; the target is ≤ 120);
  - dispose canvas sources;
  - KTX2 textures;
  - render on demand at 30 fps when idle, 60 fps during interaction and the ceremony;
  - pause when hidden.

## 10. Expected mobile performance

- **Measured:** about 120 fps (display-capped) in desktop Chromium at DPR 2 with 15k triangles and 290 draw calls. **Nothing has been measured on an iPhone yet.**
- **Budget:**
  - ≤ 120 draw calls and ≤ 60k triangles;
  - one 1024² shadow map;
  - DPR capped at 2;
  - reflection at 0.4 resolution and bloom at half resolution.
- **Expected device behaviour:** iPhone 12 or newer should hold 60 fps within this budget; older devices fall back via adaptive tiers.
- **Adaptive tiers:** sample frame time over the first 2 s, then step down: DPR 1.5, no planar reflection (environment-only floor), no shadow, then fall back to SVG.
- **Payload:** about 150 KB gzip estimated for Three.js and postprocessing, plus 0.5–1 MB of textures if scanned sets are approved. All of it is precached after the first visit.

## 11. Decisions (1–4 approved 2026-10-18; 5 still open)

1. Approve the real-time 3D direction, with the SVG entrance retained as poster and fallback.
2. Approve the time-lock-on-the-doors countdown.
3. Approve downloading CC0 scanned PBR textures, or keep procedural materials.
4. Midnight hand-off: (a) a 3D glimpse of the foyer beyond the doors, then the existing HTML foyer (recommended for 2B); or (b) a fully modelled 3D foyer (larger scope).
5. Confirm the rehearsal device (iPhone model) for performance budgeting.
