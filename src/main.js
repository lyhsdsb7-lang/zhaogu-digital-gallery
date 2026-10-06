import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
const modelUrl = `${import.meta.env.BASE_URL}models/artifact.glb`;
import './style.css';
import { createGildedFormation, installMaterialReveal } from './gilded-formation.js';


const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const stage = $('stage');
const state = { ready: false, mode: 'points', scattered: false, rotating: !reducedMotion.matches, progress: 0, spread: 0, sequence: null, phase: '', start: performance.now(), frames: 0 };
let renderer, controls, camera, cloud, glow, filaments, normalizedModel, uniforms;
const surfaceMaterials = [];
let rendered = false;
let previousTime = performance.now();
let modelRadius = 2.3;
const scene = new THREE.Scene();
const artifact = new THREE.Group();
scene.add(artifact);

function announce(text) { $('announcement').textContent = text; }
function setLoading(percent, text) {
  $('loading-percent').textContent = `已载入 ${Math.round(percent)}`;
  $('loading-bar').style.width = `${percent}%`;
  if (text) $('loading-label').textContent = text;
}
function showError(error) {
  console.error('Gallery:', error);
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error-text').textContent = error.message || '载入遇到问题 请重新尝试';
  $('replay-label').textContent = '暂时无法载入';
  announce('藏品载入失败 可点击重新载入');
}

function initializeRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, stage.clientWidth < 450 ? 1.35 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  $('canvas-mount').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '数字藏品三维展示');
  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 4.7;
  controls.maxDistance = 13;
  controls.minPolarAngle = Math.PI * 0.24;
  controls.maxPolarAngle = Math.PI * 0.74;
  controls.rotateSpeed = 0.55;
  controls.autoRotate = state.rotating;
  controls.autoRotateSpeed = 0.32;
  controls.addEventListener('start', () => { stage.classList.add('interacting'); });
  controls.addEventListener('end', () => { stage.classList.remove('interacting'); });
  const ambient = new THREE.HemisphereLight(0xf8f0e3, 0x444936, 1.8);
  const key = new THREE.DirectionalLight(0xffedd2, 2.5);
  key.position.set(-3, 4, 5);
  const rim = new THREE.DirectionalLight(0xdce0c5, 2.2);
  rim.position.set(4, 3, -4);
  const fill = new THREE.DirectionalLight(0xd0ceac, 0.7);
  fill.position.set(3, -1, 4);
  scene.add(ambient, key, rim, fill);
  buildPedestal();
  resetCamera();
  new ResizeObserver(resize).observe(stage);
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    state.ready = false;
    showError(new Error('三维画面已中断 请重新载入'));
  });
  updateRotateButton();
  renderer.setAnimationLoop(animate);
}

function buildPedestal() {
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x847552, transparent: true, opacity: 0.13 });
  for (const radius of [1.18, 1.48]) {
    const positions = [];
    for (let i = 0; i <= 128; i++) {
      const theta = i / 128 * Math.PI * 2;
      positions.push(Math.cos(theta) * radius, -2.12, Math.sin(theta) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    scene.add(new THREE.Line(geometry, ringMaterial));
  }
  const dustPositions = [], dustColors = [];
  const rng = seededRandom(67);
  for (let i = 0; i < 180; i++) {
    dustPositions.push((rng() - 0.5) * 7.5, (rng() - 0.5) * 5.8, (rng() - 0.5) * 4);
    dustColors.push(0.24, 0.20, 0.12);
  }
  const dust = new THREE.BufferGeometry();
  dust.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
  dust.setAttribute('color', new THREE.Float32BufferAttribute(dustColors, 3));
  scene.add(new THREE.Points(dust, new THREE.PointsMaterial({ size: 0.013, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })));
}

function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function resize() {
  if (!renderer) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  if (uniforms) {
    uniforms.uPixelRatio.value = renderer.getPixelRatio();
    uniforms.uFieldWidth.value = Math.min(1, w / h / 1.05);
  }
}
function resetCamera() {
  const aspect = stage.clientWidth / stage.clientHeight;
  const vertical = THREE.MathUtils.degToRad(camera.fov);
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const distance = modelRadius / Math.sin(Math.min(vertical, horizontal) / 2) * 1.12;
  controls.minDistance = distance * 0.52;
  controls.maxDistance = distance * 1.8;
  camera.position.set(0, 0.22, distance);
  controls.target.set(0, -0.05, 0);
  controls.update();
  resize();
}

function getTexturePixels(texture) {
  if (!texture?.image) return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(texture.image, 0, 0, 1024, 1024);
    return { pixels: context.getImageData(0, 0, 1024, 1024).data, size: 1024, flipY: texture.flipY };
  } catch { return null; }
}

