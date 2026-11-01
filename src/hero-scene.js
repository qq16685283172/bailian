import * as THREE from 'three';

const vertexBackground = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// 红色丝绸飘带 + 暖色云雾 + 金色光晕 + 胶片颗粒，全部在 GPU 上计算
const fragmentBackground = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uAspect;
uniform vec2 uMouse;
uniform float uMotion;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0, amplitude = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) { value += amplitude * noise(p); p = rot * p * 2.02; amplitude *= 0.5; }
  return value;
}

void main() {
  float t = uTime * uMotion;
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  vec2 parallax = uMouse * 0.03;

  vec3 color = mix(vec3(0.26, 0.032, 0.055), vec3(0.47, 0.062, 0.082), smoothstep(0.0, 1.0, vUv.y + 0.15));

  // 顶部炉火光晕
  float glow = exp(-3.2 * length((vUv - vec2(0.84, 0.92) + parallax) * vec2(uAspect, 1.0)));
  color += vec3(0.62, 0.34, 0.13) * glow * 0.55;

  // 云层：低频 fbm，缓慢横向漂移
  float clouds = fbm(vec2(p.x * 1.5 - t * 0.09, p.y * 2.6 + t * 0.02));
  clouds = smoothstep(0.42, 0.86, clouds);
  color = mix(color, vec3(0.85, 0.60, 0.40), clouds * 0.13 * (0.35 + 0.65 * vUv.y));
  float wisps = fbm(vec2(p.x * 3.4 + t * 0.05, p.y * 5.0));
  color += vec3(0.9, 0.72, 0.5) * smoothstep(0.62, 0.95, wisps) * 0.05;

  // 三层丝绸飘带，各自不同相位与厚度
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float speed = 0.22 + fi * 0.07;
    float wave = sin(p.x * 1.7 + t * speed + fi * 2.1) * 0.15
               + sin(p.x * 3.3 - t * speed * 0.62 + fi) * 0.055;
    wave += (fbm(vec2(p.x * 1.3 + fi * 3.0, t * 0.03)) - 0.5) * 0.14;
    float center = 0.26 + fi * 0.21 + wave + parallax.y;
    float thickness = 0.05 + 0.018 * fi;
    float d = abs(vUv.y - center);
    float band = smoothstep(thickness, 0.0, d);
    float sheen = pow(max(0.0, 1.0 - d / thickness), 3.0);
    float rim = smoothstep(thickness * 0.95, thickness * 0.45, d) - smoothstep(thickness * 0.45, 0.0, d);
    vec3 silk = mix(vec3(0.60, 0.07, 0.10), vec3(0.88, 0.22, 0.16), sheen);
    silk += vec3(0.95, 0.66, 0.30) * rim * 0.4;
    color = mix(color, silk, band * (0.42 - 0.09 * fi));
    color += vec3(1.0, 0.74, 0.38) * sheen * band * 0.06;
  }

  // 斜向丝光
  float sheenSweep = pow(max(0.0, sin((vUv.x * uAspect + vUv.y) * 3.0 - t * 0.25)), 8.0);
  color += vec3(0.9, 0.6, 0.3) * sheenSweep * 0.035;

  float vignette = smoothstep(1.35, 0.3, length((vUv - 0.5) * vec2(uAspect, 1.0)));
  color *= 0.72 + 0.28 * vignette;
  color += (hash(vUv * 913.0 + fract(t) * 7.0) - 0.5) * 0.022;
  gl_FragColor = vec4(color, 1.0);
}
`;

const vertexEmbers = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uMotion;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  float life = fract(aSeed + uTime * uMotion * (0.03 + aSeed * 0.05));
  vec3 pos = position;
  pos.y = -1.05 + life * 2.1;
  pos.x += sin(uTime * uMotion * 0.4 + aSeed * 40.0) * 0.06 + life * 0.12;
  vAlpha = sin(life * 3.14159) * (0.35 + 0.65 * aSeed);
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = (1.6 + aSeed * 3.4) * uPixelRatio;
}
`;

const fragmentEmbers = /* glsl */`
precision mediump float;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.05, d) * vAlpha;
  gl_FragColor = vec4(1.0, 0.80, 0.46, alpha);
}
`;

