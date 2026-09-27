import type { HeadTracking } from '../contracts/faceTracking';

type Vec3 = [number, number, number];
interface Part { center: Vec3; scale: Vec3; color: Vec3; tilt?: number; gloss?: number; shape?: 'sphere' | 'ring' | 'capsule' }
const cream: Vec3 = [0.97, 0.91, 0.75];
const ink: Vec3 = [0.19, 0.18, 0.15];
const clamp = (n: number, min: number, max: number) => Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;

/** All features are solid geometry sharing the same head transform and depth buffer. */
export function mascotParts(pose: HeadTracking | null): Part[] {
  const e = pose?.expression;
  const open = clamp(e?.mouthOpen ?? 0, 0, 1);
  const smile = clamp(e?.smile ?? 0, 0, 1);
  const headRadius = 0.84;
  const glassesDepth = headRadius + 0.025;
  // Equal radii keep the entire head spherical, including its profile and back.
  const surface = (x: number, y: number) =>
    Math.sqrt(Math.max(0, headRadius ** 2 - x ** 2 - (y - 0.065) ** 2));
  const parts: Part[] = [
    { center: [0, 0.065, 0], scale: [headRadius, headRadius, headRadius], color: cream },
    // Pencil tucked behind the head, with a blunt pink eraser.
    { center: [0.70, -0.43, -0.21], scale: [0.083, 0.40, 0.075], color: [1, 0.72, 0.25], tilt: 0.59, shape: 'capsule' },
    { center: [0.916, -0.753, -0.21], scale: [0.084, 0.071, 0.076], color: [0.99, 0.60, 0.64], tilt: 0.59, shape: 'capsule' },
    { center: [-0.005, -0.78, 0], scale: [0.045, 0.17, 0.04], color: [0.34, 0.69, 0.33], tilt: 0.10 },
    { center: [0.025, -0.905, 0], scale: [0.044, 0.10, 0.04], color: [0.34, 0.69, 0.33], tilt: 0.50 },
    { center: [0.14, -0.97, 0], scale: [0.17, 0.072, 0.045], color: [0.34, 0.69, 0.33], tilt: -0.36 },
  ];
  for (const side of [-1, 1]) {
    const blink = clamp((side === 1 ? e?.blinkLeft : e?.blinkRight) ?? 0, 0, 1);
    const lid = Math.max(0.12, 1 - blink);
    const x = side * 0.267 + clamp(e?.gazeX ?? 0, -1, 1) * 0.035;
    const y = 0.21 + clamp(e?.gazeY ?? 0, -1, 1) * 0.025;
    const cheekX = side * 0.40, cheekY = 0.375;
    parts.push(
      { center: [cheekX, cheekY, surface(cheekX, cheekY)], scale: [0.125, 0.068, 0.033], color: [0.99, 0.61, 0.65] },
      { center: [x, y, surface(x, y) + 0.006], scale: [0.073, 0.073 * lid, 0.023], color: ink },
      // True open rings keep the moving pupils visible and stay rigid during blinks.
      { center: [side * 0.267, 0.21, glassesDepth], scale: [0.203, 0.213, 0.203], color: ink, shape: 'ring' },
    );
  }
  // A small arched bridge joins the circular frames.
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    parts.push({ center: [(t * 2 - 1) * 0.068, 0.18 - Math.sin(t * Math.PI) * 0.023, glassesDepth + 0.002], scale: [0.022, 0.022, 0.022], color: ink });
  }
  // Reference's tiny oval mouth, widening gently with a smile and opening with the jaw.
  parts.push({ center: [0, 0.425, surface(0, 0.425) + 0.003], scale: [0.063 + smile * 0.028, 0.038 + open * 0.080, 0.037], color: ink });

  return parts;
}

