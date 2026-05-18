import { useEffect, useRef } from 'react';
import type { BackroomsGame } from './BackroomsGame';

interface MinimapProps {
  game: BackroomsGame | null;
  visible: boolean;
}

export function Minimap({ game, visible }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const lastDrawRef = useRef<number>(0);

  useEffect(() => {
    if (!visible || !game) return;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);

      // Throttle minimap to ~10fps — saves CPU without visible impact
      const now = performance.now();
      if (now - lastDrawRef.current < 100) return;
      lastDrawRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const info = game.getPlayerInfo();
      if (!info.maze) return;

      const { maze, cellSize } = info;
      const mapScale = 8;
      const viewRadius = 5;
      const size = canvas.width;
      const halfSize = size / 2;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, size, size);

      const playerCellX = info.x / cellSize;
      const playerCellZ = info.z / cellSize;

      ctx.save();
      ctx.translate(halfSize, halfSize);

      // Batch wall drawing — begin path once, stroke once
      ctx.strokeStyle = '#c4a84a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      for (let z = 0; z < maze.height; z++) {
        for (let x = 0; x < maze.width; x++) {
          const dx = x + 0.5 - playerCellX;
          const dz = z + 0.5 - playerCellZ;
          if (Math.abs(dx) > viewRadius || Math.abs(dz) > viewRadius) continue;

          const screenX = dx * mapScale;
          const screenZ = dz * mapScale;
          const cell = maze.grid[z][x];

          if (x === maze.exitX && z === maze.exitZ) {
            // Will draw exit separately
          }

          if (cell.walls.north) {
            ctx.moveTo(screenX, screenZ);
            ctx.lineTo(screenX + mapScale, screenZ);
          }
          if (cell.walls.south) {
            ctx.moveTo(screenX, screenZ + mapScale);
            ctx.lineTo(screenX + mapScale, screenZ + mapScale);
          }
          if (cell.walls.west) {
            ctx.moveTo(screenX, screenZ);
            ctx.lineTo(screenX, screenZ + mapScale);
          }
          if (cell.walls.east) {
            ctx.moveTo(screenX + mapScale, screenZ);
            ctx.lineTo(screenX + mapScale, screenZ + mapScale);
          }
        }
      }
      ctx.stroke();

      // Exit highlight
      const exitDx = (maze.exitX + 0.5 - playerCellX);
      const exitDz = (maze.exitZ + 0.5 - playerCellZ);
      if (Math.abs(exitDx) <= viewRadius && Math.abs(exitDz) <= viewRadius) {
        ctx.fillStyle = 'rgba(0,255,136,0.3)';
        ctx.fillRect(exitDx * mapScale, exitDz * mapScale, mapScale, mapScale);
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(exitDx * mapScale, exitDz * mapScale, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player arrow — more elongated for clearer direction
      ctx.save();
      ctx.rotate(-info.yaw);
      ctx.fillStyle = '#ff4444';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-2.2, -1.5);
      ctx.lineTo(-2.2, 4);
      ctx.lineTo(0, 2.2);
      ctx.lineTo(2.2, 4);
      ctx.lineTo(2.2, -1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.restore();

      // Border
      ctx.strokeStyle = 'rgba(196,168,74,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, size, size);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [game, visible]);

  if (!visible) return null;

  return (
    <canvas
      ref={canvasRef}
      width={120}
      height={120}
      className="absolute bottom-16 left-4 z-10"
      style={{ imageRendering: 'pixelated', opacity: 0.8 }}
    />
  );
}
