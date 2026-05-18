import * as THREE from 'three';
import type { MazeData } from './mazeGenerator';

const DIRS = [
  { dx: 0, dz: -1, dir: 'north' },
  { dx: 0, dz: 1, dir: 'south' },
  { dx: 1, dz: 0, dir: 'east' },
  { dx: -1, dz: 0, dir: 'west' },
];

const SPIDER_SPEED_PATROL = 1.8;
const SPIDER_SPEED_CHASE = 4.5;
const SPIDER_Y = 0.45;
const DETECT_RANGE = 12;
const DETECT_FOV = 0.7;
const LOSE_CHASE_DIST = 18;
const CATCH_DIST = 1.0;
const SOUND_INTERVAL_MIN = 4;
const SOUND_INTERVAL_MAX = 10;
const SOUND_MAX_DIST = 20;
const LEG_ANIM_SPEED = 12;

type SpiderState = 'patrol' | 'chase';

export class SpiderMonster {
  private scene: THREE.Scene;
  private maze: MazeData;
  private cellSize: number;
  private pos = new THREE.Vector3();
  private targetPos = new THREE.Vector3();
  private state: SpiderState = 'patrol';
  private hasTarget = false;

  // Merged body mesh (single draw call) + separate leg pivots for animation
  private bodyMesh!: THREE.Mesh;
  private legPivots: THREE.Object3D[] = [];
  private group!: THREE.Group;
  private legTime = 0;

  // Audio
  private audioCtx: AudioContext | null = null;
  private audioGain: GainNode | null = null;
  private nextSoundTime = 0;
  private elapsed = 0;

  constructor(scene: THREE.Scene, maze: MazeData, cellSize: number) {
    this.scene = scene;
    this.maze = maze;
    this.cellSize = cellSize;
    this.buildMesh();
    this.spawnAtRandomCell();
    this.pickPatrolTarget();
    this.nextSoundTime = 3 + Math.random() * 5;
  }

