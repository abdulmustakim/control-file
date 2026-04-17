/**
 * game.js — Gesture-Controlled Catch Game
 * Use your hand to catch falling objects!
 *
 * VOCABULARY:
 * "entity"     = any game object (player, enemy, item)
 * "hitbox"     = the invisible rectangle/circle used for collision detection
 * "spawn rate" = how often new objects appear
 * "velocity"   = speed + direction of movement
 */

class CatchGame {
  constructor() {
    this.canvas    = document.getElementById('game-canvas');
    this.ctx       = this.canvas.getContext('2d');
    this.isRunning = false;
    this.gameOver  = false;

    // Game state
    this.score      = 0;
    this.lives      = 3;
    this.timeLeft   = 60;
    this.difficulty = 'medium';
    this.level      = 1;

    // Player (hand-controlled paddle)
    this.player = { x: 0.5, y: 0.85, width: 0.12, height: 0.03 };

    // Falling objects
    this.objects = [];
    this.particles = []; // Visual effects

    // Spawn control
    this.spawnTimer    = 0;
    this.spawnInterval = 90; // Frames between spawns

    // Timer countdown
    this.timerInterval = null;

    // Hand position from tracking
    this.handX = 0.5;
    this.handY = 0.5;

    // Object types
    this.objectTypes = [
      { emoji: '⭐', points: 1,   speed: 0.004, color: '#ffd700', label: 'Star'    },
      { emoji: '💎', points: 3,   speed: 0.006, color: '#00f5ff', label: 'Gem'     },
      { emoji: '🔥', points: 5,   speed: 0.008, color: '#ff6b00', label: 'Fire'    },
      { emoji: '💣', points: -2,  speed: 0.005, color: '#ff0000', label: 'Bomb',  dodge: true },
      { emoji: '❄️', points: 0,   speed: 0.003, color: '#a0d8ef', label: 'Ice',   freeze: true },
      { emoji: '🌟', points: 10,  speed: 0.01,  color: '#fffacd', label: 'Bonus'  },
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupGestures();
    this.drawIdleScreen();
  }

  resize() {
    const wrapper = document.getElementById('game-canvas-wrapper');
    if (!wrapper) return;
    this.canvas.width  = wrapper.offsetWidth;
    this.canvas.height = wrapper.offsetHeight;
  }

  // ── Game Control ────────────────────────────────────────────

  startGame() {
    this.score   = 0;
    this.lives   = 3;
    this.timeLeft = this.difficulty === 'easy' ? 90 : this.difficulty === 'hard' ? 30 : 60;
    this.level   = 1;
    this.objects = [];
    this.particles = [];
    this.gameOver = false;
    this.spawnInterval = this.difficulty === 'easy' ? 120 : this.difficulty === 'hard' ? 50 : 80;

    document.getElementById('game-over-screen')?.classList.remove('visible');
    this._startTimer();

    if (!this.isRunning) {
      this.isRunning = true;
      this._gameLoop();
    }

    window.gestureToast?.show('🎮 GAME STARTED!');
  }

  stopGame() {
    this.isRunning = false;
    clearInterval(this.timerInterval);
  }

  _endGame() {
    this.gameOver = true;
    clearInterval(this.timerInterval);

    // Show game over screen
    const screen = document.getElementById('game-over-screen');
    if (screen) {
      screen.classList.add('visible');
      screen.querySelector('.final-score').textContent = this.score;
      screen.querySelector('.game-over-msg').textContent =
        this.score > 50 ? '🔥 INCREDIBLE!' :
        this.score > 20 ? '⭐ GREAT JOB!'  : '💪 KEEP TRYING!';
    }
  }

  _startTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      const el = document.querySelector('.hud-timer');
      if (el) el.textContent = `⏱ ${this.timeLeft}s`;

      // Level up every 20 seconds
      if (this.timeLeft % 20 === 0 && this.timeLeft > 0) {
        this.level++;
        this.spawnInterval = Math.max(30, this.spawnInterval - 10);
        window.gestureToast?.show(`⬆ LEVEL ${this.level}!`);
      }

      if (this.timeLeft <= 0) this._endGame();
    }, 1000);
  }

  // ── Main Game Loop ──────────────────────────────────────────

  _gameLoop() {
    if (!this.isRunning) return;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#050815';
    ctx.fillRect(0, 0, W, H);

    // Scan line effect
    this._drawScanLines();

    // Spawn objects
    this.spawnTimer++;
    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer = 0;
      this._spawnObject();
    }

    // Update & draw objects
    this._updateObjects();

    // Update & draw particles
    this._updateParticles();

    // Draw player paddle
    this._drawPlayer();

    // Draw HUD
    this._drawHUD();

    if (!this.gameOver) {
      requestAnimationFrame(() => this._gameLoop());
    }
  }

  _spawnObject() {
    // Pick a random object type (weight towards simpler ones)
    const weights = [40, 25, 15, 12, 5, 3];
    const rand    = Math.random() * 100;
    let cumulative = 0;
    let typeIdx = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i];
      if (rand < cumulative) { typeIdx = i; break; }
    }

    const type = this.objectTypes[typeIdx];
    const speedMultiplier = 1 + (this.level - 1) * 0.2;

    this.objects.push({
      x:     0.05 + Math.random() * 0.9,
      y:     -0.05,
      vx:    (Math.random() - 0.5) * 0.002,
      vy:    type.speed * speedMultiplier,
      size:  0.04 + Math.random() * 0.02,
      ...type,
      rotation: 0,
      rotSpeed: (Math.random() - 0.5) * 0.1,
    });
  }

  _updateObjects() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    this.objects = this.objects.filter(obj => {
      // Move
      obj.x += obj.vx;
      obj.y += obj.vy;
      obj.rotation += obj.rotSpeed;

      // Bounce off walls
      if (obj.x < 0.02 || obj.x > 0.98) obj.vx *= -1;

      // Draw object
      ctx.save();
      ctx.translate(obj.x * W, obj.y * H);
      ctx.rotate(obj.rotation);
      ctx.font = `${obj.size * W}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Glow effect
      ctx.shadowColor = obj.color;
      ctx.shadowBlur  = 15;
      ctx.fillText(obj.emoji, 0, 0);
      ctx.restore();

      // Check collision with player paddle
      const px = this.player.x;
      const py = this.player.y;
      const pw = this.player.width;
      const ph = this.player.height;

      const caught =
        obj.x > px - pw / 2 && obj.x < px + pw / 2 &&
        obj.y > py - ph     && obj.y < py + ph;

      if (caught) {
        this._onCatch(obj);
        return false; // Remove object
      }

      // Remove if off-screen
      if (obj.y > 1.1) {
        if (!obj.dodge) {
          // Missed a good object
          this._spawnParticles(obj.x * W, H, '#ff4444', 5);
        }
        return false;
      }

      return true;
    });
  }

  _onCatch(obj) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (obj.dodge) {
      // Caught a bomb!
      this.lives--;
      this._spawnParticles(obj.x * W, obj.y * H, '#ff0000', 20);
      this._shakeCanvas();
      if (this.lives <= 0) this._endGame();
    } else if (obj.freeze) {
      // Ice — slows all objects temporarily
      this.objects.forEach(o => { o.vy *= 0.3; });
      setTimeout(() => { this.objects.forEach(o => { o.vy *= 3.33; }); }, 2000);
      this._spawnParticles(obj.x * W, obj.y * H, '#a0d8ef', 15);
    } else {
      this.score += obj.points;
      this._spawnParticles(obj.x * W, obj.y * H, obj.color, 12);

      // Update score display
      const scoreEl = document.querySelector('.hud-score');
      if (scoreEl) scoreEl.textContent = `⭐ ${this.score}`;
    }
  }

  _drawPlayer() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Smoothly follow hand position
    this.player.x += (this.handX - this.player.x) * 0.2;

    const px = this.player.x * W;
    const py = this.player.y * H;
    const pw = this.player.width * W;
    const ph = this.player.height * H;

    // Paddle glow
    const gradient = ctx.createLinearGradient(px - pw/2, py, px + pw/2, py + ph);
    gradient.addColorStop(0, 'rgba(0,245,255,0.8)');
    gradient.addColorStop(1, 'rgba(0,100,255,0.8)');

    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur  = 20;

    ctx.beginPath();
    ctx.roundRect(px - pw/2, py, pw, ph, 6);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Paddle border
    ctx.strokeStyle = 'rgba(0,245,255,1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  _drawHUD() {
    const ctx = this.ctx;
    const W = this.canvas.width;

    // Lives display
    const livesEl = document.querySelector('.hud-lives');
    if (livesEl) {
      livesEl.textContent = '❤️'.repeat(this.lives) + '🖤'.repeat(Math.max(0, 3 - this.lives));
    }
  }

  _drawScanLines() {
    const ctx = this.ctx;
    const H = this.canvas.height;
    const W = this.canvas.width;

    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 2);
    }
  }

  _drawIdleScreen() {
    const ctx = this.ctx;
    const W = this.canvas.width || 600;
    const H = this.canvas.height || 450;

    ctx.fillStyle = '#050815';
    ctx.fillRect(0, 0, W, H);

    ctx.font = 'bold 1.5rem Orbitron, monospace';
    ctx.fillStyle = 'rgba(0,245,255,0.7)';
    ctx.textAlign = 'center';
    ctx.fillText('GESTURE CATCH', W/2, H/2 - 20);

    ctx.font = '1rem Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('Press START or show OPEN PALM', W/2, H/2 + 20);
  }

  // ── Particles ───────────────────────────────────────────────

  _spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 2,
        color,
        life: 1,
        size: Math.random() * 4 + 2,
      });
    }
  }

  _updateParticles() {
    const ctx = this.ctx;
    this.particles = this.particles.filter(p => {
      p.x   += p.vx;
      p.y   += p.vy;
      p.vy  += 0.2; // Gravity
      p.life -= 0.03;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color + Math.round(p.life * 255).toString(16).padStart(2,'0');
      ctx.fill();

      return p.life > 0;
    });
  }

  _shakeCanvas() {
    const wrapper = document.getElementById('game-canvas-wrapper');
    if (!wrapper) return;
    wrapper.style.transform = 'translateX(-5px)';
    setTimeout(() => { wrapper.style.transform = 'translateX(5px)'; }, 50);
    setTimeout(() => { wrapper.style.transform = 'translateX(-3px)'; }, 100);
    setTimeout(() => { wrapper.style.transform = 'translateX(0)'; }, 150);
  }

  // ── Gesture Setup ───────────────────────────────────────────

  setupGestures() {
    const engine = window.trackingEngine;
    if (!engine) return;

    engine.on('handUpdate', ({ landmarks }) => {
      const center = engine.getHandCenter(landmarks);
      // Mirror the X axis (camera is mirrored)
      this.handX = 1 - center.x;
    });

    engine.on('gesture', ({ gesture }) => {
      if (gesture === 'OPEN_PALM' && !this.isRunning) {
        this.startGame();
      }
      if (gesture === 'FIST' && this.isRunning) {
        this.stopGame();
      }
    });
  }

  setDifficulty(level) {
    this.difficulty = level;
    document.querySelectorAll('.diff-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.diff === level);
    });
  }
}

window.catchGame = null;
document.addEventListener('DOMContentLoaded', () => {
  window.catchGame = new CatchGame();
});
