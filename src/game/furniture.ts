import * as THREE from 'three';
import type { MazeData } from './mazeGenerator';

// Helper to append geometry data into merge arrays
function appendGeo(
  basePos: THREE.BufferAttribute,
  baseNorm: THREE.BufferAttribute,
  baseUv: THREE.BufferAttribute,
  baseIdx: THREE.BufferAttribute,
  mat4: THREE.Matrix4,
  positions: number[],
  normals: number[],
  uvs: number[],
  indices: number[],
  offset: { value: number },
  tv: THREE.Vector3,
  tn: THREE.Vector3,
) {
  const nm = new THREE.Matrix3().getNormalMatrix(mat4);
  for (let i = 0; i < basePos.count; i++) {
    tv.fromBufferAttribute(basePos, i).applyMatrix4(mat4);
    positions.push(tv.x, tv.y, tv.z);
    tn.fromBufferAttribute(baseNorm, i).applyMatrix3(nm).normalize();
    normals.push(tn.x, tn.y, tn.z);
    uvs.push(baseUv.getX(i), baseUv.getY(i));
  }
  for (let i = 0; i < baseIdx.count; i++) {
    indices.push(baseIdx.getX(i) + offset.value);
  }
  offset.value += basePos.count;
}

// Find corners where 2+ walls meet — good spots for furniture
function findCornerPositions(
  maze: MazeData,
  cellSize: number,
): { x: number; z: number; angle: number }[] {
  const corners: { x: number; z: number; angle: number }[] = [];
  const { grid, width, height } = maze;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      // Skip start and exit cells
      if (x === maze.startX && z === maze.startZ) continue;
      if (x === maze.exitX && z === maze.exitZ) continue;

      const cell = grid[z][x];
      const cx = x * cellSize + cellSize / 2;
      const cz = z * cellSize + cellSize / 2;
      const offset = cellSize * 0.35; // How close to the corner

      // Check each corner of the cell for adjacent walls
      // NW corner: north + west walls
      if (cell.walls.north && cell.walls.west) {
        corners.push({ x: cx - offset, z: cz - offset, angle: Math.PI * 0.25 });
      }
      // NE corner: north + east walls
      if (cell.walls.north && cell.walls.east) {
        corners.push({ x: cx + offset, z: cz - offset, angle: Math.PI * 0.75 });
      }
      // SW corner: south + west walls
      if (cell.walls.south && cell.walls.west) {
        corners.push({ x: cx - offset, z: cz + offset, angle: -Math.PI * 0.25 });
      }
      // SE corner: south + east walls
      if (cell.walls.south && cell.walls.east) {
        corners.push({ x: cx + offset, z: cz + offset, angle: -Math.PI * 0.75 });
      }
    }
  }
  return corners;
}

// Find positions along walls (not corners) — good for chairs
function findWallPositions(
  maze: MazeData,
  cellSize: number,
): { x: number; z: number; angle: number }[] {
  const positions: { x: number; z: number; angle: number }[] = [];
  const { grid, width, height } = maze;
  const offset = cellSize * 0.38;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      // Skip start and exit cells
      if (x === maze.startX && z === maze.startZ) continue;
      if (x === maze.exitX && z === maze.exitZ) continue;

      const cell = grid[z][x];
      const cx = x * cellSize + cellSize / 2;
      const cz = z * cellSize + cellSize / 2;

      // Only single-wall sides (not corners) — chair faces away from wall
      const wN = cell.walls.north;
      const wS = cell.walls.south;
      const wW = cell.walls.west;
      const wE = cell.walls.east;

      // North wall only (no NW or NE corner)
      if (wN && !wW && !wE) {
        positions.push({ x: cx, z: cz - offset, angle: Math.PI });
      }
      // South wall only
      if (wS && !wW && !wE) {
        positions.push({ x: cx, z: cz + offset, angle: 0 });
      }
      // West wall only
      if (wW && !wN && !wS) {
        positions.push({ x: cx - offset, z: cz, angle: Math.PI * 0.5 });
      }
      // East wall only
      if (wE && !wN && !wS) {
        positions.push({ x: cx + offset, z: cz, angle: -Math.PI * 0.5 });
      }
    }
  }
  return positions;
}

