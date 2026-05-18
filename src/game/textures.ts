import * as THREE from 'three';

// Seeded random for consistency
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Extra small textures for weak GPUs
const TEX_SIZE = 64;

export function createWallTexture(): THREE.CanvasTexture {
  const size = TEX_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(42);

  ctx.fillStyle = '#c4a84a';
  ctx.fillRect(0, 0, size, size);

  // Wallpaper blocks
  for (let y = 0; y < size; y += 16) {
    for (let x = 0; x < size; x += 16) {
      const brightness = 0.9 + rand() * 0.2;
      const r = Math.floor(196 * brightness);
      const g = Math.floor(168 * brightness);
      const b = Math.floor(74 * brightness);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 16, 16);
    }
  }

  // Vertical stripes
  for (let x = 0; x < size; x += 32) {
    ctx.fillStyle = `rgba(180,155,60,${0.1 + rand() * 0.1})`;
    ctx.fillRect(x, 0, 2, size);
  }

  // Stains
  for (let i = 0; i < 12; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 20;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(80,60,20,${0.03 + rand() * 0.06})`);
    gradient.addColorStop(1, 'rgba(80,60,20,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createFloorTexture(): THREE.CanvasTexture {
  const size = TEX_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(123);

  ctx.fillStyle = '#6a5a3a';
  ctx.fillRect(0, 0, size, size);

  // Carpet fiber — use bigger blocks for perf
  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const brightness = 0.85 + rand() * 0.3;
      const r = Math.floor(106 * brightness);
      const g = Math.floor(90 * brightness);
      const b = Math.floor(58 * brightness);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // Tile grid
  ctx.strokeStyle = 'rgba(50,40,25,0.2)';
  ctx.lineWidth = 1;
  for (let y = 0; y < size; y += 64) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
  for (let x = 0; x < size; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }

  // Stains
  for (let i = 0; i < 6; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 5 + rand() * 20;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(40,30,15,${0.05 + rand() * 0.08})`);
    gradient.addColorStop(1, 'rgba(40,30,15,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function createCeilingTexture(): THREE.CanvasTexture {
  const size = TEX_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(789);

  ctx.fillStyle = '#d4c890';
  ctx.fillRect(0, 0, size, size);

  // Acoustic dots — bigger step
  for (let y = 0; y < size; y += 6) {
    for (let x = 0; x < size; x += 6) {
      if (rand() > 0.4) {
        const brightness = 0.9 + rand() * 0.15;
        ctx.fillStyle = `rgb(${Math.floor(200 * brightness)},${Math.floor(190 * brightness)},${Math.floor(140 * brightness)})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // Tile lines
  ctx.strokeStyle = 'rgba(150,130,80,0.3)';
  ctx.lineWidth = 2;
  for (let v = 0; v < size; v += 64) {
    ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(size, v); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, size); ctx.stroke();
  }

  // Water stains
  for (let i = 0; i < 4; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 30;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(180,160,80,${0.05 + rand() * 0.08})`);
    gradient.addColorStop(1, 'rgba(180,160,80,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