  // ── Build spider: merge all static parts into 1 mesh, legs as 8 pivots ──
  private buildMesh() {
    this.group = new THREE.Group();

    // ── Merge static body parts into single geometry (1 draw call) ──
    const mat = new THREE.MeshLambertMaterial({ color: 0x080808 });
    const bodyParts: { geo: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];

    // Abdomen
    const abdGeo = new THREE.SphereGeometry(0.38, 6, 4);
    const abdM = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0.25),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.7, 1.3)
    );
    bodyParts.push({ geo: abdGeo, matrix: abdM });

    // Thorax
    const thorGeo = new THREE.SphereGeometry(0.25, 6, 4);
    const thorM = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.05, -0.25),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.75, 1)
    );
    bodyParts.push({ geo: thorGeo, matrix: thorM });

    // Head
    const headGeo = new THREE.SphereGeometry(0.15, 5, 4);
    const headM = new THREE.Matrix4().makeTranslation(0, 0.1, -0.5);
    bodyParts.push({ geo: headGeo, matrix: headM });

    // Eyes (6) — merge into body
    const eyeGeo = new THREE.SphereGeometry(0.03, 3, 2);
    const eyePositions = [
      [-0.06, 0.14, -0.6], [0.06, 0.14, -0.6],
      [-0.1, 0.1, -0.58], [0.1, 0.1, -0.58],
      [-0.04, 0.08, -0.62], [0.04, 0.08, -0.62],
    ];
    for (const [ex, ey, ez] of eyePositions) {
      bodyParts.push({ geo: eyeGeo, matrix: new THREE.Matrix4().makeTranslation(ex, ey, ez) });
    }

    // Mandibles (2)
    const mandGeo = new THREE.ConeGeometry(0.03, 0.12, 3);
    for (const side of [-1, 1]) {
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(side * 0.06, 0, -0.65),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI * 0.7, 0, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      bodyParts.push({ geo: mandGeo, matrix: m });
    }

    // Merge all body parts
    const mergedPositions: number[] = [];
    const mergedNormals: number[] = [];
    const mergedIndices: number[] = [];
    let vertexOffset = 0;
    const tv = new THREE.Vector3();
    const tn = new THREE.Vector3();

    for (const part of bodyParts) {
      const posAttr = part.geo.getAttribute('position') as THREE.BufferAttribute;
      const normAttr = part.geo.getAttribute('normal') as THREE.BufferAttribute;
      const idxAttr = part.geo.getIndex()!;
      const nm = new THREE.Matrix3().getNormalMatrix(part.matrix);

      for (let i = 0; i < posAttr.count; i++) {
        tv.fromBufferAttribute(posAttr, i).applyMatrix4(part.matrix);
        mergedPositions.push(tv.x, tv.y, tv.z);
        tn.fromBufferAttribute(normAttr, i).applyMatrix3(nm).normalize();
        mergedNormals.push(tn.x, tn.y, tn.z);
      }
      for (let i = 0; i < idxAttr.count; i++) {
        mergedIndices.push(idxAttr.getX(i) + vertexOffset);
      }
      vertexOffset += posAttr.count;
      part.geo.dispose();
    }

    const mergedGeo = new THREE.BufferGeometry();
    mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3));
    mergedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3));
    mergedGeo.setIndex(mergedIndices);

    // Eye glow: use emissive on the whole body (subtle red tint on black = only eyes visible)
    this.bodyMesh = new THREE.Mesh(mergedGeo, mat);
    this.group.add(this.bodyMesh);

    // Add red eye glow as a single merged mesh (1 more draw call)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const eyeMergedPos: number[] = [];
    const eyeMergedNorm: number[] = [];
    const eyeMergedIdx: number[] = [];
    let eyeVOffset = 0;
    const eyeGeo2 = new THREE.SphereGeometry(0.025, 3, 2);
    const ePosAttr = eyeGeo2.getAttribute('position') as THREE.BufferAttribute;
    const eNormAttr = eyeGeo2.getAttribute('normal') as THREE.BufferAttribute;
    const eIdxAttr = eyeGeo2.getIndex()!;

    for (const [ex, ey, ez] of eyePositions) {
      const m = new THREE.Matrix4().makeTranslation(ex, ey, ez);
      const nm2 = new THREE.Matrix3().getNormalMatrix(m);
      for (let i = 0; i < ePosAttr.count; i++) {
        tv.fromBufferAttribute(ePosAttr, i).applyMatrix4(m);
        eyeMergedPos.push(tv.x, tv.y, tv.z);
        tn.fromBufferAttribute(eNormAttr, i).applyMatrix3(nm2).normalize();
        eyeMergedNorm.push(tn.x, tn.y, tn.z);
      }
      for (let i = 0; i < eIdxAttr.count; i++) {
        eyeMergedIdx.push(eIdxAttr.getX(i) + eyeVOffset);
      }
      eyeVOffset += ePosAttr.count;
    }
    eyeGeo2.dispose();

    const eyeMergedGeo = new THREE.BufferGeometry();
    eyeMergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(eyeMergedPos, 3));
    eyeMergedGeo.setAttribute('normal', new THREE.Float32BufferAttribute(eyeMergedNorm, 3));
    eyeMergedGeo.setIndex(eyeMergedIdx);
    const eyesMesh = new THREE.Mesh(eyeMergedGeo, eyeMat);
    this.group.add(eyesMesh);

    // ── 8 Legs — each is a pivot Object3D with a single merged leg mesh ──
    const legMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const upperGeo = new THREE.CylinderGeometry(0.018, 0.012, 0.55, 3);
    const lowerGeo = new THREE.CylinderGeometry(0.012, 0.008, 0.45, 3);

    // Merge upper+lower into one geo for each leg (so 8 draw calls for legs)
    // Actually merge ALL legs static shape into one geo, animate via pivots
    // Since legs need individual animation, keep them as 8 simple pivots with 1 mesh each
    // But merge upper+lower per leg = 8 meshes instead of 16

    const uPosAttr = upperGeo.getAttribute('position') as THREE.BufferAttribute;
    const uNormAttr = upperGeo.getAttribute('normal') as THREE.BufferAttribute;
    const uIdxAttr = upperGeo.getIndex()!;
    const lPosAttr = lowerGeo.getAttribute('position') as THREE.BufferAttribute;
    const lNormAttr = lowerGeo.getAttribute('normal') as THREE.BufferAttribute;
    const lIdxAttr = lowerGeo.getIndex()!;

    this.legPivots = [];

    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const idx = i % 4;
      const zOff = -0.3 + idx * 0.18;

      // Merge upper + lower leg into one geometry
      const legPositions: number[] = [];
      const legNormals: number[] = [];
      const legIndices: number[] = [];
      let lOffset = 0;

      // Upper segment (identity — positioned at pivot origin)
      for (let j = 0; j < uPosAttr.count; j++) {
        legPositions.push(uPosAttr.getX(j), uPosAttr.getY(j), uPosAttr.getZ(j));
        legNormals.push(uNormAttr.getX(j), uNormAttr.getY(j), uNormAttr.getZ(j));
      }
      for (let j = 0; j < uIdxAttr.count; j++) legIndices.push(uIdxAttr.getX(j));
      lOffset = uPosAttr.count;

      // Lower segment — offset downward and rotated
      const lowerM = new THREE.Matrix4().compose(
        new THREE.Vector3(0, -0.32, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * 0.9)),
        new THREE.Vector3(1, 1, 1)
      );
      const lNM = new THREE.Matrix3().getNormalMatrix(lowerM);
      for (let j = 0; j < lPosAttr.count; j++) {
        tv.fromBufferAttribute(lPosAttr, j).applyMatrix4(lowerM);
        legPositions.push(tv.x, tv.y, tv.z);
        tn.fromBufferAttribute(lNormAttr, j).applyMatrix3(lNM).normalize();
        legNormals.push(tn.x, tn.y, tn.z);
      }
      for (let j = 0; j < lIdxAttr.count; j++) legIndices.push(lIdxAttr.getX(j) + lOffset);

      const legGeo = new THREE.BufferGeometry();
      legGeo.setAttribute('position', new THREE.Float32BufferAttribute(legPositions, 3));
      legGeo.setAttribute('normal', new THREE.Float32BufferAttribute(legNormals, 3));
      legGeo.setIndex(legIndices);

      const legMesh = new THREE.Mesh(legGeo, legMat);

      // Pivot for animation
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.2, 0.15, zOff);
      pivot.rotation.z = side * -0.7;
      pivot.rotation.y = (idx - 1.5) * 0.15 * side;
      pivot.add(legMesh);
      this.group.add(pivot);
      this.legPivots.push(pivot);
    }

    upperGeo.dispose();
    lowerGeo.dispose();

    this.group.scale.set(1.3, 1.3, 1.3);
    this.scene.add(this.group);
  }

  private spawnAtRandomCell() {
    const { width, height, startX, startZ } = this.maze;
    const minDist = Math.floor(Math.max(width, height) * 0.4);
    const candidates: { x: number; z: number }[] = [];
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        if (Math.abs(x - startX) + Math.abs(z - startZ) >= minDist) {
          candidates.push({ x, z });
        }
      }
    }
    const pick = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : { x: width - 1, z: height - 1 };

    this.pos.set(
      pick.x * this.cellSize + this.cellSize / 2,
      SPIDER_Y,
      pick.z * this.cellSize + this.cellSize / 2
    );
    this.group.position.copy(this.pos);
  }

  private pickPatrolTarget() {
    const cx = Math.floor(this.pos.x / this.cellSize);
    const cz = Math.floor(this.pos.z / this.cellSize);
    const cell = this.maze.grid[cz]?.[cx];
    if (!cell) { this.hasTarget = false; return; }

    const options: { x: number; z: number }[] = [];
    const wallMap: Record<string, boolean> = cell.walls as any;
    for (const d of DIRS) {
      if (!wallMap[d.dir]) {
        const nx = cx + d.dx;
        const nz = cz + d.dz;
        if (nx >= 0 && nx < this.maze.width && nz >= 0 && nz < this.maze.height) {
          options.push({ x: nx, z: nz });
        }
      }
    }
    if (options.length > 0) {
      const pick = options[Math.floor(Math.random() * options.length)];
      this.targetPos.set(pick.x * this.cellSize + this.cellSize / 2, SPIDER_Y, pick.z * this.cellSize + this.cellSize / 2);
      this.hasTarget = true;
    } else {
      this.hasTarget = false;
    }
  }

  private pickChaseTarget(playerX: number, playerZ: number) {
    const cx = Math.floor(this.pos.x / this.cellSize);
    const cz = Math.floor(this.pos.z / this.cellSize);
    const cell = this.maze.grid[cz]?.[cx];
    if (!cell) { this.hasTarget = false; return; }

    const wallMap: Record<string, boolean> = cell.walls as any;
    let bestDist = Infinity;
    let bestX = this.pos.x;
    let bestZ = this.pos.z;

    for (const d of DIRS) {
      if (!wallMap[d.dir]) {
        const nx = cx + d.dx;
        const nz = cz + d.dz;
        if (nx >= 0 && nx < this.maze.width && nz >= 0 && nz < this.maze.height) {
          const wx = nx * this.cellSize + this.cellSize / 2;
          const wz = nz * this.cellSize + this.cellSize / 2;
          const dist = (wx - playerX) ** 2 + (wz - playerZ) ** 2;
          if (dist < bestDist) { bestDist = dist; bestX = wx; bestZ = wz; }
        }
      }
    }
    this.targetPos.set(bestX, SPIDER_Y, bestZ);
    this.hasTarget = true;
  }

  private isPlayerLooking(playerX: number, playerZ: number, playerYaw: number): boolean {
    const dx = this.pos.x - playerX;
    const dz = this.pos.z - playerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > DETECT_RANGE || dist < 0.5) return false;
    const fwdX = -Math.sin(playerYaw);
    const fwdZ = -Math.cos(playerYaw);
    const dot = fwdX * (dx / dist) + fwdZ * (dz / dist);
    return dot > DETECT_FOV;
  }

  private hasLineOfSight(playerX: number, playerZ: number): boolean {
    const sx = this.pos.x, sz = this.pos.z;
    const dx = playerX - sx, dz = playerZ - sz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return true;
    const steps = Math.ceil(dist / (this.cellSize * 0.4));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = sx + dx * t, pz = sz + dz * t;
      const cellX = Math.floor(px / this.cellSize);
      const cellZ = Math.floor(pz / this.cellSize);
      if (cellX < 0 || cellX >= this.maze.width || cellZ < 0 || cellZ >= this.maze.height) return false;
      const localX = (px / this.cellSize) - cellX;
      const localZ = (pz / this.cellSize) - cellZ;
      const cell = this.maze.grid[cellZ][cellX];
      const wt = 0.08;
      if (localX < wt && cell.walls.west) return false;
      if (localX > 1 - wt && cell.walls.east) return false;
      if (localZ < wt && cell.walls.north) return false;
      if (localZ > 1 - wt && cell.walls.south) return false;
    }
    return true;
  }

  update(dt: number, playerX: number, playerZ: number, playerYaw: number): boolean {
    this.elapsed += dt;
    const dx = this.pos.x - playerX;
    const dz = this.pos.z - playerZ;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);

    if (distToPlayer < CATCH_DIST) return true;

    // State transitions
    if (this.state === 'patrol') {
      if (this.isPlayerLooking(playerX, playerZ, playerYaw) && this.hasLineOfSight(playerX, playerZ)) {
        this.state = 'chase';
        this.pickChaseTarget(playerX, playerZ);
      }
    } else if (this.state === 'chase') {
      if (distToPlayer > LOSE_CHASE_DIST) {
        this.state = 'patrol';
        this.pickPatrolTarget();
      }
    }

    // Movement
    const speed = this.state === 'chase' ? SPIDER_SPEED_CHASE : SPIDER_SPEED_PATROL;
    if (this.hasTarget) {
      const tdx = this.targetPos.x - this.pos.x;
      const tdz = this.targetPos.z - this.pos.z;
      const tDist = Math.sqrt(tdx * tdx + tdz * tdz);
      if (tDist < 0.2) {
        this.pos.x = this.targetPos.x;
        this.pos.z = this.targetPos.z;
        if (this.state === 'chase') this.pickChaseTarget(playerX, playerZ);
        else this.pickPatrolTarget();
      } else {
        this.pos.x += (tdx / tDist) * speed * dt;
        this.pos.z += (tdz / tDist) * speed * dt;
        this.group.rotation.y = Math.atan2(tdx, tdz);
      }
    } else {
      if (this.state === 'chase') this.pickChaseTarget(playerX, playerZ);
      else this.pickPatrolTarget();
    }

    // Update mesh
    this.group.position.set(this.pos.x, SPIDER_Y + Math.sin(this.legTime * 0.5) * 0.03, this.pos.z);

    // Leg animation
    this.legTime += dt * LEG_ANIM_SPEED * (this.state === 'chase' ? 1.8 : 1);
    for (let i = 0; i < this.legPivots.length; i++) {
      const phase = (i % 4) * Math.PI * 0.5 + (i < 4 ? 0 : Math.PI);
      this.legPivots[i].rotation.x = Math.sin(this.legTime + phase) * 0.3;
    }

    // Sounds
    if (this.elapsed >= this.nextSoundTime) {
      this.playCreepySound(distToPlayer);
      this.nextSoundTime = this.elapsed + SOUND_INTERVAL_MIN + Math.random() * (SOUND_INTERVAL_MAX - SOUND_INTERVAL_MIN);
    }

    return false;
  }

  // ── Audio ──
  private ensureAudio() {
    if (!this.audioCtx) {
      try {
        this.audioCtx = new AudioContext();
        this.audioGain = this.audioCtx.createGain();
        this.audioGain.gain.value = 1.0;
        this.audioGain.connect(this.audioCtx.destination);
      } catch { return; }
    }
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  }

  private playCreepySound(distToPlayer: number) {
    this.ensureAudio();
    if (!this.audioCtx || !this.audioGain) return;
    const rawVol = Math.max(0, 1 - distToPlayer / SOUND_MAX_DIST);
    const volume = rawVol * rawVol;
    if (volume <= 0.01) return;

    const now = this.audioCtx.currentTime;
    const type = Math.floor(Math.random() * 5);
    const ctx = this.audioCtx;
    const master = this.audioGain!;

    try {
      switch (type) {
        case 0: {
          const clickCount = 10 + Math.floor(Math.random() * 12);
          for (let i = 0; i < clickCount; i++) {
            const t = now + i * (0.03 + Math.random() * 0.05);
            const osc = ctx.createOscillator(); osc.type = 'square';
            osc.frequency.setValueAtTime(600 + Math.random() * 3000, t);
            const g = ctx.createGain();
            g.gain.setValueAtTime(volume * 0.6, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + 0.05);
          }
          const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 40;
          const sg = ctx.createGain(); sg.gain.setValueAtTime(volume * 0.5, now);
          sg.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
          sub.connect(sg); sg.connect(master); sub.start(now); sub.stop(now + 0.6);
          break;
        }
        case 1: {
          const dur = 1.5 + Math.random();
          const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
          const data = buf.getChannelData(0);
          let prev = 0;
          for (let i = 0; i < data.length; i++) {
            prev = (prev + (Math.random() * 2 - 1) * 0.15) * 0.96;
            data[i] = prev * (1 + 0.5 * Math.sin(i / ctx.sampleRate * Math.PI * 6));
          }
          const src = ctx.createBufferSource(); src.buffer = buf;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 250 + Math.random() * 150; f.Q.value = 4;
          const bb = ctx.createBiquadFilter(); bb.type = 'peaking'; bb.frequency.value = 80; bb.gain.value = 12; bb.Q.value = 1;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.001, now);
          g.gain.exponentialRampToValueAtTime(volume * 0.9, now + 0.3);
          g.gain.setValueAtTime(volume * 0.9, now + dur * 0.6);
          g.gain.exponentialRampToValueAtTime(0.001, now + dur);
          src.connect(f); f.connect(bb); bb.connect(g); g.connect(master);
          src.start(now); src.stop(now + dur);
          break;
        }
        case 2: {
          const dur = 0.8 + Math.random() * 0.5;
          const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
          o1.frequency.setValueAtTime(300, now);
          o1.frequency.exponentialRampToValueAtTime(3500 + Math.random() * 1500, now + 0.1);
          o1.frequency.exponentialRampToValueAtTime(150, now + dur);
          const o2 = ctx.createOscillator(); o2.type = 'sawtooth';
          o2.frequency.setValueAtTime(310, now);
          o2.frequency.exponentialRampToValueAtTime(3600 + Math.random() * 1500, now + 0.12);
          o2.frequency.exponentialRampToValueAtTime(140, now + dur);
          const g = ctx.createGain(); g.gain.setValueAtTime(volume * 0.7, now);
          g.gain.setValueAtTime(volume * 0.7, now + dur * 0.3);
          g.gain.exponentialRampToValueAtTime(0.001, now + dur);
          const sh = ctx.createWaveShaper();
          const c = new Float32Array(256);
          for (let i = 0; i < 256; i++) c[i] = Math.tanh(((i / 128) - 1) * 3);
          sh.curve = c;
          o1.connect(sh); o2.connect(sh); sh.connect(g); g.connect(master);
          o1.start(now); o1.stop(now + dur); o2.start(now); o2.stop(now + dur);
          break;
        }
        case 3: {
          const cnt = 15 + Math.floor(Math.random() * 15);
          const td = cnt * 0.04;
          for (let i = 0; i < cnt; i++) {
            const t = now + i * (0.025 + Math.random() * 0.035);
            const bl = Math.floor(ctx.sampleRate * 0.04);
            const buf = ctx.createBuffer(1, bl, ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let j = 0; j < bl; j++) d[j] = (Math.random() * 2 - 1) * (1 - j / bl);
            const src = ctx.createBufferSource(); src.buffer = buf;
            const g = ctx.createGain(); g.gain.setValueAtTime(volume * 0.45, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
            const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 200 + Math.random() * 600; f.Q.value = 3;
            src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + 0.04);
          }
          const r = ctx.createOscillator(); r.type = 'sine'; r.frequency.value = 35 + Math.random() * 20;
          const rg = ctx.createGain(); rg.gain.setValueAtTime(volume * 0.4, now);
          rg.gain.exponentialRampToValueAtTime(0.001, now + td + 0.2);
          r.connect(rg); rg.connect(master); r.start(now); r.stop(now + td + 0.2);
          break;
        }
        case 4: {
          const dur = 2 + Math.random();
          const bl = Math.floor(ctx.sampleRate * dur);
          const buf = ctx.createBuffer(1, bl, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < bl; i++) {
            const t = i / ctx.sampleRate;
            const bm = Math.sin(t * Math.PI * 2 * (1.5 + Math.random() * 0.5));
            data[i] = (Math.random() * 2 - 1) * 0.8 * (0.3 + 0.7 * Math.abs(bm)) * Math.sin(t / dur * Math.PI);
          }
          const src = ctx.createBufferSource(); src.buffer = buf;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400 + Math.random() * 300; f.Q.value = 6;
          const f2 = ctx.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 100; f2.gain.value = 8;
          const g = ctx.createGain(); g.gain.value = volume * 0.8;
          src.connect(f); f.connect(f2); f2.connect(g); g.connect(master);
          src.start(now); src.stop(now + dur);
          break;
        }
      }
    } catch { /* ignore */ }
  }

  // ── Getters for spider-vision camera ──
  getPosition(): { x: number; y: number; z: number } {
    // Place camera in front of spider's head, offset along facing direction
    const yaw = this.group.rotation.y;
    const ahead = 1.0; // distance in front of spider center
    return {
      x: this.pos.x + Math.sin(yaw) * ahead,
      y: SPIDER_Y + 0.2,
      z: this.pos.z + Math.cos(yaw) * ahead,
    };
  }

  getFacingYaw(): number {
    return this.group.rotation.y;
  }

  isChasing(): boolean {
    return this.state === 'chase';
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach(x => x.dispose());
        else m?.dispose();
      }
    });
    if (this.audioCtx) { this.audioCtx.close().catch(() => {}); this.audioCtx = null; }
  }
}
