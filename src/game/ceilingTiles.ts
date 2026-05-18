import * as THREE from 'three';

const GRAVITY = 9.8;
const TILE_THICKNESS = 0.06;
const MAX_ACTIVE = 2;
const SPAWN_INTERVAL_MIN = 8;  // seconds between spawns
const SPAWN_INTERVAL_MAX = 20;
const SPAWN_RADIUS_MIN = 2;    // min distance from player
const SPAWN_RADIUS_MAX = 7;    // max distance from player

interface FallingTile {
  mesh: THREE.Mesh;
  hole: THREE.Mesh; // dark hole on ceiling
  velY: number;
  rotSpeedX: number;
  rotSpeedZ: number;
  grounded: boolean;
  groundTime: number; // time when it hit the ground
}

export class CeilingTileSystem {
  private scene: THREE.Scene;
  private ceilingHeight: number;
  private tiles: FallingTile[] = [];
  private nextSpawn: number;
  private elapsed = 0;
  private sharedGeo: THREE.BufferGeometry;
  private sharedMat: THREE.MeshLambertMaterial;
  // Dust particles for impact
  private dustPool: THREE.Mesh[] = [];
  private dustGeo: THREE.BufferGeometry;
  private dustMat: THREE.MeshBasicMaterial;
  private onCrash: () => void;
  private holeGeo: THREE.BufferGeometry;
  private holeMat: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, ceilingHeight: number, onCrash: () => void) {
    this.scene = scene;
    this.ceilingHeight = ceilingHeight;
    this.onCrash = onCrash;
    this.nextSpawn = 3 + Math.random() * 5; // first tile falls after 3-8s

    // Shared tile geometry — rectangular ceiling panel
    const tileW = 0.5 + Math.random() * 0.4;
    const tileD = 0.5 + Math.random() * 0.4;
    this.sharedGeo = new THREE.BoxGeometry(tileW, TILE_THICKNESS, tileD);

    // Yellowish-white like ceiling tiles
    this.sharedMat = new THREE.MeshLambertMaterial({ color: 0xc8be90 });

    // Dust puff geo
    this.dustGeo = new THREE.SphereGeometry(0.15, 4, 3);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: 0xc8be90,
      transparent: true,
      opacity: 0.5,
    });

    // Ceiling hole — dark rectangle flush with ceiling
    this.holeGeo = new THREE.PlaneGeometry(1, 1);
    this.holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0804 });
  }

  update(dt: number, playerX: number, playerZ: number) {
    this.elapsed += dt;

    // ── Spawn new tile ──
    if (this.elapsed >= this.nextSpawn && this.tiles.filter(t => !t.grounded).length < MAX_ACTIVE) {
      this.spawnTile(playerX, playerZ);
      this.nextSpawn = this.elapsed + SPAWN_INTERVAL_MIN + Math.random() * (SPAWN_INTERVAL_MAX - SPAWN_INTERVAL_MIN);
    }

    // ── Update falling tiles ──
    for (const tile of this.tiles) {
      if (tile.grounded) continue;

      tile.velY -= GRAVITY * dt;
      tile.mesh.position.y += tile.velY * dt;

      // Tumble while falling
      tile.mesh.rotation.x += tile.rotSpeedX * dt;
      tile.mesh.rotation.z += tile.rotSpeedZ * dt;

      // Hit ground
      if (tile.mesh.position.y <= TILE_THICKNESS / 2) {
        tile.mesh.position.y = TILE_THICKNESS / 2 + 0.001;
        tile.grounded = true;
        tile.groundTime = this.elapsed;
        // Flatten on ground
        tile.mesh.rotation.x = 0;
        tile.mesh.rotation.z = (Math.random() - 0.5) * 0.15;
        // Spawn dust puff
        this.spawnDust(tile.mesh.position.x, tile.mesh.position.z);
        // Sound
        this.onCrash();
      }
    }

    // ── Update dust particles ──
    for (let i = this.dustPool.length - 1; i >= 0; i--) {
      const dust = this.dustPool[i];
      const scale = dust.scale.x + dt * 2;
      dust.scale.set(scale, scale * 0.5, scale);
      (dust.material as THREE.MeshBasicMaterial).opacity -= dt * 1.5;
      dust.position.y += dt * 0.3;

      if ((dust.material as THREE.MeshBasicMaterial).opacity <= 0) {
        this.scene.remove(dust);
        this.dustPool.splice(i, 1);
      }
    }

    // ── Cleanup old grounded tiles (keep max ~12 debris) ──
    const grounded = this.tiles.filter(t => t.grounded);
    if (grounded.length > 4) {
      const oldest = grounded[0];
      this.scene.remove(oldest.mesh);
      this.scene.remove(oldest.hole);
      this.tiles.splice(this.tiles.indexOf(oldest), 1);
    }
  }

  private spawnTile(playerX: number, playerZ: number) {
    // Pick a random position near the player (in front-ish, within view)
    const angle = Math.random() * Math.PI * 2;
    const dist = SPAWN_RADIUS_MIN + Math.random() * (SPAWN_RADIUS_MAX - SPAWN_RADIUS_MIN);
    const tx = playerX + Math.cos(angle) * dist;
    const tz = playerZ + Math.sin(angle) * dist;

    // Randomize tile size slightly
    const scaleX = 0.8 + Math.random() * 0.5;
    const scaleZ = 0.8 + Math.random() * 0.5;

    const mesh = new THREE.Mesh(this.sharedGeo, this.sharedMat);
    mesh.scale.set(scaleX, 1, scaleZ);
    mesh.position.set(tx, this.ceilingHeight - TILE_THICKNESS, tz);

    // Start with slight random rotation
    mesh.rotation.x = (Math.random() - 0.5) * 0.1;
    mesh.rotation.z = (Math.random() - 0.5) * 0.1;

    this.scene.add(mesh);

    // Dark hole on the ceiling where tile fell from
    const hole = new THREE.Mesh(this.holeGeo, this.holeMat);
    hole.rotation.x = Math.PI / 2; // face downward
    hole.position.set(tx, this.ceilingHeight - 0.01, tz);
    hole.scale.set(scaleX * 0.65, scaleZ * 0.65, 1);
    this.scene.add(hole);

    this.tiles.push({
      mesh,
      hole,
      velY: -0.5 - Math.random() * 1, // initial small downward push
      rotSpeedX: (Math.random() - 0.5) * 4,
      rotSpeedZ: (Math.random() - 0.5) * 4,
      grounded: false,
      groundTime: 0,
    });
  }

  private spawnDust(x: number, z: number) {
    // Single dust puff for performance
    const count = 1;
    for (let i = 0; i < count; i++) {
      const dust = new THREE.Mesh(this.dustGeo, this.dustMat.clone());
      dust.position.set(
        x + (Math.random() - 0.5) * 0.4,
        0.1 + Math.random() * 0.15,
        z + (Math.random() - 0.5) * 0.4
      );
      const s = 0.3 + Math.random() * 0.3;
      dust.scale.set(s, s * 0.5, s);
      this.scene.add(dust);
      this.dustPool.push(dust);
    }
  }

  dispose() {
    for (const tile of this.tiles) {
      this.scene.remove(tile.mesh);
      this.scene.remove(tile.hole);
    }
    for (const dust of this.dustPool) {
      this.scene.remove(dust);
      (dust.material as THREE.MeshBasicMaterial).dispose();
    }
    this.tiles.length = 0;
    this.dustPool.length = 0;
    this.sharedGeo.dispose();
    this.sharedMat.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.holeGeo.dispose();
    this.holeMat.dispose();
  }
}
