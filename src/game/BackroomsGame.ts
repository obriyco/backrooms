import * as THREE from 'three';
import { generateMaze, getWallSegments, type MazeData } from './mazeGenerator';
import { createWallTexture, createFloorTexture, createCeilingTexture } from './textures';
import { BackroomsAudio } from './audio';
import { buildFurniture } from './furniture';
import { buildWallWritings, type WallInterestPoint } from './wallWritings';
import { CeilingTileSystem } from './ceilingTiles';
import { SpiderMonster } from './spider';

const CELL_SIZE = 4;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.15;
const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.6;
const MOVE_SPEED = 4.0;
const SPRINT_SPEED = 7.0;
const MOUSE_SENSITIVITY = 0.002;
const MAZE_BASE_SIZE = 10;
const FOG_NEAR = 1;
const FOG_FAR = 12;

export type GameState = 'menu' | 'playing' | 'won' | 'caught';

// ── Spatial grid for O(1) collision lookups instead of O(n) ──
interface CollisionRect {
  minX: number; minZ: number;
  maxX: number; maxZ: number;
}

class SpatialGrid {
  private cellSize: number;
  private grid: Map<string, CollisionRect[]> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number) { return `${cx},${cz}`; }

  clear() { this.grid.clear(); }

  insert(rect: CollisionRect) {
    const x0 = Math.floor(rect.minX / this.cellSize);
    const x1 = Math.floor(rect.maxX / this.cellSize);
    const z0 = Math.floor(rect.minZ / this.cellSize);
    const z1 = Math.floor(rect.maxZ / this.cellSize);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const k = this.key(x, z);
        let arr = this.grid.get(k);
        if (!arr) { arr = []; this.grid.set(k, arr); }
        arr.push(rect);
      }
    }
  }

  query(minX: number, minZ: number, maxX: number, maxZ: number): CollisionRect[] {
    const result: CollisionRect[] = [];
    const seen = new Set<CollisionRect>();
    const x0 = Math.floor(minX / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const z0 = Math.floor(minZ / this.cellSize);
    const z1 = Math.floor(maxZ / this.cellSize);
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const arr = this.grid.get(this.key(x, z));
        if (arr) {
          for (const r of arr) {
            if (!seen.has(r)) { seen.add(r); result.push(r); }
          }
        }
      }
    }
    return result;
  }
}

export class BackroomsGame {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private maze!: MazeData;
  // Pre-allocated vectors to avoid GC pressure
  private playerPos = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _moveDir = new THREE.Vector3();
  private _euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private yaw = 0;
  private pitch = 0;
  private keys: Record<string, boolean> = {};
  private isPointerLocked = false;
  private animationId = 0;
  private lastTime = 0;
  private spatialGrid!: SpatialGrid;
  private exitPos = new THREE.Vector3();
  private exitLight!: THREE.PointLight;
  private exitMarker!: THREE.Mesh;
  private onStateChange: (state: GameState) => void;
  private gameState: GameState = 'menu';
  private headBob = 0;
  private flashlightOn = true;
  private flashlight!: THREE.Light;
  private disposed = false;
  private audio: BackroomsAudio;
  private footstepTimer = 0;
  private level = 1;
  private ceilingTiles!: CeilingTileSystem;
  private spider!: SpiderMonster;
  // Cached shared materials/geometries
  private wallTexture!: THREE.CanvasTexture;
  private floorTexture!: THREE.CanvasTexture;
  private ceilingTexture!: THREE.CanvasTexture;
  // FPS counter for adaptive quality
  private fpsHistory: number[] = [];
  private resScale = 0.6; // Start lower for weak GPUs
  private cameraTremorTime = 0;
  // AI autopilot
  private aiMode = false;
  private aiPath: { x: number; z: number }[] = [];
  private aiPathIndex = 0;
  private aiRecalcTimer = 0;
  private aiInterestPoints: WallInterestPoint[] = [];
  private aiInspectTimer = 0;
  private aiInspectTarget: WallInterestPoint | null = null;
  private aiSeenInterest = new Set<number>();

