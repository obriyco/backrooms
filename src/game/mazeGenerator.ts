// Maze generator using recursive backtracking algorithm
export interface MazeCell {
  x: number;
  z: number;
  walls: { north: boolean; south: boolean; east: boolean; west: boolean };
  visited: boolean;
}

export interface MazeData {
  grid: MazeCell[][];
  width: number;
  height: number;
  startX: number;
  startZ: number;
  exitX: number;
  exitZ: number;
}

interface Direction {
  dx: number;
  dz: number;
  dir: string;
  opposite: string;
}

const DIRS: Direction[] = [
  { dx: 0, dz: -1, dir: 'north', opposite: 'south' },
  { dx: 0, dz: 1, dir: 'south', opposite: 'north' },
  { dx: 1, dz: 0, dir: 'east', opposite: 'west' },
  { dx: -1, dz: 0, dir: 'west', opposite: 'east' },
];

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// BFS that returns distances to ALL cells from a source
function bfsAll(
  grid: MazeCell[][],
  width: number,
  height: number,
  sx: number,
  sz: number,
): number[][] {
  const dist: number[][] = [];
  for (let z = 0; z < height; z++) {
    dist[z] = new Array(width).fill(-1);
  }
  dist[sz][sx] = 0;
  const queue: { x: number; z: number }[] = [{ x: sx, z: sz }];
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const cell = grid[cur.z][cur.x];
    const wallMap: Record<string, boolean> = cell.walls as any;
    const curDist = dist[cur.z][cur.x];

    for (const d of DIRS) {
      if (wallMap[d.dir]) continue;
      const nx = cur.x + d.dx;
      const nz = cur.z + d.dz;
      if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
      if (dist[nz][nx] !== -1) continue;
      dist[nz][nx] = curDist + 1;
      queue.push({ x: nx, z: nz });
    }
  }

  return dist;
}

export function generateMaze(width: number, height: number): MazeData {
  const grid: MazeCell[][] = [];
  for (let z = 0; z < height; z++) {
    grid[z] = [];
    for (let x = 0; x < width; x++) {
      grid[z][x] = {
        x,
        z,
        walls: { north: true, south: true, east: true, west: true },
        visited: false,
      };
    }
  }

  // Recursive backtracking
  const stack: MazeCell[] = [];
  const startCell = grid[0][0];
  startCell.visited = true;
  stack.push(startCell);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors: { cell: MazeCell; direction: string }[] = [];

    for (const d of DIRS) {
      const nx = current.x + d.dx;
      const nz = current.z + d.dz;
      if (nx >= 0 && nx < width && nz >= 0 && nz < height && !grid[nz][nx].visited) {
        neighbors.push({ cell: grid[nz][nx], direction: d.dir });
      }
    }

    if (neighbors.length > 0) {
      const shuffled = shuffle(neighbors);
      const chosen = shuffled[0];
      const chosenDir = DIRS.find((d) => d.dir === chosen.direction)!;

      (current.walls as any)[chosenDir.dir] = false;
      (chosen.cell.walls as any)[chosenDir.opposite] = false;

      chosen.cell.visited = true;
      stack.push(chosen.cell);
    } else {
      stack.pop();
    }
  }

  // Add random wall removals to create loops (more backrooms-like)
  const extraOpenings = Math.floor(width * height * 0.12);
  for (let i = 0; i < extraOpenings; i++) {
    const rx = Math.floor(Math.random() * width);
    const rz = Math.floor(Math.random() * height);
    const cell = grid[rz][rx];
    const validDirs = DIRS.filter((d) => {
      const nx = rx + d.dx;
      const nz = rz + d.dz;
      return nx >= 0 && nx < width && nz >= 0 && nz < height;
    });
    const randomDir = shuffle(validDirs);
    if (randomDir.length > 0) {
      const d = randomDir[0];
      const nx = rx + d.dx;
      const nz = rz + d.dz;
      (cell.walls as any)[d.dir] = false;
      (grid[nz][nx].walls as any)[d.opposite] = false;
    }
  }

  // ── Pick exit using BFS distance (actual maze path length) ──
  // This means the exit can be ANYWHERE — center, edge, corner —
  // as long as the path through the maze is long.
  const startX = 0;
  const startZ = 0;
  const distMap = bfsAll(grid, width, height, startX, startZ);

  // Collect all reachable cells with their BFS distance
  const candidates: { x: number; z: number; dist: number }[] = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (x === startX && z === startZ) continue;
      if (distMap[z][x] > 0) {
        candidates.push({ x, z, dist: distMap[z][x] });
      }
    }
  }

  // Sort by BFS distance descending — farthest cells in the maze
  candidates.sort((a, b) => b.dist - a.dist);

  // Pick randomly from the top ~15% longest paths
  const poolSize = Math.max(5, Math.floor(candidates.length * 0.15));
  const topPool = candidates.slice(0, poolSize);
  const pick = topPool[Math.floor(Math.random() * topPool.length)];

  const exitX = pick ? pick.x : width - 1;
  const exitZ = pick ? pick.z : height - 1;

  return {
    grid,
    width,
    height,
    startX,
    startZ,
    exitX,
    exitZ,
  };
}

export interface WallSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export function getWallSegments(maze: MazeData, cellSize: number): WallSegment[] {
  const segments: WallSegment[] = [];
  const { grid, width, height } = maze;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const cell = grid[z][x];
      const cx = x * cellSize;
      const cz = z * cellSize;

      if (cell.walls.north) {
        segments.push({ x1: cx, z1: cz, x2: cx + cellSize, z2: cz });
      }
      if (cell.walls.west) {
        segments.push({ x1: cx, z1: cz, x2: cx, z2: cz + cellSize });
      }
      if (z === height - 1 && cell.walls.south) {
        segments.push({ x1: cx, z1: cz + cellSize, x2: cx + cellSize, z2: cz + cellSize });
      }
      if (x === width - 1 && cell.walls.east) {
        segments.push({ x1: cx + cellSize, z1: cz, x2: cx + cellSize, z2: cz + cellSize });
      }
    }
  }

  return segments;
}
