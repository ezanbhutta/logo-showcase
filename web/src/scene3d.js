import * as THREE from 'three';

let scene, camera, renderer, particles;
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;
const windowHalfX = window.innerWidth / 2;
const windowHalfY = window.innerHeight / 2;

export function initScene() {
  const canvas = document.getElementById('three-canvas');
  if (!canvas) return;

  // 1. Scene Setup
  scene = new THREE.Scene();
  // Canvas background is set to the Ditto cream canvas color
  scene.background = new THREE.Color('#f9fbf2');

  // 2. Camera Setup
  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 2000);
  camera.position.z = 800;

  // 3. Renderer Setup
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // 4. Pastel Particles (Sunlit Wildflower / Aboard Pastels)
  const geometry = new THREE.BufferGeometry();
  const particleCount = 200;

  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);

  const pastelColors = [
    new THREE.Color('#eff2e5'), // soft-meadow
    new THREE.Color('#fbcfe8'), // blush
    new THREE.Color('#e6dafd'), // lavender
    new THREE.Color('#b6edee'), // mint
    new THREE.Color('#afe4ff'), // powder
    new THREE.Color('#ffe228')  // hi-yellow (accent)
  ];

  for (let i = 0; i < particleCount; i++) {
    // Spread widely
    positions[i * 3] = (Math.random() - 0.5) * 2500;     // x
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2500; // y
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1000 - 200; // z (mostly behind)

    // Assign a random pastel color
    const color = pastelColors[Math.floor(Math.random() * pastelColors.length)];
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    // Random soft size
    sizes[i] = Math.random() * 80 + 20;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  // Use a soft, additive, circle-like sprite for particles
  const material = new THREE.PointsMaterial({
    size: 50,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    map: createCircleTexture(),
    blending: THREE.NormalBlending
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // 5. Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  // 6. Events
  document.addEventListener('mousemove', onDocumentMouseMove);
  window.addEventListener('resize', onWindowResize);

  // 7. Start Loop
  animate();
}

function createCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  
  // Create a soft radial gradient
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onDocumentMouseMove(event) {
  mouseX = (event.clientX - windowHalfX) * 0.5;
  mouseY = (event.clientY - windowHalfY) * 0.5;
}

function animate() {
  requestAnimationFrame(animate);

  // Smooth camera parallax
  targetX = mouseX * 0.5;
  targetY = mouseY * 0.5;
  
  camera.position.x += (targetX - camera.position.x) * 0.02;
  camera.position.y += (-targetY - camera.position.y) * 0.02;
  camera.lookAt(scene.position);

  // Slow drift for particles
  const time = Date.now() * 0.0001;
  const positions = particles.geometry.attributes.position.array;
  
  for (let i = 0; i < positions.length; i += 3) {
    // Gentle sine wave motion
    positions[i + 1] += Math.sin(time + positions[i]) * 0.1;
  }
  particles.geometry.attributes.position.needsUpdate = true;
  particles.rotation.y = time * 0.1;

  renderer.render(scene, camera);
}