async function loadArtifact() {
  setLoading(3, '展卷之间');
  const model = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(modelUrl, (event) => {
    if (event.total) setLoading(3 + event.loaded / event.total * 64);
  });
  const root = model.scene;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const scale = 3.8 / Math.max(size.x, size.y, size.z, 0.001);
  modelRadius = size.length() * scale / 2;
  normalizedModel = new THREE.Group();
  normalizedModel.add(root);
  normalizedModel.scale.setScalar(scale);
  normalizedModel.position.copy(center).multiplyScalar(-scale);
  artifact.add(normalizedModel);
  artifact.updateMatrixWorld(true);
  setLoading(72, '描摹表面的微光');
  await new Promise(requestAnimationFrame);

  const surfaces = [];
  root.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, mesh.material);
    const positions = geometry.attributes.position;
    const index = geometry.index;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let area = 0;
    for (let i = 0; i < (index?.count || positions.count); i += 3) {
      a.fromBufferAttribute(positions, index ? index.getX(i) : i);
      b.fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1);
      c.fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2);
      area += b.sub(a).cross(c.sub(a)).length() * 0.5;
    }
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material) {
      material.metalness = Math.min(material.metalness ?? 0, 0.3);
      material.roughness = Math.max(material.roughness ?? 1, 0.65);
      material.specularColor?.setRGB(1, 1, 1);
      material.transparent = false;
      material.opacity = 1;
      material.depthWrite = true;
      surfaceMaterials.push(material);
    }
    surfaces.push({ sampler: new MeshSurfaceSampler(surface).build(), area, texture: getTexturePixels(material?.map), geometry });
  });
  if (!surfaces.length) throw new Error('模型内没有可展示的几何表面');
  const totalArea = surfaces.reduce((sum, s) => sum + s.area, 0);
  const count = stage.clientWidth < 450 ? 45000 : 90000;
  const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3), scatter = new Float32Array(count * 3), seeds = new Float32Array(count), kinds = new Float32Array(count);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), color = new THREE.Color(), uv = new THREE.Vector2();
  const rng = seededRandom(1826);
  for (const surface of surfaces) surface.sampler.setRandomGenerator(rng);
  for (let i = 0; i < count; i++) {
    let target = rng() * totalArea;
    let surface = surfaces[surfaces.length - 1];
    for (const candidate of surfaces) { target -= candidate.area; if (target <= 0) { surface = candidate; break; } }
    surface.sampler.sample(p, n, color, uv);
    p.toArray(positions, i * 3);
    n.toArray(normals, i * 3);
    color.setRGB(0.4, 0.35, 0.25);
    if (surface.texture) {
      const { pixels, size, flipY } = surface.texture;
      const x = Math.min(size - 1, Math.floor(((uv.x % 1 + 1) % 1) * size));
      const v = (uv.y % 1 + 1) % 1;
      const y = Math.min(size - 1, Math.floor((flipY ? 1 - v : v) * size));
      const offset = (y * size + x) * 4;
      color.setRGB(pixels[offset] / 255, pixels[offset + 1] / 255, pixels[offset + 2] / 255, THREE.SRGBColorSpace);
    }
    color.toArray(colors, i * 3);
    const inlet = Math.floor(rng() * 6);
    const theta = inlet / 6 * Math.PI * 2;
    const radius = 2.3 + rng() * 0.7;
    scatter.set([
      Math.cos(theta) * radius + (rng() - 0.5) * 0.9,
      Math.sin(theta) * 1.5 + (rng() - 0.5) * 1.1,
      (rng() - 0.5) * 2.8
    ], i * 3);
    seeds[i] = rng();
    kinds[i] = Math.floor(rng() * 6);
    if (i && i % 20000 === 0) {
      setLoading(72 + i / count * 25);
      await new Promise(requestAnimationFrame);
    }
  }
  for (const surface of surfaces) surface.geometry.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  const formation = createGildedFormation(geometry, new THREE.Box3().setFromObject(normalizedModel), renderer.getPixelRatio(), stage.clientWidth < 450);
  ({ uniforms, cloud, glow, filaments } = formation);
  artifact.add(cloud, glow, filaments);
  for (const material of surfaceMaterials) installMaterialReveal(material, uniforms);
  normalizedModel.visible = false;
  artifact.rotation.y = -0.55;
  resetCamera();
  state.ready = true;
  const arrival = $('arrival-particles');
  if (arrival) {
    arrival.style.transition = 'opacity 300ms';
    arrival.style.opacity = '0';
    setTimeout(() => { arrival.dataset.complete = 'true'; }, 300);
  }
  state.progress = reducedMotion.matches ? 1 : 0;
  state.start = performance.now();
  startSequence('intro');
  $('point-count').textContent = `${count / 1000}K`;
  setLoading(100, '微光已就绪');
  $('loading').classList.add('complete');
  setTimeout(() => { $('loading').hidden = true; }, 650);
  document.querySelectorAll('.mode, .stage-tools button, #replay').forEach(button => { button.disabled = false; });
  $('replay-label').textContent = '重演鎏金铸形';
  announce('藏品载入完成 可拖动旋转 切换铸形和原貌');
}

