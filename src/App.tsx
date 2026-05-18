import { useEffect, useRef, useState, useCallback } from 'react';
import { BackroomsGame, type GameState } from './game/BackroomsGame';
import { Minimap } from './game/Minimap';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<BackroomsGame | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [showControls, setShowControls] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [aiMode, setAiMode] = useState(false);
  const aiModeRef = useRef(false);
  const [level, setLevel] = useState(1);
  const [timer, setTimer] = useState(0);
  const [spiderDist, setSpiderDist] = useState(99);
  const [aiCountdown, setAiCountdown] = useState(0);
  const timerRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const distIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiAutoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStateChange = useCallback((state: GameState) => {
    setGameState(state);
    if (state === 'playing') {
      timerRef.current = 0;
      setTimer(0);
      intervalRef.current = setInterval(() => {
        timerRef.current += 1;
        setTimer(timerRef.current);
      }, 1000);
      // Poll spider distance
      distIntervalRef.current = setInterval(() => {
        const info = gameRef.current?.getPlayerInfo();
        if (info) setSpiderDist(info.spiderDist);
      }, 500);
    } else if (state === 'won' || state === 'caught') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (distIntervalRef.current) {
        clearInterval(distIntervalRef.current);
        distIntervalRef.current = null;
      }
      // AI auto-continue after 3 second countdown
      if (aiModeRef.current) {
        if (aiAutoRef.current) clearTimeout(aiAutoRef.current);
        setAiCountdown(3);
        const tick = (n: number) => {
          if (n <= 1) {
            setAiCountdown(0);
            if (state === 'caught') {
              gameRef.current?.retryLevel();
            } else {
              setLevel(prev => prev + 1);
              gameRef.current?.restartGame();
            }
          } else {
            setAiCountdown(n - 1);
            aiAutoRef.current = setTimeout(() => tick(n - 1), 1000);
          }
        };
        aiAutoRef.current = setTimeout(() => tick(3), 1000);
      }
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const game = new BackroomsGame(containerRef.current, handleStateChange);
    gameRef.current = game;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        setShowMinimap(prev => !prev);
      }
      if (e.code === 'KeyP') {
        gameRef.current?.toggleAI();
        setAiMode(prev => { const v = !prev; aiModeRef.current = v; return v; });
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      game.dispose();
      document.removeEventListener('keydown', handleKeyDown);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (distIntervalRef.current) {
        clearInterval(distIntervalRef.current);
      }
      if (aiAutoRef.current) {
        clearTimeout(aiAutoRef.current);
      }
    };
  }, [handleStateChange]);

  const handleStart = () => {
    gameRef.current?.startGame();
  };

  const handleRestart = () => {
    setLevel(prev => prev + 1);
    gameRef.current?.restartGame();
  };

  const handleRetry = () => {
    gameRef.current?.retryLevel();
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      {/* Game canvas container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Menu Screen */}
      {gameState === 'menu' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-20 text-center px-4 max-w-lg">
            {/* Glitch title effect */}
            <div className="relative mb-2">
              <h1
                className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-widest"
                style={{
                  color: '#c4a84a',
                  textShadow: '0 0 30px rgba(196,168,74,0.5), 0 0 60px rgba(196,168,74,0.2), 2px 2px 0px rgba(196,168,74,0.1)',
                  fontFamily: 'monospace',
                }}
              >
                THE
              </h1>
              <h1
                className="text-5xl sm:text-6xl md:text-8xl font-bold tracking-widest"
                style={{
                  color: '#c4a84a',
                  textShadow: '0 0 30px rgba(196,168,74,0.5), 0 0 60px rgba(196,168,74,0.2)',
                  fontFamily: 'monospace',
                }}
              >
                BACKROOMS
              </h1>
            </div>

            <p
              className="text-base sm:text-lg md:text-xl mb-8 tracking-wider"
              style={{ color: '#8a7a5a', fontFamily: 'monospace' }}
            >
              ═══ Найди выход, если сможешь... ═══
            </p>

            <div className="flex flex-col items-center gap-4">
              <button
                onClick={handleStart}
                className="px-10 py-4 text-xl font-bold tracking-wider transition-all duration-300 cursor-pointer border-2 hover:scale-105"
                style={{
                  background: 'rgba(196,168,74,0.1)',
                  borderColor: '#c4a84a',
                  color: '#c4a84a',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(196,168,74,0.25)';
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(196,168,74,0.3), inset 0 0 20px rgba(196,168,74,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(196,168,74,0.1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ▶ НАЧАТЬ ИГРУ
              </button>

              <button
                onClick={() => { handleStart(); gameRef.current?.toggleAI(); setAiMode(true); aiModeRef.current = true; }}
                className="px-10 py-4 text-xl font-bold tracking-wider transition-all duration-300 cursor-pointer border-2 hover:scale-105"
                style={{
                  background: 'rgba(100,140,255,0.08)',
                  borderColor: '#6688cc',
                  color: '#6688cc',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(100,140,255,0.2)';
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(100,140,255,0.3), inset 0 0 20px rgba(100,140,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(100,140,255,0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                🤖 РЕЖИМ ИИ
              </button>

              <button
                onClick={() => setShowControls(!showControls)}
                className="px-6 py-2 text-sm tracking-wider transition-all duration-300 cursor-pointer border"
                style={{
                  background: 'transparent',
                  borderColor: '#6a5a3a',
                  color: '#8a7a5a',
                  fontFamily: 'monospace',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#c4a84a';
                  e.currentTarget.style.color = '#c4a84a';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#6a5a3a';
                  e.currentTarget.style.color = '#8a7a5a';
                }}
              >
                {showControls ? '▲ СКРЫТЬ УПРАВЛЕНИЕ' : '▼ УПРАВЛЕНИЕ'}
              </button>
            </div>

            {showControls && (
              <div
                className="mt-6 p-5 border max-w-sm mx-auto text-left text-sm"
                style={{
                  borderColor: '#4a3a2a',
                  background: 'rgba(0,0,0,0.8)',
                  color: '#c4a84a',
                  fontFamily: 'monospace',
                }}
              >
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                  <span className="text-right" style={{ color: '#e4d89a' }}>WASD</span>
                  <span>Движение</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>Мышь</span>
                  <span>Осмотреться</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>Shift</span>
                  <span>Бег</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>F</span>
                  <span>Вкл/Выкл фонарик</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>M</span>
                  <span>Вкл/Выкл мини-карту</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>P</span>
                  <span>Вкл/Выкл режим ИИ</span>
                  <span className="text-right" style={{ color: '#e4d89a' }}>ESC</span>
                  <span>Освободить мышь</span>
                </div>
                <div className="mt-4 pt-3 border-t text-center text-xs" style={{ borderColor: '#3a2a1a', color: '#00ff88' }}>
                  🟢 Найди зелёное свечение — это выход
                </div>
              </div>
            )}

            <div
              className="mt-8 text-xs leading-relaxed max-w-md mx-auto italic"
              style={{ color: '#4a3a1a', fontFamily: 'monospace' }}
            >
              <p>«Если ты не аккуратен и выскользнешь из реальности</p>
              <p>в неположенном месте, ты окажешься в Backrooms,</p>
              <p>где нет ничего, кроме запаха старого влажного ковра,</p>
              <p>жёлтых стен и бесконечного гудения</p>
              <p>флуоресцентных ламп...»</p>
            </div>
          </div>
        </div>
      )}

      {/* HUD during gameplay */}
      {gameState === 'playing' && (
        <>
          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="relative">
              <div className="w-[2px] h-4 bg-white/30 absolute -translate-x-1/2 -translate-y-full" />
              <div className="w-[2px] h-4 bg-white/30 absolute -translate-x-1/2" style={{ top: '2px' }} />
              <div className="h-[2px] w-4 bg-white/30 absolute -translate-y-1/2" style={{ left: '2px' }} />
              <div className="h-[2px] w-4 bg-white/30 absolute -translate-y-1/2 -translate-x-full" />
            </div>
          </div>

           {/* Timer + Level */}
          <div
            className="absolute top-4 right-4 z-10 px-4 py-2 border flex flex-col items-end gap-1"
            style={{
              fontFamily: 'monospace',
              color: '#c4a84a',
              background: 'rgba(0,0,0,0.5)',
              borderColor: 'rgba(196,168,74,0.3)',
              letterSpacing: '0.1em',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#8a7a5a' }}>УРОВЕНЬ {level}</div>
            <div style={{ fontSize: '1.2rem' }}>⏱ {formatTime(timer)}</div>
          </div>

          {/* Spider distance indicator */}
          <div
            className="absolute top-4 left-4 z-10 px-3 py-2 border"
            style={{
              fontFamily: 'monospace',
              background: 'rgba(0,0,0,0.5)',
              borderColor: spiderDist < 5
                ? 'rgba(255,34,34,0.6)'
                : spiderDist < 12
                  ? 'rgba(255,160,34,0.4)'
                  : 'rgba(196,168,74,0.2)',
              letterSpacing: '0.05em',
              transition: 'border-color 0.3s',
            }}
          >
            <div style={{ fontSize: '0.65rem', color: '#8a7a5a', marginBottom: '2px' }}>🕷 МОНСТР</div>
            <div
              style={{
                fontSize: '1rem',
                fontWeight: 'bold',
                color: spiderDist < 5
                  ? '#ff2222'
                  : spiderDist < 12
                    ? '#ffaa22'
                    : '#c4a84a',
                textShadow: spiderDist < 5
                  ? '0 0 8px rgba(255,34,34,0.6)'
                  : 'none',
                transition: 'color 0.3s',
              }}
            >
              {spiderDist < 3
                ? '!!! РЯДОМ !!!'
                : spiderDist < 8
                  ? `≈ ${Math.round(spiderDist)} м`
                  : spiderDist < 20
                    ? `≈ ${Math.round(spiderDist)} м`
                    : 'далеко'}
            </div>
          </div>

          {/* AI mode indicator */}
          {aiMode && (
            <div
              className="absolute top-24 left-4 z-10 px-3 py-1 border"
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#6688cc',
                background: 'rgba(0,0,0,0.5)',
                borderColor: 'rgba(100,140,255,0.3)',
                textShadow: '0 0 6px rgba(100,140,255,0.5)',
              }}
            >
              🤖 ИИ УПРАВЛЯЕТ &nbsp;│&nbsp; P — отключить
            </div>
          )}

          {/* Controls hint */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-xs pointer-events-none px-3 py-1"
            style={{
              fontFamily: 'monospace',
              color: '#6a5a3a',
              background: 'rgba(0,0,0,0.3)',
            }}
          >
            Клик — захватить мышь &nbsp;│&nbsp; M — карта &nbsp;│&nbsp; F — фонарик &nbsp;│&nbsp; P — ИИ
          </div>

          {/* Minimap */}
          <Minimap game={gameRef.current} visible={showMinimap} />
        </>
      )}

      {/* Win Screen */}
      {gameState === 'won' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="absolute inset-0 bg-black/85" />
          <div className="relative z-20 text-center px-4">
            <div className="mb-6">
              <div
                className="text-5xl sm:text-6xl md:text-7xl font-bold mb-2 tracking-wider animate-pulse"
                style={{
                  color: '#00ff88',
                  textShadow: '0 0 40px rgba(0,255,136,0.6), 0 0 80px rgba(0,255,136,0.3)',
                  fontFamily: 'monospace',
                }}
              >
                ВЫХОД НАЙДЕН
              </div>
              <div
                className="text-lg"
                style={{
                  color: '#00cc66',
                  fontFamily: 'monospace',
                }}
              >
                ═══════════════
              </div>
            </div>

            <p
              className="text-xl sm:text-2xl mb-1"
              style={{ color: '#c4a84a', fontFamily: 'monospace' }}
            >
              Уровень {level} пройден!
            </p>
            <p
              className="text-sm mb-4"
              style={{ color: '#8a7a5a', fontFamily: 'monospace' }}
            >
              Ты сбежал из Backrooms
            </p>
            <p
              className="text-3xl sm:text-4xl font-bold mb-8"
              style={{
                color: '#ffe4a0',
                fontFamily: 'monospace',
                textShadow: '0 0 10px rgba(255,228,160,0.3)',
              }}
            >
              ⏱ {formatTime(timer)}
            </p>

            <button
              onClick={handleRestart}
              className="px-10 py-4 text-xl font-bold tracking-wider transition-all duration-300 cursor-pointer border-2 hover:scale-105"
              style={{
                background: 'rgba(0,255,136,0.08)',
                borderColor: '#00ff88',
                color: '#00ff88',
                fontFamily: 'monospace',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,255,136,0.2)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(0,255,136,0.3), inset 0 0 20px rgba(0,255,136,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0,255,136,0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ▶ УРОВЕНЬ {level + 1}
            </button>

            {aiMode && aiCountdown > 0 && (
              <p
                className="mt-3 text-sm"
                style={{ color: '#6688cc', fontFamily: 'monospace', textShadow: '0 0 8px rgba(100,140,255,0.5)' }}
              >
                🤖 ИИ продолжит через {aiCountdown}...
              </p>
            )}

            <p
              className="mt-4 text-xs"
              style={{ color: '#c4a84a', fontFamily: 'monospace' }}
            >
              {level < 6
                ? `Следующий лабиринт будет больше: ${Math.min(20, 10 + level * 2)}×${Math.min(20, 10 + level * 2)}`
                : 'Максимальный размер лабиринта достигнут'}
            </p>
            <p
              className="mt-2 text-xs"
              style={{ color: '#4a3a1a', fontFamily: 'monospace' }}
            >
              ...но вернёшься ли ты в реальность?
            </p>
          </div>
        </div>
      )}

      {/* Caught / Death Screen */}
      {gameState === 'caught' && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="absolute inset-0 bg-black/90" />
          <div className="relative z-20 text-center px-4">
            {/* Spider silhouette using text */}
            <div
              className="text-7xl sm:text-8xl mb-4"
              style={{ filter: 'drop-shadow(0 0 20px rgba(255,0,0,0.5))' }}
            >
              🕷️
            </div>

            <div
              className="text-4xl sm:text-5xl md:text-6xl font-bold mb-3 tracking-wider"
              style={{
                color: '#ff2222',
                textShadow: '0 0 30px rgba(255,0,0,0.6), 0 0 60px rgba(255,0,0,0.3)',
                fontFamily: 'monospace',
              }}
            >
              ОНО ТЕБЯ ПОЙМАЛО
            </div>
            <div
              className="text-lg mb-6"
              style={{
                color: '#882222',
                fontFamily: 'monospace',
              }}
            >
              ═══════════════
            </div>

            <p
              className="text-lg sm:text-xl mb-1"
              style={{ color: '#aa4444', fontFamily: 'monospace' }}
            >
              Уровень {level} — попробуй снова
            </p>
            <p
              className="text-sm mb-8"
              style={{ color: '#663333', fontFamily: 'monospace' }}
            >
              В следующий раз — не смотри на него...
            </p>

            <button
              onClick={handleRetry}
              className="px-10 py-4 text-xl font-bold tracking-wider transition-all duration-300 cursor-pointer border-2 hover:scale-105"
              style={{
                background: 'rgba(255,34,34,0.08)',
                borderColor: '#ff2222',
                color: '#ff2222',
                fontFamily: 'monospace',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,34,34,0.2)';
                e.currentTarget.style.boxShadow = '0 0 30px rgba(255,34,34,0.3), inset 0 0 20px rgba(255,34,34,0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,34,34,0.08)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              ▶ ПОПРОБОВАТЬ СНОВА
            </button>

            {aiMode && aiCountdown > 0 && (
              <p
                className="mt-3 text-sm"
                style={{ color: '#6688cc', fontFamily: 'monospace', textShadow: '0 0 8px rgba(100,140,255,0.5)' }}
              >
                🤖 ИИ повторит через {aiCountdown}...
              </p>
            )}

            <p
              className="mt-6 text-xs"
              style={{ color: '#441111', fontFamily: 'monospace' }}
            >
              Оно всё ещё бродит по коридорам...
            </p>
          </div>
        </div>
      )}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.7) 100%)',
        }}
      />

      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[5]"
        style={{
          background:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
          opacity: 0.15,
        }}
      />
    </div>
  );
}

export default App;