  constructor(container: HTMLElement, onStateChange: (state: GameState) => void) {
    this.onStateChange = onStateChange;

    // Renderer — low-cost settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'low-power',
      stencil: false,
      depth: true,
    });
    // Start at pixelRatio 1 for performance; adaptive quality may increase
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(
      Math.floor(window.innerWidth * this.resScale),
      Math.floor(window.innerHeight * this.resScale)
    );
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    // Sorting disabled — we have no transparent overlap issues worth sorting
    this.renderer.sortObjects = false;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1408);
    this.scene.fog = new THREE.Fog(0x1a1408, FOG_NEAR, FOG_FAR);

    // Camera — far plane matches fog so GPU clips early
    this.camera = new THREE.PerspectiveCamera(
      75, window.innerWidth / window.innerHeight, 0.1, FOG_FAR + 2
    );

    // Audio
    this.audio = new BackroomsAudio();

    // Create shared textures once
    this.wallTexture = createWallTexture();
    this.floorTexture = createFloorTexture();
    this.ceilingTexture = createCeilingTexture();

    // Events
    window.addEventListener('resize', this.onResize);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('click', this.onClick);

    this.init();
  }

  private init() {
    this.buildMaze();
    this.setupLighting();
    this.setupPlayer();
    this.ceilingTiles = new CeilingTileSystem(this.scene, WALL_HEIGHT, () => this.audio.playCrash());
    this.spider = new SpiderMonster(this.scene, this.maze, CELL_SIZE);
    this.lastTime = performance.now();
    this.animate();
  }

  private getMazeSize() {
    // Maze grows with level: 10→12→14→16→18, capped at 20
    const size = Math.min(20, MAZE_BASE_SIZE + (this.level - 1) * 2);
    return size;
  }

  private buildMaze() {
    const mazeSize = this.getMazeSize();
    this.maze = generateMaze(mazeSize, mazeSize);
    const segments = getWallSegments(this.maze, CELL_SIZE);
    this.spatialGrid = new SpatialGrid(CELL_SIZE);

    const totalW = mazeSize * CELL_SIZE;
    const totalH = mazeSize * CELL_SIZE;

    // ── Floor (1 draw call) ──
    const floorTex = this.floorTexture.clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(mazeSize * 2, mazeSize * 2);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.minFilter = THREE.LinearFilter;
    floorTex.generateMipmaps = false;

    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(totalW, totalH), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(totalW / 2, 0, totalH / 2);
    floor.matrixAutoUpdate = false;
    floor.updateMatrix();
    this.scene.add(floor);

    // ── Ceiling (1 draw call) ──
    const ceilTex = this.ceilingTexture.clone();
    ceilTex.needsUpdate = true;
    ceilTex.repeat.set(mazeSize * 2, mazeSize * 2);
    ceilTex.wrapS = THREE.RepeatWrapping;
    ceilTex.wrapT = THREE.RepeatWrapping;
    ceilTex.minFilter = THREE.LinearFilter;
    ceilTex.generateMipmaps = false;

    const ceilMat = new THREE.MeshLambertMaterial({ map: ceilTex });
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(totalW, totalH), ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(totalW / 2, WALL_HEIGHT, totalH / 2);
    ceiling.matrixAutoUpdate = false;
    ceiling.updateMatrix();
    this.scene.add(ceiling);

    // ── Walls: merge ALL into 2 merged geometries (horizontal + vertical) ──
    // This is the KEY optimization: from ~500 draw calls down to 2.
    const wallMat = new THREE.MeshLambertMaterial({ map: this.wallTexture, color: 0xc4a84a });

    const hSegments = segments.filter(s => s.z1 === s.z2); // horizontal
    const vSegments = segments.filter(s => s.x1 === s.x2); // vertical

    const buildMerged = (segs: typeof segments, isVertical: boolean) => {
      if (segs.length === 0) return;
      const matrices: THREE.Matrix4[] = [];
      const baseGeo = new THREE.BoxGeometry(1, WALL_HEIGHT, WALL_THICKNESS);

      const _scale = new THREE.Vector3();
      const _pos = new THREE.Vector3();
      const _quat = new THREE.Quaternion();
      const _rotY90 = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), Math.PI / 2
      );

      for (const seg of segs) {
        const dx = seg.x2 - seg.x1;
        const dz = seg.z2 - seg.z1;
        const length = Math.sqrt(dx * dx + dz * dz);
        const cx = (seg.x1 + seg.x2) / 2;
        const cz = (seg.z1 + seg.z2) / 2;

        _pos.set(cx, WALL_HEIGHT / 2, cz);
        _scale.set(length, 1, 1);
        if (isVertical) {
          _quat.copy(_rotY90);
        } else {
          _quat.identity();
        }

        const mat4 = new THREE.Matrix4();
        mat4.compose(_pos, _quat, _scale);
        matrices.push(mat4);

        // Collision rect
        const halfLen = length / 2;
        const halfThick = WALL_THICKNESS / 2 + 0.05;
        if (!isVertical) {
          this.spatialGrid.insert({
            minX: cx - halfLen, minZ: cz - halfThick,
            maxX: cx + halfLen, maxZ: cz + halfThick,
          });
        } else {
          this.spatialGrid.insert({
            minX: cx - halfThick, minZ: cz - halfLen,
            maxX: cx + halfThick, maxZ: cz + halfLen,
          });
        }
      }

      // Merge geometries
      const merged = new THREE.BufferGeometry();
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const indices: number[] = [];
      let indexOffset = 0;

      const posAttr = baseGeo.getAttribute('position') as THREE.BufferAttribute;
      const normAttr = baseGeo.getAttribute('normal') as THREE.BufferAttribute;
      const uvAttr = baseGeo.getAttribute('uv') as THREE.BufferAttribute;
      const idxAttr = baseGeo.getIndex()!;

      const tempVec = new THREE.Vector3();
      const tempNorm = new THREE.Vector3();
      const normalMat = new THREE.Matrix3();

      for (const mat4 of matrices) {
        normalMat.getNormalMatrix(mat4);
        for (let i = 0; i < posAttr.count; i++) {
          tempVec.fromBufferAttribute(posAttr, i).applyMatrix4(mat4);
          positions.push(tempVec.x, tempVec.y, tempVec.z);
          tempNorm.fromBufferAttribute(normAttr, i).applyMatrix3(normalMat).normalize();
          normals.push(tempNorm.x, tempNorm.y, tempNorm.z);
          uvs.push(uvAttr.getX(i), uvAttr.getY(i));
        }
        for (let i = 0; i < idxAttr.count; i++) {
          indices.push(idxAttr.getX(i) + indexOffset);
        }
        indexOffset += posAttr.count;
      }

      merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      merged.setIndex(indices);

      const mesh = new THREE.Mesh(merged, wallMat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = false; // Already fogged, and it's one big mesh
      this.scene.add(mesh);

      baseGeo.dispose();
    };

    buildMerged(hSegments, false);
    buildMerged(vSegments, true);

    // ── Exit marker ──
    const exitCX = this.maze.exitX * CELL_SIZE + CELL_SIZE / 2;
    const exitCZ = this.maze.exitZ * CELL_SIZE + CELL_SIZE / 2;
    this.exitPos.set(exitCX, 0, exitCZ);

    // Exit disc (low poly)
    const exitGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 8);
    const exitMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.exitMarker = new THREE.Mesh(exitGeo, exitMat);
    this.exitMarker.position.set(exitCX, 0.05, exitCZ);
    this.scene.add(this.exitMarker);

    // Pillar (low poly)
    const pillarGeo = new THREE.CylinderGeometry(0.1, 0.5, WALL_HEIGHT, 6);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.12,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.set(exitCX, WALL_HEIGHT / 2, exitCZ);
    pillar.matrixAutoUpdate = false;
    pillar.updateMatrix();
    this.scene.add(pillar);

    // EXIT sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 128;
    signCanvas.height = 44;
    const signCtx = signCanvas.getContext('2d')!;
    signCtx.fillStyle = '#003311';
    signCtx.fillRect(0, 0, 128, 44);
    signCtx.strokeStyle = '#00ff88';
    signCtx.lineWidth = 2;
    signCtx.strokeRect(2, 2, 124, 40);
    signCtx.fillStyle = '#00ff88';
    signCtx.font = 'bold 28px monospace';
    signCtx.textAlign = 'center';
    signCtx.textBaseline = 'middle';
    signCtx.fillText('EXIT', 64, 22);
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.minFilter = THREE.LinearFilter;
    signTex.generateMipmaps = false;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.5),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    sign.position.set(exitCX, WALL_HEIGHT - 0.4, exitCZ - 1.5);
    sign.matrixAutoUpdate = false;
    sign.updateMatrix();
    this.scene.add(sign);

    this.exitLight = new THREE.PointLight(0x00ff88, 4, 10);
    this.exitLight.position.set(exitCX, 2, exitCZ);
    this.scene.add(this.exitLight);

    // ── Ceiling pipes merged into one mesh (1 draw call) ──
    const pipeMat = new THREE.MeshLambertMaterial({ color: 0x666655 });
    const pipeBaseGeo = new THREE.CylinderGeometry(0.04, 0.04, 1, 4); // 4 sides = cheap
    const pipePositions: number[] = [];
    const pipeNormals: number[] = [];
    const pipeUvs: number[] = [];
    const pipeIndices: number[] = [];
    let pipeOffset = 0;

    const pPosAttr = pipeBaseGeo.getAttribute('position') as THREE.BufferAttribute;
    const pNormAttr = pipeBaseGeo.getAttribute('normal') as THREE.BufferAttribute;
    const pUvAttr = pipeBaseGeo.getAttribute('uv') as THREE.BufferAttribute;
    const pIdxAttr = pipeBaseGeo.getIndex()!;
    const pTempV = new THREE.Vector3();
    const pTempN = new THREE.Vector3();
    const pNM = new THREE.Matrix3();

    for (let i = 0; i < 6; i++) {
      const px = Math.random() * totalW;
      const pz = Math.random() * totalH;
      const pipeLen = 2 + Math.random() * 5;
      const m4 = new THREE.Matrix4();
      if (Math.random() > 0.5) {
        m4.makeRotationZ(Math.PI / 2);
      } else {
        m4.makeRotationX(Math.PI / 2);
      }
      m4.setPosition(px, WALL_HEIGHT - 0.15, pz);
      m4.scale(new THREE.Vector3(1, pipeLen, 1));
      pNM.getNormalMatrix(m4);
      for (let j = 0; j < pPosAttr.count; j++) {
        pTempV.fromBufferAttribute(pPosAttr, j).applyMatrix4(m4);
        pipePositions.push(pTempV.x, pTempV.y, pTempV.z);
        pTempN.fromBufferAttribute(pNormAttr, j).applyMatrix3(pNM).normalize();
        pipeNormals.push(pTempN.x, pTempN.y, pTempN.z);
        pipeUvs.push(pUvAttr.getX(j), pUvAttr.getY(j));
      }
      for (let j = 0; j < pIdxAttr.count; j++) {
        pipeIndices.push(pIdxAttr.getX(j) + pipeOffset);
      }
      pipeOffset += pPosAttr.count;
    }

    if (pipePositions.length > 0) {
      const pipeMerged = new THREE.BufferGeometry();
      pipeMerged.setAttribute('position', new THREE.Float32BufferAttribute(pipePositions, 3));
      pipeMerged.setAttribute('normal', new THREE.Float32BufferAttribute(pipeNormals, 3));
      pipeMerged.setAttribute('uv', new THREE.Float32BufferAttribute(pipeUvs, 2));
      pipeMerged.setIndex(pipeIndices);
      const pipesMesh = new THREE.Mesh(pipeMerged, pipeMat);
      pipesMesh.matrixAutoUpdate = false;
      pipesMesh.updateMatrix();
      pipesMesh.frustumCulled = false;
      this.scene.add(pipesMesh);
    }
    pipeBaseGeo.dispose();

    // Stains merged into one mesh
    const stainMat = new THREE.MeshLambertMaterial({
      color: 0x3a2a1a, transparent: true, opacity: 0.3,
    });
    const stainBaseGeo = new THREE.CircleGeometry(1, 6);
    const sPositions: number[] = [];
    const sNormals: number[] = [];
    const sUvs: number[] = [];
    const sIndices: number[] = [];
    let sOffset = 0;

    const sPosAttr = stainBaseGeo.getAttribute('position') as THREE.BufferAttribute;
    const sNormAttr = stainBaseGeo.getAttribute('normal') as THREE.BufferAttribute;
    const sUvAttr = stainBaseGeo.getAttribute('uv') as THREE.BufferAttribute;
    const sIdxAttr = stainBaseGeo.getIndex()!;

    for (let i = 0; i < 5; i++) {
      const sx = Math.random() * totalW;
      const sz = Math.random() * totalH;
      const sSize = 0.3 + Math.random() * 0.8;
      const m4 = new THREE.Matrix4();
      m4.makeRotationX(-Math.PI / 2);
      m4.setPosition(sx, 0.01, sz);
      m4.scale(new THREE.Vector3(sSize, sSize, 1));
      const nm = new THREE.Matrix3();
      nm.getNormalMatrix(m4);
      for (let j = 0; j < sPosAttr.count; j++) {
        pTempV.fromBufferAttribute(sPosAttr, j).applyMatrix4(m4);
        sPositions.push(pTempV.x, pTempV.y, pTempV.z);
        pTempN.fromBufferAttribute(sNormAttr, j).applyMatrix3(nm).normalize();
        sNormals.push(pTempN.x, pTempN.y, pTempN.z);
        sUvs.push(sUvAttr.getX(j), sUvAttr.getY(j));
      }
      for (let j = 0; j < sIdxAttr.count; j++) {
        sIndices.push(sIdxAttr.getX(j) + sOffset);
      }
      sOffset += sPosAttr.count;
    }
    if (sPositions.length > 0) {
      const stainMerged = new THREE.BufferGeometry();
      stainMerged.setAttribute('position', new THREE.Float32BufferAttribute(sPositions, 3));
      stainMerged.setAttribute('normal', new THREE.Float32BufferAttribute(sNormals, 3));
      stainMerged.setAttribute('uv', new THREE.Float32BufferAttribute(sUvs, 2));
      stainMerged.setIndex(sIndices);
      const stainsMesh = new THREE.Mesh(stainMerged, stainMat);
      stainsMesh.matrixAutoUpdate = false;
      stainsMesh.updateMatrix();
      stainsMesh.frustumCulled = false;
      this.scene.add(stainsMesh);
    }
    stainBaseGeo.dispose();

    // ── Furniture: potted plants in corners, chairs along walls ──
    buildFurniture(this.maze, CELL_SIZE, this.scene);

    // ── Creepy wall writings ──
    this.aiInterestPoints = buildWallWritings(this.maze, CELL_SIZE, this.scene);
  }

  private setupLighting() {
    // Ambient provides base — cheap
    const ambient = new THREE.AmbientLight(0xc4a84a, 0.25);
    this.scene.add(ambient);

    // Single hemisphere light instead of 25 point lights — MASSIVE perf win
    const hemi = new THREE.HemisphereLight(0xffe4a0, 0x6a5a3a, 0.4);
    this.scene.add(hemi);

    // Single point light — cheapest acceptable setup with fog
    const ms = this.maze.width;
    const lightPositions = [
      [Math.floor(ms * 0.5), Math.floor(ms * 0.5)],
    ];
    for (const [gx, gz] of lightPositions) {
      const lx = gx * CELL_SIZE + CELL_SIZE / 2;
      const lz = gz * CELL_SIZE + CELL_SIZE / 2;
      const light = new THREE.PointLight(0xffe4a0, 0.65, 14, 1.5);
      light.position.set(lx, WALL_HEIGHT - 0.1, lz);
      this.scene.add(light);
    }

    // Light fixture meshes — merged into one draw call
    const fixtureMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
    const fixtureBaseGeo = new THREE.BoxGeometry(1.4, 0.06, 0.25);
    const fPositions: number[] = [];
    const fNormals: number[] = [];
    const fUvs: number[] = [];
    const fIndices: number[] = [];
    let fOffset = 0;
    const fPosAttr = fixtureBaseGeo.getAttribute('position') as THREE.BufferAttribute;
    const fNormAttr = fixtureBaseGeo.getAttribute('normal') as THREE.BufferAttribute;
    const fUvAttr = fixtureBaseGeo.getAttribute('uv') as THREE.BufferAttribute;
    const fIdxAttr = fixtureBaseGeo.getIndex()!;
    const tv = new THREE.Vector3();
    const tn = new THREE.Vector3();

    const mSize = this.maze.width;
    for (let z = 2; z < mSize; z += 4) {
      for (let x = 2; x < mSize; x += 4) {
        const lx = x * CELL_SIZE + CELL_SIZE / 2;
        const lz = z * CELL_SIZE + CELL_SIZE / 2;
        const m4 = new THREE.Matrix4().makeTranslation(lx, WALL_HEIGHT - 0.04, lz);
        const nm = new THREE.Matrix3().getNormalMatrix(m4);
        for (let i = 0; i < fPosAttr.count; i++) {
          tv.fromBufferAttribute(fPosAttr, i).applyMatrix4(m4);
          fPositions.push(tv.x, tv.y, tv.z);
          tn.fromBufferAttribute(fNormAttr, i).applyMatrix3(nm).normalize();
          fNormals.push(tn.x, tn.y, tn.z);
          fUvs.push(fUvAttr.getX(i), fUvAttr.getY(i));
        }
        for (let i = 0; i < fIdxAttr.count; i++) {
          fIndices.push(fIdxAttr.getX(i) + fOffset);
        }
        fOffset += fPosAttr.count;
      }
    }
    if (fPositions.length > 0) {
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.Float32BufferAttribute(fPositions, 3));
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(fNormals, 3));
      merged.setAttribute('uv', new THREE.Float32BufferAttribute(fUvs, 2));
      merged.setIndex(fIndices);
      const fixturesMesh = new THREE.Mesh(merged, fixtureMat);
      fixturesMesh.matrixAutoUpdate = false;
      fixturesMesh.updateMatrix();
      fixturesMesh.frustumCulled = false;
      this.scene.add(fixturesMesh);
    }
    fixtureBaseGeo.dispose();

    // Player flashlight — very cheap, short range
    this.flashlight = new THREE.PointLight(0xffffff, 0.9, 10, 1.7) as any;
    this.flashlight.position.set(0, 0, -0.25);
    this.camera.add(this.flashlight);
    this.scene.add(this.camera);
  }

  private setupPlayer() {
    const startX = this.maze.startX * CELL_SIZE + CELL_SIZE / 2;
    const startZ = this.maze.startZ * CELL_SIZE + CELL_SIZE / 2;
    this.playerPos.set(startX, PLAYER_HEIGHT, startZ);
    this.camera.position.copy(this.playerPos);
    this.yaw = Math.PI / 4;
    this.pitch = 0;
  }

  startGame = () => {
    this.gameState = 'playing';
    this.onStateChange('playing');
    this.renderer.domElement.requestPointerLock();
    this.audio.start();
  };

  private rebuildLevel() {
    // Dispose old geometry/materials
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }
    this.spatialGrid.clear();
    this.ceilingTiles.dispose();
    this.spider.dispose();
    this.buildMaze();
    this.setupLighting();
    this.ceilingTiles = new CeilingTileSystem(this.scene, WALL_HEIGHT, () => this.audio.playCrash());
    this.spider = new SpiderMonster(this.scene, this.maze, CELL_SIZE);
    this.setupPlayer();
    this.aiPath = [];
    this.aiPathIndex = 0;
    this.aiRecalcTimer = 0;
    this.aiInspectTimer = 0;
    this.aiInspectTarget = null;
    this.aiSeenInterest.clear();
    if (this.aiMode) this.aiCalcPath();
    this.gameState = 'playing';
    this.onStateChange('playing');
    this.renderer.domElement.requestPointerLock();
    this.audio.start();
  }

  restartGame = () => {
    this.level++;
    this.rebuildLevel();
  };

  retryLevel = () => {
    this.rebuildLevel();
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(
      Math.floor(window.innerWidth * this.resScale),
      Math.floor(window.innerHeight * this.resScale)
    );
    this.renderer.domElement.style.width = window.innerWidth + 'px';
    this.renderer.domElement.style.height = window.innerHeight + 'px';
  };

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (e.code === 'KeyF' && this.gameState === 'playing') {
      this.flashlightOn = !this.flashlightOn;
      this.flashlight.visible = this.flashlightOn;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.isPointerLocked || this.gameState !== 'playing') return;
    this.yaw -= e.movementX * MOUSE_SENSITIVITY;
    this.pitch -= e.movementY * MOUSE_SENSITIVITY;
    this.pitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, this.pitch));
  };

  private onPointerLockChange = () => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private onClick = () => {
    if (this.gameState === 'playing' && !this.isPointerLocked) {
      this.renderer.domElement.requestPointerLock();
    }
  };

  // Fast AABB collision using spatial grid — no allocations
  private checkCollision(px: number, pz: number): { x: number; z: number } {
    let rx = px;
    let rz = pz;

    for (let iter = 0; iter < 2; iter++) {
      const pMinX = rx - PLAYER_RADIUS;
      const pMinZ = rz - PLAYER_RADIUS;
      const pMaxX = rx + PLAYER_RADIUS;
      const pMaxZ = rz + PLAYER_RADIUS;

      const nearby = this.spatialGrid.query(pMinX, pMinZ, pMaxX, pMaxZ);

      for (const w of nearby) {
        // AABB overlap test (2D, xz plane)
        if (pMaxX > w.minX && pMinX < w.maxX && pMaxZ > w.minZ && pMinZ < w.maxZ) {
          const ox1 = pMaxX - w.minX;
          const ox2 = w.maxX - pMinX;
          const oz1 = pMaxZ - w.minZ;
          const oz2 = w.maxZ - pMinZ;
          const minOX = Math.min(ox1, ox2);
          const minOZ = Math.min(oz1, oz2);

          if (minOX < minOZ) {
            rx += ox1 < ox2 ? -ox1 : ox2;
          } else {
            rz += oz1 < oz2 ? -oz1 : oz2;
          }
        }
      }
    }
    return { x: rx, z: rz };
  }

  // Adaptive quality — aggressively lowers resolution on weak PCs
  private adaptQuality(dt: number) {
    const fps = 1 / Math.max(dt, 0.001);
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > 24) this.fpsHistory.shift();
    if (this.fpsHistory.length === 24) {
      const avg = this.fpsHistory.reduce((a, b) => a + b, 0) / 24;
      if (avg < 30 && this.resScale > 0.35) {
        this.resScale = Math.max(0.35, this.resScale - 0.15);
        this.onResize();
        this.fpsHistory.length = 0;
      } else if (avg > 52 && this.resScale < 0.85) {
        this.resScale = Math.min(0.85, this.resScale + 0.05);
        this.onResize();
        this.fpsHistory.length = 0;
      }
    }
  }

  private applyFirstPersonCamera(baseX: number, baseY: number, baseZ: number, yaw: number, pitch: number, moving = false) {
    const t = this.cameraTremorTime;
    const intensity = moving ? 1.35 : 1.0;

    // Very subtle multi-frequency handheld micro-shake
    const tremorX = (Math.sin(t * 17.0) * 0.0025 + Math.sin(t * 31.0 + 0.6) * 0.0014) * intensity;
    const tremorY = (Math.cos(t * 13.0 + 0.2) * 0.0022 + Math.sin(t * 23.0) * 0.0011) * intensity;
    const tremorZ = (Math.sin(t * 15.0 + 1.1) * 0.0016 + Math.cos(t * 27.0) * 0.0009) * intensity;

    const tremorYaw = (Math.sin(t * 9.0) * 0.0018 + Math.cos(t * 14.0) * 0.001) * intensity;
    const tremorPitch = (Math.cos(t * 11.0 + 0.4) * 0.0015 + Math.sin(t * 18.0) * 0.0008) * intensity;

    this.camera.position.set(
      baseX + tremorX,
      baseY + tremorY,
      baseZ + tremorZ
    );

    this._euler.set(pitch + tremorPitch, yaw + tremorYaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);
  }

  private animate = () => {
    if (this.disposed) return;
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.gameState === 'playing') {
      if (this.aiMode) {
        this.aiUpdate(dt);
      } else {
        this.update(dt);
      }
      this.adaptQuality(dt);
    }

    // Animate exit (cheap ops)
    if (this.exitMarker) {
      this.exitMarker.rotation.y += dt * 2;
    }
    if (this.exitLight) {
      this.exitLight.intensity = 3 + Math.sin(now * 0.003) * 1.5;
    }

    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const speed = this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? SPRINT_SPEED : MOVE_SPEED;

    // Reuse pre-allocated vectors
    const fwd = this._forward;
    const right = this._right;
    const moveDir = this._moveDir;

    fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    moveDir.set(0, 0, 0);

    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveDir.add(fwd);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveDir.sub(fwd);
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveDir.add(right);
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveDir.sub(right);

    let isMoving = false;
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(speed * dt);
      isMoving = true;
    }

    // Collision with spatial grid — zero allocs
    const newX = this.playerPos.x + moveDir.x;
    const newZ = this.playerPos.z + moveDir.z;
    const resolved = this.checkCollision(newX, newZ);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    // Head bob & footsteps
    if (isMoving) {
      this.headBob += dt * (this.keys['ShiftLeft'] ? 14 : 10);
      this.footstepTimer += dt;
      const stepInterval = this.keys['ShiftLeft'] ? 0.3 : 0.45;
      if (this.footstepTimer >= stepInterval) {
        this.footstepTimer = 0;
        this.audio.playFootstep();
      }
    } else {
      this.headBob *= 0.9;
      this.footstepTimer = 0.3;
    }

    const bobY = isMoving ? Math.sin(this.headBob) * 0.06 : 0;
    const bobX = isMoving ? Math.cos(this.headBob * 0.5) * 0.03 : 0;

    this.cameraTremorTime += dt;
    this.applyFirstPersonCamera(
      this.playerPos.x + bobX,
      PLAYER_HEIGHT + bobY,
      this.playerPos.z,
      this.yaw,
      this.pitch,
      isMoving
    );

    // Falling ceiling tiles
    this.ceilingTiles.update(dt, this.playerPos.x, this.playerPos.z);

    // Spider monster
    const caught = this.spider.update(dt, this.playerPos.x, this.playerPos.z, this.yaw);
    if (caught) {
      this.gameState = 'caught';
      this.onStateChange('caught');
      document.exitPointerLock();
      return;
    }

    // Check exit — cheap scalar math
    const dx = this.playerPos.x - this.exitPos.x;
    const dz = this.playerPos.z - this.exitPos.z;
    if (dx * dx + dz * dz < 2.25) { // 1.5^2
      this.gameState = 'won';
      this.onStateChange('won');
      document.exitPointerLock();
    }
  }

  // ══════════════════════════════════════
  // AI AUTOPILOT
  // ══════════════════════════════════════

  toggleAI = () => {
    this.aiMode = !this.aiMode;
    if (this.aiMode) {
      this.aiCalcPath();
    }
  };

  get isAI() {
    return this.aiMode;
  }

  // BFS path from player's current cell to exit
  private aiCalcPath() {
    const cs = CELL_SIZE;
    const cx = Math.floor(this.playerPos.x / cs);
    const cz = Math.floor(this.playerPos.z / cs);
    const ex = this.maze.exitX;
    const ez = this.maze.exitZ;
    const { grid, width, height } = this.maze;

    // BFS
    const prev: (null | { x: number; z: number })[][] = [];
    const visited: boolean[][] = [];
    for (let z = 0; z < height; z++) {
      prev[z] = new Array(width).fill(null);
      visited[z] = new Array(width).fill(false);
    }

    const dirs = [
      { dx: 0, dz: -1, dir: 'north' },
      { dx: 0, dz: 1, dir: 'south' },
      { dx: 1, dz: 0, dir: 'east' },
      { dx: -1, dz: 0, dir: 'west' },
    ];

    const queue: { x: number; z: number }[] = [{ x: cx, z: cz }];
    visited[cz][cx] = true;
    let found = false;

    // Get spider cell to avoid it
    const sp = this.spider.getPosition();
    const spCX = Math.floor(sp.x / cs);
    const spCZ = Math.floor(sp.z / cs);

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur.x === ex && cur.z === ez) { found = true; break; }

      const cell = grid[cur.z][cur.x];
      const wallMap: Record<string, boolean> = cell.walls as any;

      for (const d of dirs) {
        if (wallMap[d.dir]) continue;
        const nx = cur.x + d.dx;
        const nz = cur.z + d.dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        if (visited[nz][nx]) continue;
        // Avoid spider's cell and neighbors if possible
        const distToSpider = Math.abs(nx - spCX) + Math.abs(nz - spCZ);
        if (distToSpider <= 1 && !(nx === ex && nz === ez)) continue;
        visited[nz][nx] = true;
        prev[nz][nx] = { x: cur.x, z: cur.z };
        queue.push({ x: nx, z: nz });
      }
    }

    // If avoiding spider blocked the path, try again without avoidance
    if (!found) {
      for (let z = 0; z < height; z++) {
        prev[z].fill(null);
        visited[z].fill(false);
      }
      const q2: { x: number; z: number }[] = [{ x: cx, z: cz }];
      visited[cz][cx] = true;
      while (q2.length > 0) {
        const cur = q2.shift()!;
        if (cur.x === ex && cur.z === ez) { found = true; break; }
        const cell = grid[cur.z][cur.x];
        const wallMap: Record<string, boolean> = cell.walls as any;
        for (const d of dirs) {
          if (wallMap[d.dir]) continue;
          const nx = cur.x + d.dx;
          const nz = cur.z + d.dz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
          if (visited[nz][nx]) continue;
          visited[nz][nx] = true;
          prev[nz][nx] = { x: cur.x, z: cur.z };
          q2.push({ x: nx, z: nz });
        }
      }
    }

    // Reconstruct path
    this.aiPath = [];
    if (found) {
      let p: { x: number; z: number } | null = { x: ex, z: ez };
      while (p && !(p.x === cx && p.z === cz)) {
        this.aiPath.unshift({
          x: p.x * cs + cs / 2,
          z: p.z * cs + cs / 2,
        });
        p = prev[p.z][p.x];
      }
    }
    this.aiPathIndex = 0;
  }

  // AI movement — called instead of keyboard input
  private aiUpdate(dt: number) {
    const spiderPos = this.spider.getPosition();
    const spiderDx = this.playerPos.x - spiderPos.x;
    const spiderDz = this.playerPos.z - spiderPos.z;
    const spiderDist = Math.sqrt(spiderDx * spiderDx + spiderDz * spiderDz);

    // Check exit first in case AI is already standing on it
    const exitDx0 = this.playerPos.x - this.exitPos.x;
    const exitDz0 = this.playerPos.z - this.exitPos.z;
    if (exitDx0 * exitDx0 + exitDz0 * exitDz0 < 2.25) {
      this.gameState = 'won';
      this.onStateChange('won');
      return;
    }

    // Sometimes stop and examine nearby wall writings/drawings.
    // Only when spider is not too close.
    if (this.aiInspectTimer <= 0 && spiderDist > 5) {
      for (let i = 0; i < this.aiInterestPoints.length; i++) {
        if (this.aiSeenInterest.has(i)) continue;
        const p = this.aiInterestPoints[i];
        const dx = p.x - this.playerPos.x;
        const dz = p.z - this.playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1.25 && Math.random() < 0.35) {
          this.aiSeenInterest.add(i);
          this.aiInspectTarget = p;
          this.aiInspectTimer = 1.5 + Math.random() * 1.5;
          this.aiPath = [];
          this.aiPathIndex = 0;
          break;
        }
      }
    }

    // If currently inspecting a wall, pause and look at it.
    if (this.aiInspectTimer > 0 && this.aiInspectTarget) {
      this.aiInspectTimer -= dt;

      const lookDx = this.aiInspectTarget.lookX - this.playerPos.x;
      const lookDz = this.aiInspectTarget.lookZ - this.playerPos.z;
      const desiredYaw = Math.atan2(-lookDx, -lookDz);
      let yawDiff = desiredYaw - this.yaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      this.yaw += yawDiff * Math.min(1, dt * 4);
      this.pitch *= 0.9;
      this.headBob *= 0.85;

      this.cameraTremorTime += dt;
      this.applyFirstPersonCamera(
        this.playerPos.x,
        PLAYER_HEIGHT,
        this.playerPos.z,
        this.yaw,
        this.pitch,
        false
      );

      this.ceilingTiles.update(dt, this.playerPos.x, this.playerPos.z);
      const caught = this.spider.update(dt, this.playerPos.x, this.playerPos.z, this.yaw);
      if (caught) {
        this.gameState = 'caught';
        this.onStateChange('caught');
        return;
      }

      if (this.aiInspectTimer <= 0) {
        this.aiInspectTarget = null;
        this.aiCalcPath();
      }
      return;
    }

    if (this.aiPath.length === 0) {
      this.aiCalcPath();
      return;
    }

    // Recalculate path every few seconds (spider moves)
    this.aiRecalcTimer += dt;
    if (this.aiRecalcTimer > 3) {
      this.aiRecalcTimer = 0;
      this.aiCalcPath();
    }

    // Current target waypoint
    if (this.aiPathIndex >= this.aiPath.length) {
      this.aiCalcPath();
      return;
    }

    const target = this.aiPath[this.aiPathIndex];
    const dx = target.x - this.playerPos.x;
    const dz = target.z - this.playerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Reached waypoint — advance
    if (dist < 0.3) {
      this.aiPathIndex++;

      // If that was the final waypoint, immediately verify exit instead of just stopping
      if (this.aiPathIndex >= this.aiPath.length) {
        const exitDx = this.playerPos.x - this.exitPos.x;
        const exitDz = this.playerPos.z - this.exitPos.z;
        if (exitDx * exitDx + exitDz * exitDz < 2.25) {
          this.gameState = 'won';
          this.onStateChange('won');
        } else {
          this.aiCalcPath();
        }
      }
      return;
    }

    // Determine desired yaw
    const desiredYaw = Math.atan2(-dx, -dz);

    // Smoothly rotate camera towards target
    let yawDiff = desiredYaw - this.yaw;
    // Normalize to [-PI, PI]
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
    this.yaw += yawDiff * Math.min(1, dt * 5);
    this.pitch *= 0.95; // Gradually level camera

    // Move forward
    const speed = SPRINT_SPEED;
    const moveX = (dx / dist) * speed * dt;
    const moveZ = (dz / dist) * speed * dt;

    const newX = this.playerPos.x + moveX;
    const newZ = this.playerPos.z + moveZ;
    const resolved = this.checkCollision(newX, newZ);
    this.playerPos.x = resolved.x;
    this.playerPos.z = resolved.z;

    // Head bob
    this.headBob += dt * 14;
    this.footstepTimer += dt;
    if (this.footstepTimer >= 0.3) {
      this.footstepTimer = 0;
      this.audio.playFootstep();
    }

    const bobY = Math.sin(this.headBob) * 0.06;
    const bobX = Math.cos(this.headBob * 0.5) * 0.03;

    this.cameraTremorTime += dt;
    this.applyFirstPersonCamera(
      this.playerPos.x + bobX,
      PLAYER_HEIGHT + bobY,
      this.playerPos.z,
      this.yaw,
      this.pitch,
      true
    );

    // Ceiling tiles + spider still active
    this.ceilingTiles.update(dt, this.playerPos.x, this.playerPos.z);

    const caught = this.spider.update(dt, this.playerPos.x, this.playerPos.z, this.yaw);
    if (caught) {
      this.gameState = 'caught';
      this.onStateChange('caught');
      return;
    }

    // Check exit
    const edx = this.playerPos.x - this.exitPos.x;
    const edz = this.playerPos.z - this.exitPos.z;
    if (edx * edx + edz * edz < 2.25) {
      this.gameState = 'won';
      this.onStateChange('won');
    }
  }

  getPlayerInfo() {
    const sp = this.spider.getPosition();
    const dx = this.playerPos.x - sp.x;
    const dz = this.playerPos.z - sp.z;
    const spiderDist = Math.sqrt(dx * dx + dz * dz);

    return {
      x: this.playerPos.x,
      z: this.playerPos.z,
      yaw: this.yaw,
      maze: this.maze,
      cellSize: CELL_SIZE,
      level: this.level,
      spiderDist,
      aiMode: this.aiMode,
    };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('click', this.onClick);
    this.audio.stop();
    this.ceilingTiles.dispose();
    this.spider.dispose();
    // Dispose all GPU resources
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });
    this.wallTexture.dispose();
    this.floorTexture.dispose();
    this.ceilingTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