function mulberry32(seed) {
  return function random() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createHeroScene(container) {
  if (!container) return null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.domElement.className = 'hero-canvas-gl';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 5;

  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      vertexShader: vertexBackground,
      fragmentShader: fragmentBackground,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uAspect: { value: 1 }, uMotion: { value: reduced ? 0.12 : 1 },
        uMouse: { value: new THREE.Vector2(0, 0) },
      },
    }),
  );
  background.frustumCulled = false;
  background.renderOrder = -1;
  scene.add(background);

  // K 线：红涨绿跌，instanced body + wick，缓慢向左滚动
  const random = mulberry32(20261029);
  const COUNT = 46;
  const candles = [];
  let price = 0.5;
  const nextCandle = () => {
    const open = price;
    const drift = (random() - 0.46) * 0.16;
    const close = Math.min(0.95, Math.max(0.05, open + drift));
    price = close;
    const high = Math.min(1, Math.max(open, close) + random() * 0.07);
    const low = Math.max(0, Math.min(open, close) - random() * 0.07);
    return { open, close, high, low };
  };
  for (let index = 0; index < COUNT; index += 1) candles.push(nextCandle());

  const bodyMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.02), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 }), COUNT);
  const wickMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.02), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28 }), COUNT);
  bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const upColor = new THREE.Color(0.95, 0.36, 0.30);
  const downColor = new THREE.Color(0.24, 0.62, 0.48);
  const dummy = new THREE.Object3D();
  scene.add(bodyMesh, wickMesh);

  // 火星：锻打主题的金色微粒
  const emberCount = 110;
  const emberGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(emberCount * 3);
  const seeds = new Float32Array(emberCount);
  for (let index = 0; index < emberCount; index += 1) {
    positions[index * 3] = (random() - 0.5) * 4;
    positions[index * 3 + 1] = 0;
    positions[index * 3 + 2] = 0.4;
    seeds[index] = random();
  }
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  emberGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const embers = new THREE.Points(emberGeometry, new THREE.ShaderMaterial({
    vertexShader: vertexEmbers, fragmentShader: fragmentEmbers,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMotion: { value: reduced ? 0.1 : 1 }, uPixelRatio: { value: pixelRatio } },
  }));
  embers.frustumCulled = false;
  scene.add(embers);

  let aspect = 1;
  let scroll = 0;
  const layoutCandles = () => {
    const spacing = (2 * aspect + 0.6) / COUNT;
    const bodyWidth = spacing * 0.52;
    const mapY = value => -1.04 + value * 0.5;
    for (let index = 0; index < COUNT; index += 1) {
      const candle = candles[index];
      const x = -aspect - 0.3 + index * spacing - scroll;
      const rising = candle.close >= candle.open;
      const color = rising ? upColor : downColor;
      const top = mapY(Math.max(candle.open, candle.close));
      const bottom = mapY(Math.min(candle.open, candle.close));
      dummy.position.set(x, (top + bottom) / 2, 0);
      dummy.scale.set(bodyWidth, Math.max(0.006, top - bottom), 1);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(index, dummy.matrix);
      bodyMesh.setColorAt(index, color);
      dummy.position.set(x, (mapY(candle.high) + mapY(candle.low)) / 2, -0.01);
      dummy.scale.set(bodyWidth * 0.12, Math.max(0.006, mapY(candle.high) - mapY(candle.low)), 1);
      dummy.updateMatrix();
      wickMesh.setMatrixAt(index, dummy.matrix);
      wickMesh.setColorAt(index, color);
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    wickMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (wickMesh.instanceColor) wickMesh.instanceColor.needsUpdate = true;
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    aspect = width / height;
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    background.material.uniforms.uAspect.value = aspect;
    layoutCandles();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const onPointerMove = event => {
    const rect = container.getBoundingClientRect();
    background.material.uniforms.uMouse.value.set(
      ((event.clientX - rect.left) / rect.width - 0.5) * 2,
      ((event.clientY - rect.top) / rect.height - 0.5) * 2,
    );
  };
  container.addEventListener('pointermove', onPointerMove);

  let visible = true;
  const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; }, { threshold: 0 });
  intersection.observe(container);

  const startedAt = performance.now();
  let previous = startedAt;
  let elapsed = 0;
  let frame = 0;
  let disposed = false;
  const animate = () => {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    const now = performance.now();
    const delta = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (!visible || document.hidden) return;
    elapsed += delta;
    const time = (now - startedAt) / 1000;
    background.material.uniforms.uTime.value = time;
    embers.material.uniforms.uTime.value = time;
    if (!reduced) {
      scroll += delta * 0.045;
      const spacing = (2 * aspect + 0.6) / COUNT;
      while (scroll >= spacing) {
        scroll -= spacing;
        candles.shift();
        candles.push(nextCandle());
      }
      layoutCandles();
    }
    renderer.render(scene, camera);
  };
  animate();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      container.removeEventListener('pointermove', onPointerMove);
      scene.traverse(object => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
