import * as THREE from 'three';
import type { MazeData } from './mazeGenerator';

// ── Creepy wall writings & drawings in backrooms style ──

const WRITINGS = [
  'ВЫХОДА НЕТ', 'ОНО ЗДЕСЬ', 'НЕ ОБОРАЧИВАЙСЯ', 'ПОМОГИТЕ',
  'Я СЛЫШУ ГУДЕНИЕ', 'КТО-ТО ИДЁТ', 'ТЫ НЕ ОДИН', 'НЕ СПАТЬ',
  'ГДЕ Я?', 'СТЕНЫ ДВИГАЮТСЯ', 'БЕГИТЕ', 'ЭТО НЕ СОН',
  'НЕ ВЕРЬ ТИШИНЕ', 'ПОВЕРНИ НАЗАД', 'ЗДЕСЬ НИКОГО',
  'ОСТАВАЙСЯ НА СВЕТУ', 'СВЕТ ГАСНЕТ', 'НЕ ИДИ ТУДА',
  'Я ТУТ УЖЕ 3 ДНЯ', 'ВОДА КОНЧИЛАСЬ', 'ДЕНЬ 17',
  'ЗАПАХ УСИЛИВАЕТСЯ', 'Я ЗАБЫЛ СВОЁ ИМЯ', 'КОВЁР МОКРЫЙ',
  'СКОЛЬКО ЭТАЖЕЙ?', 'МАМА', 'ТУТ БЫЛ АНДРЕЙ', 'ДВЕРЬ???',
  'УРОВЕНЬ 0', 'ОНИ В СТЕНАХ', 'СЛЕДЫ ???', 'ЛАМПЫ МОРГАЮТ',
  'ВЫХОД ЛОЖЬ', 'НЕ БЕГАЙ', 'ТУПИК',
  'NO EXIT', 'IT SEES YOU', 'LEVEL 0', 'HELP',
  'THE BUZZING', 'RUN', 'GOD HELP ME', 'STAY IN THE LIGHT',
  'IF YOU FOUND THIS IM SORRY', 'I CAN HEAR IT',
  '= )', '████████', '∞', '→ → →', '???', '!!!',
  '0 0 0 0 0 0', 'X', 'нет нет нет нет',
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Content types: text or drawing ──
type ContentType = 'text' | 'drawing';
type WritingStyle = 'marker' | 'scratchy' | 'panic' | 'small' | 'symbol';
type DrawingType = 'cat' | 'tree' | 'monster' | 'house' | 'sun' | 'stickman' | 'eye' | 'spiral';

const DRAWING_TYPES: DrawingType[] = ['cat', 'tree', 'monster', 'house', 'sun', 'stickman', 'eye', 'spiral'];

function randomContentType(): ContentType {
  return Math.random() < 0.25 ? 'drawing' : 'text';
}

function randomStyle(): WritingStyle {
  const r = Math.random();
  if (r < 0.30) return 'marker';
  if (r < 0.50) return 'scratchy';
  if (r < 0.70) return 'panic';
  if (r < 0.88) return 'small';
  return 'symbol';
}

// ══════════════════════════════════════
// DRAWING FUNCTIONS — crude hand-drawn style
// ══════════════════════════════════════

// Jittery line — simulates shaky hand
function jitterLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, steps = 6) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 3;
    const y = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 3;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Jittery circle
function jitterCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, segments = 16) {
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const jr = r + (Math.random() - 0.5) * r * 0.25;
    const x = cx + Math.cos(a) * jr;
    const y = cy + Math.sin(a) * jr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

// Jittery ellipse
function jitterEllipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, segments = 16) {
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const jrx = rx + (Math.random() - 0.5) * rx * 0.2;
    const jry = ry + (Math.random() - 0.5) * ry * 0.2;
    const x = cx + Math.cos(a) * jrx;
    const y = cy + Math.sin(a) * jry;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function setupDrawCtx(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = 2 + Math.random() * 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawCat(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2, cy = h / 2;
  // Head
  jitterCircle(ctx, cx, cy, 22);
  // Ears (triangles)
  jitterLine(ctx, cx - 18, cy - 18, cx - 12, cy - 35);
  jitterLine(ctx, cx - 12, cy - 35, cx - 4, cy - 18);
  jitterLine(ctx, cx + 18, cy - 18, cx + 12, cy - 35);
  jitterLine(ctx, cx + 12, cy - 35, cx + 4, cy - 18);
  // Eyes — dots
  ctx.beginPath();
  ctx.arc(cx - 9, cy - 4, 3, 0, Math.PI * 2);
  ctx.arc(cx + 9, cy - 4, 3, 0, Math.PI * 2);
  ctx.fill();
  // Nose — small triangle
  jitterLine(ctx, cx, cy + 4, cx - 3, cy + 8);
  jitterLine(ctx, cx - 3, cy + 8, cx + 3, cy + 8);
  jitterLine(ctx, cx + 3, cy + 8, cx, cy + 4);
  // Mouth
  jitterLine(ctx, cx, cy + 8, cx - 6, cy + 14, 4);
  jitterLine(ctx, cx, cy + 8, cx + 6, cy + 14, 4);
  // Whiskers
  jitterLine(ctx, cx - 8, cy + 6, cx - 28, cy + 2, 4);
  jitterLine(ctx, cx - 8, cy + 8, cx - 26, cy + 10, 4);
  jitterLine(ctx, cx + 8, cy + 6, cx + 28, cy + 2, 4);
  jitterLine(ctx, cx + 8, cy + 8, cx + 26, cy + 10, 4);
}

function drawTree(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2, bottom = h - 10;
  // Trunk
  jitterLine(ctx, cx - 4, bottom, cx - 3, cy(h, 0.45));
  jitterLine(ctx, cx + 4, bottom, cx + 3, cy(h, 0.45));
  // Crown — messy scribble circles
  const crownY = h * 0.35;
  ctx.lineWidth = 2.5;
  jitterEllipse(ctx, cx, crownY, 25, 20);
  jitterEllipse(ctx, cx - 12, crownY + 5, 18, 15);
  jitterEllipse(ctx, cx + 12, crownY + 5, 18, 15);
  // Some scribble inside crown
  for (let i = 0; i < 5; i++) {
    const sx = cx + (Math.random() - 0.5) * 30;
    const sy = crownY + (Math.random() - 0.5) * 20;
    jitterLine(ctx, sx, sy, sx + (Math.random() - 0.5) * 12, sy + (Math.random() - 0.5) * 12, 3);
  }
}
function cy(_h: number, frac: number) { return _h * frac; }

function drawMonster(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2;
  ctx.lineWidth = 2.5;
  // Tall body — irregular blob
  jitterEllipse(ctx, cx, h * 0.5, 18, 30);
  // Multiple eyes — creepy
  const eyeCount = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < eyeCount; i++) {
    const ex = cx + (Math.random() - 0.5) * 24;
    const ey = h * 0.3 + Math.random() * h * 0.2;
    const er = 3 + Math.random() * 4;
    jitterCircle(ctx, ex, ey, er);
    // Pupil
    ctx.beginPath();
    ctx.arc(ex, ey, er * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Jagged mouth
  const mouthY = h * 0.65;
  ctx.beginPath();
  ctx.moveTo(cx - 15, mouthY);
  for (let i = 0; i < 8; i++) {
    const tx = cx - 15 + (i / 7) * 30;
    const ty = mouthY + (i % 2 === 0 ? 0 : 8 + Math.random() * 4);
    ctx.lineTo(tx + (Math.random() - 0.5) * 2, ty);
  }
  ctx.stroke();
  // Arms — spiky
  jitterLine(ctx, cx - 18, h * 0.45, cx - 35, h * 0.35, 4);
  jitterLine(ctx, cx + 18, h * 0.45, cx + 35, h * 0.35, 4);
  // Legs
  jitterLine(ctx, cx - 8, h * 0.78, cx - 14, h - 8, 4);
  jitterLine(ctx, cx + 8, h * 0.78, cx + 14, h - 8, 4);
}

function drawHouse(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2;
  const baseY = h - 12;
  const topY = h * 0.45;
  const halfW = 25;
  // Walls
  jitterLine(ctx, cx - halfW, baseY, cx - halfW, topY);
  jitterLine(ctx, cx + halfW, baseY, cx + halfW, topY);
  jitterLine(ctx, cx - halfW, baseY, cx + halfW, baseY);
  // Roof — triangle
  jitterLine(ctx, cx - halfW - 5, topY, cx, h * 0.2);
  jitterLine(ctx, cx + halfW + 5, topY, cx, h * 0.2);
  jitterLine(ctx, cx - halfW - 5, topY, cx + halfW + 5, topY);
  // Door
  jitterLine(ctx, cx - 6, baseY, cx - 6, baseY - 18);
  jitterLine(ctx, cx + 6, baseY, cx + 6, baseY - 18);
  jitterLine(ctx, cx - 6, baseY - 18, cx + 6, baseY - 18);
  // Window
  const winX = cx + 14, winY = topY + 12;
  jitterLine(ctx, winX - 5, winY, winX + 5, winY);
  jitterLine(ctx, winX - 5, winY + 10, winX + 5, winY + 10);
  jitterLine(ctx, winX - 5, winY, winX - 5, winY + 10);
  jitterLine(ctx, winX + 5, winY, winX + 5, winY + 10);
  // Cross in window
  ctx.lineWidth = 1.5;
  jitterLine(ctx, winX, winY, winX, winY + 10, 3);
  jitterLine(ctx, winX - 5, winY + 5, winX + 5, winY + 5, 3);
}

function drawSun(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2, sunCY = h * 0.45;
  ctx.lineWidth = 2.5;
  jitterCircle(ctx, cx, sunCY, 16);
  // Rays
  const rayCount = 8 + Math.floor(Math.random() * 4);
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    const innerR = 19 + Math.random() * 3;
    const outerR = 28 + Math.random() * 10;
    jitterLine(ctx,
      cx + Math.cos(a) * innerR, sunCY + Math.sin(a) * innerR,
      cx + Math.cos(a) * outerR, sunCY + Math.sin(a) * outerR, 3);
  }
  // Smiley or blank face
  if (Math.random() > 0.5) {
    ctx.beginPath();
    ctx.arc(cx - 6, sunCY - 3, 2, 0, Math.PI * 2);
    ctx.arc(cx + 6, sunCY - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, sunCY + 2, 8, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
}

function drawStickman(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2;
  ctx.lineWidth = 2.5;
  // Head
  jitterCircle(ctx, cx, h * 0.2, 10);
  // Body
  jitterLine(ctx, cx, h * 0.3, cx, h * 0.6);
  // Arms
  jitterLine(ctx, cx, h * 0.38, cx - 20, h * 0.5);
  jitterLine(ctx, cx, h * 0.38, cx + 20, h * 0.5);
  // Legs
  jitterLine(ctx, cx, h * 0.6, cx - 16, h * 0.85);
  jitterLine(ctx, cx, h * 0.6, cx + 16, h * 0.85);
  // Creepy touch — X eyes or dots
  if (Math.random() > 0.5) {
    ctx.beginPath();
    ctx.arc(cx - 4, h * 0.19, 2, 0, Math.PI * 2);
    ctx.arc(cx + 4, h * 0.19, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.lineWidth = 1.5;
    jitterLine(ctx, cx - 6, h * 0.17, cx - 2, h * 0.21, 2);
    jitterLine(ctx, cx - 2, h * 0.17, cx - 6, h * 0.21, 2);
    jitterLine(ctx, cx + 2, h * 0.17, cx + 6, h * 0.21, 2);
    jitterLine(ctx, cx + 6, h * 0.17, cx + 2, h * 0.21, 2);
  }
}

function drawEye(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2, ey = h * 0.45;
  ctx.lineWidth = 2.5;
  // Eye shape — almond
  ctx.beginPath();
  ctx.moveTo(cx - 28, ey);
  ctx.quadraticCurveTo(cx, ey - 22, cx + 28, ey);
  ctx.quadraticCurveTo(cx, ey + 22, cx - 28, ey);
  ctx.closePath();
  ctx.stroke();
  // Iris
  jitterCircle(ctx, cx, ey, 12);
  // Pupil
  ctx.beginPath();
  ctx.arc(cx, ey, 5, 0, Math.PI * 2);
  ctx.fill();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(cx - 3, ey - 4, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpiral(ctx: CanvasRenderingContext2D, w: number, h: number) {
  setupDrawCtx(ctx, w, h);
  const cx = w / 2, sy = h * 0.48;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const turns = 3 + Math.random() * 2;
  const maxR = 28;
  for (let i = 0; i <= turns * 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 2;
    const r = (t / turns) * maxR;
    const x = cx + Math.cos(a) * r + (Math.random() - 0.5) * 1.5;
    const y = sy + Math.sin(a) * r + (Math.random() - 0.5) * 1.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// Dispatch drawing
function drawImage(type: DrawingType, ctx: CanvasRenderingContext2D, w: number, h: number) {
  switch (type) {
    case 'cat': drawCat(ctx, w, h); break;
    case 'tree': drawTree(ctx, w, h); break;
    case 'monster': drawMonster(ctx, w, h); break;
    case 'house': drawHouse(ctx, w, h); break;
    case 'sun': drawSun(ctx, w, h); break;
    case 'stickman': drawStickman(ctx, w, h); break;
    case 'eye': drawEye(ctx, w, h); break;
    case 'spiral': drawSpiral(ctx, w, h); break;
  }
}

function createDrawingTexture(type: DrawingType): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const size = 128;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Slight overall rotation for hand-drawn feel
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((Math.random() - 0.5) * 0.15);
  ctx.translate(-size / 2, -size / 2);

  drawImage(type, ctx, size, size);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

// ══════════════════════════════════════
// TEXT TEXTURE (unchanged logic)
// ══════════════════════════════════════

function createWritingTexture(text: string, style: WritingStyle): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');

  let fontSize: number;
  let fontFamily: string;
  let bold: boolean;
  let jitterAmount: number;
  let rotation: number;

  switch (style) {
    case 'marker':
      fontSize = 28 + Math.floor(Math.random() * 10);
      fontFamily = pickRandom(['monospace', 'sans-serif']);
      bold = true; jitterAmount = 2.5;
      rotation = (Math.random() - 0.5) * 0.1;
      break;
    case 'scratchy':
      fontSize = 18 + Math.floor(Math.random() * 8);
      fontFamily = 'serif';
      bold = false; jitterAmount = 4;
      rotation = (Math.random() - 0.5) * 0.18;
      break;
    case 'panic':
      fontSize = 34 + Math.floor(Math.random() * 14);
      fontFamily = pickRandom(['monospace', 'sans-serif', 'serif']);
      bold = true; jitterAmount = 6;
      rotation = (Math.random() - 0.5) * 0.25;
      break;
    case 'small':
      fontSize = 14 + Math.floor(Math.random() * 5);
      fontFamily = 'monospace';
      bold = false; jitterAmount = 0.5;
      rotation = (Math.random() - 0.5) * 0.04;
      break;
    case 'symbol':
      fontSize = 40 + Math.floor(Math.random() * 20);
      fontFamily = 'sans-serif';
      bold = true; jitterAmount = 1;
      rotation = (Math.random() - 0.5) * 0.3;
      break;
  }

  const charW = fontSize * 0.7;
  const w = Math.max(64, Math.min(512, Math.ceil(text.length * charW + 40)));
  const h = Math.max(48, fontSize + 30);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000000';

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(rotation);

  const chars = text.split('');
  const totalWidth = ctx.measureText(text).width;
  let curX = -totalWidth / 2;
  for (const char of chars) {
    const cw = ctx.measureText(char).width;
    const jx = (Math.random() - 0.5) * jitterAmount;
    const jy = (Math.random() - 0.5) * jitterAmount;
    ctx.fillText(char, curX + cw / 2 + jx, jy);
    curX += cw;
  }

  if (style === 'scratchy') {
    ctx.globalAlpha = 0.7;
    curX = -totalWidth / 2;
    for (const char of chars) {
      const cw = ctx.measureText(char).width;
      ctx.fillText(char, curX + cw / 2 + 1.5, 1);
      curX += cw;
    }
  }

  if (style === 'panic' && Math.random() > 0.5) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 + Math.random() * 2;
    const lineY = Math.random() > 0.5 ? fontSize * 0.35 : 0;
    ctx.beginPath();
    ctx.moveTo(-totalWidth / 2 - 5, lineY + (Math.random() - 0.5) * 3);
    ctx.lineTo(totalWidth / 2 + 5, lineY + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }

  ctx.restore();

  if ((style === 'marker' || style === 'panic') && Math.random() > 0.5) {
    ctx.globalAlpha = 0.8;
    const drips = 1 + Math.floor(Math.random() * 4);
    for (let d = 0; d < drips; d++) {
      const dx = Math.random() * w;
      const dy = h * 0.5 + Math.random() * 5;
      const dLen = 4 + Math.random() * 20;
      const dWidth = 1 + Math.random() * 2;
      ctx.fillStyle = '#000000';
      ctx.fillRect(dx, dy, dWidth, dLen);
    }
  }

  if (Math.random() < 0.08) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.3); ctx.lineTo(w * 0.9, h * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.1, h * 0.7); ctx.lineTo(w * 0.9, h * 0.3); ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

// ══════════════════════════════════════
// WALL SURFACE FINDING
// ══════════════════════════════════════

interface WallSurface {
  x: number; y: number; z: number; rotY: number;
}

export interface WallInterestPoint {
  x: number;
  z: number;
  lookX: number;
  lookZ: number;
}

function findWallSurfaces(maze: MazeData, cellSize: number): WallSurface[] {
  const surfaces: WallSurface[] = [];
  const { grid, width, height } = maze;
  const WALL_HALF = 0.075;
  const wallDist = cellSize / 2 - WALL_HALF - 0.02;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (x === maze.startX && z === maze.startZ) continue;
      if (x === maze.exitX && z === maze.exitZ) continue;

      const cell = grid[z][x];
      const cx = x * cellSize + cellSize / 2;
      const cz = z * cellSize + cellSize / 2;
      const y = 1.0 + Math.random() * 1.1;

      if (cell.walls.north) surfaces.push({ x: cx, y, z: cz - wallDist, rotY: 0 });
      if (cell.walls.south) surfaces.push({ x: cx, y, z: cz + wallDist, rotY: Math.PI });
      if (cell.walls.west)  surfaces.push({ x: cx - wallDist, y, z: cz, rotY: Math.PI / 2 });
      if (cell.walls.east)  surfaces.push({ x: cx + wallDist, y, z: cz, rotY: -Math.PI / 2 });
    }
  }
  return surfaces;
}

// ══════════════════════════════════════
// BUILD & PLACE
// ══════════════════════════════════════

export function buildWallWritings(
  maze: MazeData,
  cellSize: number,
  scene: THREE.Scene,
): WallInterestPoint[] {
  const allSurfaces = findWallSurfaces(maze, cellSize);
  const chosen = allSurfaces.filter(() => Math.random() < 0.05);
  const maxItems = Math.min(chosen.length, 10);
  const interestPoints: WallInterestPoint[] = [];
  if (maxItems === 0) return interestPoints;

  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const usedTexts = new Set<string>();
  const usedDrawings = new Set<DrawingType>();

  for (let i = 0; i < maxItems; i++) {
    const surface = chosen[i];
    const contentType = randomContentType();

    let texture: THREE.CanvasTexture;
    let scaleW: number;
    let scaleH: number;

    if (contentType === 'drawing') {
      let dtype: DrawingType;
      if (usedDrawings.size < DRAWING_TYPES.length) {
        do {
          dtype = pickRandom(DRAWING_TYPES);
        } while (usedDrawings.has(dtype) && usedDrawings.size < DRAWING_TYPES.length);
        usedDrawings.add(dtype);
      } else {
        dtype = pickRandom(DRAWING_TYPES);
      }

      texture = createDrawingTexture(dtype);
      const baseSize = 0.7 + Math.random() * 0.6;
      scaleW = baseSize;
      scaleH = baseSize;
    } else {
      const style = randomStyle();
      let text: string;
      let attempts = 0;
      do {
        text = pickRandom(WRITINGS);
        attempts++;
      } while (usedTexts.has(text) && attempts < 15);
      usedTexts.add(text);

      texture = createWritingTexture(text, style);

      switch (style) {
        case 'panic':
          scaleW = Math.min(3.2, text.length * 0.2 + 0.6);
          scaleH = scaleW * 0.38;
          break;
        case 'small':
          scaleW = Math.min(2.0, text.length * 0.1 + 0.3);
          scaleH = scaleW * 0.32;
          break;
        case 'symbol':
          scaleW = 0.7 + Math.random() * 0.6;
          scaleH = scaleW * 0.85;
          break;
        default:
          scaleW = Math.min(2.8, text.length * 0.14 + 0.4);
          scaleH = scaleW * 0.32;
      }
    }

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(planeGeo, material);
    mesh.scale.set(scaleW, scaleH, 1);
    mesh.position.set(surface.x, surface.y, surface.z);
    mesh.rotation.y = surface.rotY;
    mesh.rotation.z = (Math.random() - 0.5) * 0.12;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);

    // Point where AI can stand and look at the wall item.
    const standOffset = 0.9;
    const dirX = Math.sin(surface.rotY);
    const dirZ = Math.cos(surface.rotY);
    interestPoints.push({
      x: surface.x + dirX * standOffset,
      z: surface.z + dirZ * standOffset,
      lookX: surface.x,
      lookZ: surface.z,
    });
  }

  return interestPoints;
}