const vertex = `
attribute vec3 position, vertexNormal;
uniform vec3 center, scale;
uniform vec2 angles;
uniform float tilt, aspect;
varying vec3 normal, world;
vec3 turn(vec3 p) {
  float c = cos(tilt), s = sin(tilt);
  p.xy = mat2(c, s, -s, c) * p.xy;
  return p;
}
vec3 head(vec3 p) {
  float c = cos(angles.x), s = sin(angles.x);
  p.xz = mat2(c, -s, s, c) * p.xz;
  c = cos(angles.y); s = sin(angles.y);
  p.yz = mat2(c, -s, s, c) * p.yz;
  return p;
}
void main() {
  world = head(turn(position * scale) + center);
  normal = normalize(head(turn(vertexNormal / scale)));
  float perspective = 1.0 - world.z * 0.10;
  gl_Position = vec4(world.x * 0.89 / aspect, -(world.y + 0.06) * 0.89, -world.z * 0.25, perspective);
}`;
const fragment = `
precision mediump float;
uniform vec3 color;
uniform float gloss;
varying vec3 normal, world;
void main() {
  vec3 n = normalize(normal);
  vec3 light = normalize(vec3(-0.65, -0.9, 1.5));
  float diffuse = max(dot(n, light), 0.0);
  float fill = max(dot(n, normalize(vec3(0.8, 0.3, 0.6))), 0.0);
  vec3 halfLight = normalize(light + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, halfLight), 0.0), mix(28.0, 85.0, gloss));
  float rim = pow(1.0 - max(n.z, 0.0), 3.0);
  vec3 lit = color * (0.60 + 0.32 * diffuse + 0.10 * fill);
  lit += vec3(1.0, 0.93, 0.83) * spec * (gloss * 0.5);
  lit += color * rim * 0.08;
  gl_FragColor = vec4(lit, 1.0);
}`;

/** Small dependency-free WebGL renderer: smooth spheres, real lighting and proper occlusion. */
export function createMascotRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!gl) return null;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Could not create mascot shader');
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message ?? 'Mascot shader failed');
    }
    return shader;
  };
  const shaders = [compile(gl.VERTEX_SHADER, vertex), compile(gl.FRAGMENT_SHADER, fragment)];
  const program = gl.createProgram()!;
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.linkProgram(program);
  shaders.forEach(shader => gl.deleteShader(shader));
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
  const rows = 24, columns = 40;
  const meshes = (['sphere', 'ring', 'capsule'] as const).map(shape => {
    const vertices: number[] = [], indices: number[] = [];
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
      const lat = Math.PI * row / rows, lon = Math.PI * 2 * col / columns;
      const x = Math.sin(lat) * Math.cos(lon), y = Math.cos(lat), z = Math.sin(lat) * Math.sin(lon);
      if (shape === 'ring') {
        const tube = Math.PI * 2 * row / rows;
        const nx = Math.cos(lon) * Math.cos(tube), ny = Math.sin(lon) * Math.cos(tube), nz = Math.sin(tube);
        vertices.push(Math.cos(lon) + nx * 0.14, Math.sin(lon) + ny * 0.14, nz * 0.14, nx, ny, nz);
      } else {
        vertices.push(x, shape === 'capsule' ? y * 0.2 + Math.sign(y) * 0.8 : y, z, x, y, z);
      }
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col, b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const buffer = gl.createBuffer(), indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return { shape, buffer, indexBuffer, count: indices.length };
  });
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'position'), normal = gl.getAttribLocation(program, 'vertexNormal');
  gl.enableVertexAttribArray(position); gl.enableVertexAttribArray(normal);
  const uniforms = Object.fromEntries(['center', 'scale', 'angles', 'tilt', 'aspect', 'color', 'gloss'].map(name => [name, gl.getUniformLocation(program, name)]));
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  return {
    draw(pose: HeadTracking | null) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniform2f(uniforms.angles, clamp(pose?.yaw ?? 0, -55, 55) * Math.PI / 180, clamp(pose?.pitch ?? 0, -40, 45) * Math.PI / 180);
      gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
      for (const part of mascotParts(pose)) {
        const mesh = meshes.find(mesh => mesh.shape === (part.shape ?? 'sphere'))!;
        gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
        gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
        gl.uniform3fv(uniforms.center, part.center); gl.uniform3fv(uniforms.scale, part.scale);
        gl.uniform3fv(uniforms.color, part.color); gl.uniform1f(uniforms.tilt, part.tilt ?? 0); gl.uniform1f(uniforms.gloss, part.gloss ?? 0);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      }
    },
    dispose() { for (const mesh of meshes) { gl.deleteBuffer(mesh.buffer); gl.deleteBuffer(mesh.indexBuffer); } gl.deleteProgram(program); },
  };
}
