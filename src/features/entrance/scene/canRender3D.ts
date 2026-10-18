/**
 * Cheap capability check before the 3D chunk is requested. Kept free of
 * three.js so the decision costs nothing in the main bundle.
 */
export function canRender3D(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.WebGL2RenderingContext === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2', {
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}
