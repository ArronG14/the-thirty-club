/** Post-processing shared by the club's real-time scenes. */

/** Film grain and a soft optical vignette, applied after tone mapping. */
export const GrainVignette = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - vec2(0.5, 0.52);
      float v = smoothstep(0.95, 0.25, length(d * vec2(1.25, 0.95)));
      c.rgb *= mix(0.42, 1.0, v);
      c.rgb += (hash(vUv * 1024.0) - 0.5) * 0.035;
      gl_FragColor = c;
    }
  `,
};

/**
 * Clamps HDR colour before bloom. Near-mirror highlights from point lights
 * can overflow half-float buffers (to infinity, then NaN in the blur),
 * which shows as dark or blue blotches. Clamping keeps them merely bright.
 */
export const HdrClamp = {
  uniforms: { tDiffuse: { value: null }, ceiling: { value: 12 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float ceiling;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(min(max(c.rgb, vec3(0.0)), vec3(ceiling)), c.a);
    }
  `,
};