function ease(value) { const t = THREE.MathUtils.clamp(value, 0, 1); return t * t * (3 - 2 * t); }
function setPhase(phase, completion) {
  if (state.phase !== phase) {
    state.phase = phase;
    $('formation-phase').textContent = phase;
  }
  $('formation-progress').style.width = `${completion * 100}%`;
}
function startSequence(kind) {
  if (reducedMotion.matches) {
    state.sequence = null;
    state.progress = kind === 'scatter' ? 0 : 1;
    state.spread = 1;
    state.scattered = kind === 'scatter';
    updateScatterButton();
    return;
  }
  state.sequence = { kind, time: kind === 'intro' ? -0.65 : 0, from: state.progress };
  state.scattered = kind === 'scatter';
  updateScatterButton();
}
function updateSequence(delta) {
  const sequence = state.sequence;
  if (!sequence) {
    setPhase(state.progress > 0.99 ? '三 金蟾入画' : '一 金尘漫游', state.progress);
    return;
  }
  sequence.time += delta;
  const t = Math.max(0, sequence.time);
  let duration;
  if (sequence.kind === 'intro') {
    duration = 6.8;
    state.spread = ease(t / 0.9);
    state.progress = ease((t - 1.2) / 5.6);
    setPhase(t < 1.2 ? '一 金尘四散' : t < 3.7 ? '二 光丝汇流' : '三 鎏金铸形', t / duration);
  } else if (sequence.kind === 'replay') {
    duration = 7.6;
    state.spread = 1;
    state.progress = t < 1.4 ? sequence.from * (1 - ease(t / 1.4)) : ease((t - 1.8) / 5.8);
    setPhase(t < 1.8 ? '一 金尘四散' : t < 4.4 ? '二 光丝汇流' : '三 鎏金铸形', t / duration);
  } else if (sequence.kind === 'scatter') {
    duration = 2.2;
    state.spread = 1;
    state.progress = sequence.from * (1 - ease(t / duration));
    setPhase('一 光粒散开', 1 - t / duration);
  } else {
    duration = 6;
    state.spread = 1;
    state.progress = THREE.MathUtils.lerp(sequence.from, 1, ease(t / duration));
    setPhase(t < 2.4 ? '二 光丝汇流' : '三 鎏金铸形', t / duration);
  }
  if (t >= duration) {
    state.progress = sequence.kind === 'scatter' ? 0 : 1;
    state.sequence = null;
    setPhase(state.progress ? '三 金蟾入画' : '一 金尘漫游', state.progress);
  }
}
function updatePresentation() {
  const solidMode = state.mode === 'solid';
  normalizedModel.visible = true;
  uniforms.uOriginal.value = solidMode ? 1 : 0;
  uniforms.uProgress.value = state.progress;
  uniforms.uSpread.value = state.spread;
  const active = !solidMode && state.progress < 0.995;
  cloud.visible = glow.visible = filaments.visible = active;
  const energy = active ? Math.sin(state.progress * Math.PI) : 0;
  stage.style.setProperty('--field-opacity', String((1 - state.progress) * 0.65));
  stage.style.setProperty('--gather-energy', String(energy));
  controls.autoRotate = state.rotating && (solidMode || (!state.sequence && state.progress > 0.99));
}
function animate(now) {
  if (!renderer || !camera) return;
  const delta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (document.hidden) return;
  if (state.ready && uniforms) {
    const elapsed = (now - state.start) / 1000;
    if (state.mode === 'points') updateSequence(delta);
    uniforms.uTime.value = reducedMotion.matches ? 0 : elapsed;
    updatePresentation();
    state.frames++;
  }
  controls.update(delta);
  renderer.render(scene, camera);
  rendered = true;
}