export function buildFurniture(
  maze: MazeData,
  cellSize: number,
  scene: THREE.Scene,
) {
  const tv = new THREE.Vector3();
  const tn = new THREE.Vector3();

  // ═══════════════════════════════════════════
  // POTTED PLANTS — placed in wall corners
  // ═══════════════════════════════════════════
  const corners = findCornerPositions(maze, cellSize);
  // Only place plants in ~15% of corners, randomly chosen
  const plantCorners = corners.filter(() => Math.random() < 0.06);
  // Lower cap for weak PCs
  const maxPlants = Math.min(plantCorners.length, 6);

  if (maxPlants > 0) {
    // Build plant base geometries
    // Pot: brown cylinder
    const potGeo = new THREE.CylinderGeometry(0.12, 0.15, 0.25, 4);
    // Soil: dark disc on top
    const soilGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 4);
    // Stem: thin green cylinder
    const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.35, 3);
    // Leaves: very low poly for performance
    const leaf1Geo = new THREE.SphereGeometry(0.1, 3, 2);
    const leaf2Geo = new THREE.SphereGeometry(0.08, 3, 2);
    const leaf3Geo = new THREE.SphereGeometry(0.07, 3, 2);

    // Pot mesh (brown terracotta)
    const potPositions: number[] = [];
    const potNormals: number[] = [];
    const potUvs: number[] = [];
    const potIndices: number[] = [];
    const potOffset = { value: 0 };

    // Green parts (stem + leaves)
    const greenPositions: number[] = [];
    const greenNormals: number[] = [];
    const greenUvs: number[] = [];
    const greenIndices: number[] = [];
    const greenOffset = { value: 0 };

    const potPosA = potGeo.getAttribute('position') as THREE.BufferAttribute;
    const potNormA = potGeo.getAttribute('normal') as THREE.BufferAttribute;
    const potUvA = potGeo.getAttribute('uv') as THREE.BufferAttribute;
    const potIdxA = potGeo.getIndex()!;

    const soilPosA = soilGeo.getAttribute('position') as THREE.BufferAttribute;
    const soilNormA = soilGeo.getAttribute('normal') as THREE.BufferAttribute;
    const soilUvA = soilGeo.getAttribute('uv') as THREE.BufferAttribute;
    const soilIdxA = soilGeo.getIndex()!;

    const stemPosA = stemGeo.getAttribute('position') as THREE.BufferAttribute;
    const stemNormA = stemGeo.getAttribute('normal') as THREE.BufferAttribute;
    const stemUvA = stemGeo.getAttribute('uv') as THREE.BufferAttribute;
    const stemIdxA = stemGeo.getIndex()!;

    const leafGeos = [leaf1Geo, leaf2Geo, leaf3Geo];

    for (let i = 0; i < maxPlants; i++) {
      const c = plantCorners[i];
      const px = c.x;
      const pz = c.z;
      const rotY = c.angle + (Math.random() - 0.5) * 0.5;

      // Pot
      const potM = new THREE.Matrix4().compose(
        new THREE.Vector3(px, 0.125, pz),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      appendGeo(potPosA, potNormA, potUvA, potIdxA, potM,
        potPositions, potNormals, potUvs, potIndices, potOffset, tv, tn);

      // Soil on top of pot
      const soilM = new THREE.Matrix4().compose(
        new THREE.Vector3(px, 0.26, pz),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      appendGeo(soilPosA, soilNormA, soilUvA, soilIdxA, soilM,
        potPositions, potNormals, potUvs, potIndices, potOffset, tv, tn);

      // Stem
      const stemQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), rotY
      );
      // Slight random tilt
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0), (Math.random() - 0.5) * 0.15
      );
      stemQ.multiply(tiltQ);

      const stemM = new THREE.Matrix4().compose(
        new THREE.Vector3(px, 0.43, pz),
        stemQ,
        new THREE.Vector3(1, 1, 1)
      );
      appendGeo(stemPosA, stemNormA, stemUvA, stemIdxA, stemM,
        greenPositions, greenNormals, greenUvs, greenIndices, greenOffset, tv, tn);

      // 1-2 leaf clusters
      const numLeaves = 1 + Math.floor(Math.random() * 2);
      for (let l = 0; l < numLeaves; l++) {
        const leafGeo = leafGeos[l % leafGeos.length];
        const lPosA = leafGeo.getAttribute('position') as THREE.BufferAttribute;
        const lNormA = leafGeo.getAttribute('normal') as THREE.BufferAttribute;
        const lUvA = leafGeo.getAttribute('uv') as THREE.BufferAttribute;
        const lIdxA = leafGeo.getIndex()!;

        const leafAngle = rotY + (l / numLeaves) * Math.PI * 2 + Math.random() * 0.5;
        const leafRadius = 0.05 + Math.random() * 0.06;
        const leafHeight = 0.5 + l * 0.1 + Math.random() * 0.1;
        const leafX = px + Math.cos(leafAngle) * leafRadius;
        const leafZ = pz + Math.sin(leafAngle) * leafRadius;

        // Stretch leaves vertically a bit
        const leafScale = 0.8 + Math.random() * 0.5;
        const leafM = new THREE.Matrix4().compose(
          new THREE.Vector3(leafX, leafHeight, leafZ),
          new THREE.Quaternion(),
          new THREE.Vector3(leafScale, leafScale * 1.2, leafScale)
        );
        appendGeo(lPosA, lNormA, lUvA, lIdxA, leafM,
          greenPositions, greenNormals, greenUvs, greenIndices, greenOffset, tv, tn);
      }
    }

    // Create pot mesh (1 draw call for all pots)
    if (potPositions.length > 0) {
      const potMerged = new THREE.BufferGeometry();
      potMerged.setAttribute('position', new THREE.Float32BufferAttribute(potPositions, 3));
      potMerged.setAttribute('normal', new THREE.Float32BufferAttribute(potNormals, 3));
      potMerged.setAttribute('uv', new THREE.Float32BufferAttribute(potUvs, 2));
      potMerged.setIndex(potIndices);
      const potMesh = new THREE.Mesh(potMerged, new THREE.MeshLambertMaterial({ color: 0x8B4513 }));
      potMesh.matrixAutoUpdate = false;
      potMesh.updateMatrix();
      potMesh.frustumCulled = false;
      scene.add(potMesh);
    }

    // Create green parts mesh (1 draw call for all leaves+stems)
    if (greenPositions.length > 0) {
      const greenMerged = new THREE.BufferGeometry();
      greenMerged.setAttribute('position', new THREE.Float32BufferAttribute(greenPositions, 3));
      greenMerged.setAttribute('normal', new THREE.Float32BufferAttribute(greenNormals, 3));
      greenMerged.setAttribute('uv', new THREE.Float32BufferAttribute(greenUvs, 2));
      greenMerged.setIndex(greenIndices);
      const greenMesh = new THREE.Mesh(greenMerged, new THREE.MeshLambertMaterial({ color: 0x2d6b30 }));
      greenMesh.matrixAutoUpdate = false;
      greenMesh.updateMatrix();
      greenMesh.frustumCulled = false;
      scene.add(greenMesh);
    }

    // Dispose base geometries
    potGeo.dispose();
    soilGeo.dispose();
    stemGeo.dispose();
    leaf1Geo.dispose();
    leaf2Geo.dispose();
    leaf3Geo.dispose();
  }

  // ═══════════════════════════════════════════
  // CHAIRS — placed along walls
  // ═══════════════════════════════════════════
  const wallSpots = findWallPositions(maze, cellSize);
  const chairSpots = wallSpots.filter(() => Math.random() < 0.04);
  const maxChairs = Math.min(chairSpots.length, 6);

  if (maxChairs > 0) {
    // Chair parts:
    // Seat: flat box
    const seatGeo = new THREE.BoxGeometry(0.4, 0.04, 0.4);
    // Legs: 4 thin cylinders
    const legGeo = new THREE.BoxGeometry(0.04, 0.4, 0.04);
    // Backrest: thin tall box
    const backGeo = new THREE.BoxGeometry(0.4, 0.35, 0.04);

    const chairPositions: number[] = [];
    const chairNormals: number[] = [];
    const chairUvs: number[] = [];
    const chairIndices: number[] = [];
    const chairOffset = { value: 0 };

    const parts = [
      { geo: seatGeo, label: 'seat' },
      { geo: legGeo, label: 'leg' },
      { geo: backGeo, label: 'back' },
    ];

    const attrs = parts.map(p => ({
      pos: p.geo.getAttribute('position') as THREE.BufferAttribute,
      norm: p.geo.getAttribute('normal') as THREE.BufferAttribute,
      uv: p.geo.getAttribute('uv') as THREE.BufferAttribute,
      idx: p.geo.getIndex()!,
    }));

    for (let i = 0; i < maxChairs; i++) {
      const spot = chairSpots[i];
      const cx = spot.x;
      const cz = spot.z;
      // Chair faces away from wall + random slight rotation
      const chairAngle = spot.angle + (Math.random() - 0.5) * 0.4;
      const quat = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0), chairAngle
      );

      const seatHeight = 0.42;

      // Seat
      const seatM = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, seatHeight, cz),
        quat,
        new THREE.Vector3(1, 1, 1)
      );
      appendGeo(attrs[0].pos, attrs[0].norm, attrs[0].uv, attrs[0].idx, seatM,
        chairPositions, chairNormals, chairUvs, chairIndices, chairOffset, tv, tn);

      // 4 Legs
      const legOffsets = [
        [-0.15, -0.15],
        [0.15, -0.15],
        [-0.15, 0.15],
        [0.15, 0.15],
      ];
      for (const [lx, lz] of legOffsets) {
        // Transform leg offset by chair rotation
        const legLocalPos = new THREE.Vector3(lx, 0.2, lz);
        legLocalPos.applyQuaternion(quat);
        const legM = new THREE.Matrix4().compose(
          new THREE.Vector3(cx + legLocalPos.x, 0.2, cz + legLocalPos.z),
          quat,
          new THREE.Vector3(1, 1, 1)
        );
        appendGeo(attrs[1].pos, attrs[1].norm, attrs[1].uv, attrs[1].idx, legM,
          chairPositions, chairNormals, chairUvs, chairIndices, chairOffset, tv, tn);
      }

      // Backrest — at the back edge of the seat
      const backLocalPos = new THREE.Vector3(0, 0.195, -0.18);
      backLocalPos.applyQuaternion(quat);
      const backM = new THREE.Matrix4().compose(
        new THREE.Vector3(cx + backLocalPos.x, seatHeight + 0.195, cz + backLocalPos.z),
        quat,
        new THREE.Vector3(1, 1, 1)
      );
      appendGeo(attrs[2].pos, attrs[2].norm, attrs[2].uv, attrs[2].idx, backM,
        chairPositions, chairNormals, chairUvs, chairIndices, chairOffset, tv, tn);
    }

    if (chairPositions.length > 0) {
      const chairMerged = new THREE.BufferGeometry();
      chairMerged.setAttribute('position', new THREE.Float32BufferAttribute(chairPositions, 3));
      chairMerged.setAttribute('normal', new THREE.Float32BufferAttribute(chairNormals, 3));
      chairMerged.setAttribute('uv', new THREE.Float32BufferAttribute(chairUvs, 2));
      chairMerged.setIndex(chairIndices);
      // Brownish-gray office chair color
      const chairMesh = new THREE.Mesh(chairMerged, new THREE.MeshLambertMaterial({ color: 0x5a5046 }));
      chairMesh.matrixAutoUpdate = false;
      chairMesh.updateMatrix();
      chairMesh.frustumCulled = false;
      scene.add(chairMesh);
    }

    seatGeo.dispose();
    legGeo.dispose();
    backGeo.dispose();
  }
}