function setMode(mode) {
  if (!state.ready) return;
  state.mode = mode;
  updatePresentation();
  document.querySelectorAll('.mode').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('scatter').disabled = mode !== 'points';
  announce(mode === 'points' ? '已切换到鎏金铸形' : '已切换到模型原貌');
}
function updateRotateButton() {
  $('rotate').setAttribute('aria-pressed', String(state.rotating));
  const label = state.rotating ? '暂停自动旋转' : '开启自动旋转';
  $('rotate').setAttribute('aria-label', label);
  $('rotate').title = label;
  $('rotate').innerHTML = state.rotating ? '<svg viewBox="0 0 24 24"><path d="M8 6v12M16 6v12"/></svg>' : '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>';
}
function updateScatterButton() {
  const label = state.scattered ? '聚合粒子' : '散开粒子';
  $('scatter').setAttribute('aria-label', label);
  $('scatter').title = label;
  $('scatter').setAttribute('aria-pressed', String(state.scattered));
}
document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
$('rotate').addEventListener('click', () => {
  state.rotating = !state.rotating;
  controls.autoRotate = state.rotating;
  updateRotateButton();
});
$('scatter').addEventListener('click', () => {
  startSequence(state.scattered ? 'gather' : 'scatter');
  announce(state.scattered ? '粒子正在散开' : '粒子正在聚合');
});
$('replay').addEventListener('click', () => {
  setMode('points');
  resetCamera();
  startSequence('replay');
  announce('正在重新唤醒微光');
});
$('reset').addEventListener('click', () => { resetCamera(); announce('已重置视角'); });
$('retry').addEventListener('click', () => location.reload());
document.querySelectorAll('[data-dialog]').forEach(button => button.addEventListener('click', () => $(button.dataset.dialog).showModal()));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
});
reducedMotion.addEventListener('change', () => {
  state.rotating = !reducedMotion.matches;
  if (reducedMotion.matches) { state.sequence = null; state.progress = state.scattered ? 0 : 1; state.spread = 1; }
  if (controls) controls.autoRotate = state.rotating;
  updateRotateButton();
});

// Compact diagnostics for preview verification; contains no user model data.
window.galleryStatus = () => ({ ready: state.ready, mode: state.mode, scattered: state.scattered, rotating: state.rotating, progress: Number(state.progress.toFixed(3)), phase: state.phase, sequence: state.sequence ? { kind: state.sequence.kind, time: Number(state.sequence.time.toFixed(2)) } : null, surfaceOpacity: Number((surfaceMaterials[0]?.opacity ?? 0).toFixed(3)), pointCount: cloud?.geometry.attributes.position.count ?? 0, particleKinds: 6, formationStyle: 'gilded-dissolve', filamentCount: filaments?.geometry.attributes.position.count / 20, revealOverride: uniforms?.uOriginal.value, frames: state.frames, rendered, renderer: renderer?.info.render, camera: camera?.position.toArray() });
try { initializeRenderer(); loadArtifact().catch(showError); } catch (error) { showError(new Error('无法启动三维展示 请重新载入')); console.error(error); }

