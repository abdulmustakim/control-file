/**
 * micro.js — Micro-World Simulation
 * Control atoms, cells, and particles with your hands
 *
 * VOCABULARY:
 * "particle" = a tiny object that moves based on physics rules
 * "Brownian motion" = random microscopic movement of particles
 * "electrostatic" = force between charged particles
 * "nucleus" = the center of an atom
 */

class MicroWorld {
  constructor() {
    this.canvas  = document.getElementById('micro-canvas');
    this.ctx     = this.canvas.getContext('2d');

    this.isRunning = false;
    this.mode      = 'atoms'; // 'atoms' | 'cells' | 'particles'
    this.scale     = 1; // 1=nano, 5=micro, 10=macro

    // Particles/atoms/cells
    this.entities  = [];
    this.grabbed   = null; // Currently grabbed entity index

    // Hand state
    this.handX     = 0.5;
    this.handY     = 0.5;
    this.isPinching = false;
    this.pinchDist  = 0;
    this.lastPinchDist = null;

    // Physics
    this.gravity   = 0;
    this.brownianStrength = 0.3;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupGestures();
    this.spawnAtoms();
    this.start();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.canvas.width  = parent.offsetWidth;
    this.canvas.height = parent.offsetHeight;
  }

  // ── Entity Spawning ──────────────────────────────────────────

  spawnAtoms() {
    this.entities = [];
    const W = this.canvas.width || 800;
    const H = this.canvas.height || 600;

    const atoms = [
      { symbol: 'H', color: '#ffffff', electrons: 1,  mass: 1,  charge: '+1' },
      { symbol: 'O', color: '#ff4444', electrons: 8,  mass: 16, charge: '-2' },
      { symbol: 'C', color: '#aaaaaa', electrons: 6,  mass: 12, charge: '±4' },
      { symbol: 'N', color: '#4444ff', electrons: 7,  mass: 14, charge: '-3' },
      { symbol: 'He',color: '#ffff44', electrons: 2,  mass: 4,  charge:  '0' },
    ];

    for (let i = 0; i < 12; i++) {
      const atom = atoms[i % atoms.length];
      this.entities.push({
        x:    0.1 + Math.random() * 0.8,
        y:    0.15 + Math.random() * 0.7,
        vx:   (Math.random() - 0.5) * 0.003,
        vy:   (Math.random() - 0.5) * 0.003,
        ...atom,
        radius: 0.025 + Math.random() * 0.015,
        angle:  Math.random() * Math.PI * 2,
        type:  'atom',
        grabbed: false,
        glowColor: atom.color,
        electronAngle: Math.random() * Math.PI * 2,
      });
    }
  }

  spawnCells() {
    this.entities = [];
    const cells = [
      { name: 'Red Blood Cell',    color: '#ff6b6b', emoji: '🔴', radius: 0.04 },
      { name: 'White Blood Cell',  color: '#ffffff', emoji: '⚪', radius: 0.05 },
      { name: 'Bacterium',         color: '#90ee90', emoji: '🟢', radius: 0.02 },
      { name: 'Neuron',            color: '#87ceeb', emoji: '🔵', radius: 0.035 },
      { name: 'Virus Particle',    color: '#da70d6', emoji: '🟣', radius: 0.015 },
    ];

    for (let i = 0; i < 8; i++) {
      const cell = cells[i % cells.length];
      this.entities.push({
        x:    0.1 + Math.random() * 0.8,
        y:    0.15 + Math.random() * 0.7,
        vx:   (Math.random() - 0.5) * 0.002,
        vy:   (Math.random() - 0.5) * 0.002,
        ...cell,
        type: 'cell',
        pulsation: Math.random() * Math.PI * 2,
        grabbed: false,
      });
    }
  }

  spawnParticles() {
    this.entities = [];
    for (let i = 0; i < 40; i++) {
      this.entities.push({
        x:     0.05 + Math.random() * 0.9,
        y:     0.05 + Math.random() * 0.9,
        vx:    (Math.random() - 0.5) * 0.005,
        vy:    (Math.random() - 0.5) * 0.005,
        radius: 0.008 + Math.random() * 0.012,
        color: `hsl(${Math.random() * 360}, 80%, 60%)`,
        type:  'particle',
        charge: Math.random() > 0.5 ? 1 : -1,
        grabbed: false,
        trail: [],
      });
    }
  }

  // ── Main Draw Loop ──────────────────────────────────────────

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._draw();
  }

  _draw() {
    if (!this.isRunning) return;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Background
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, W, H);

    // Grid overlay (microscope look)
    this._drawGrid();

    // Update and draw all entities
    this.entities.forEach((e, i) => {
      this._updateEntity(e, i);
      this._drawEntity(e);
    });

    // Render scale indicator
    this._drawScaleIndicator();

    // Hand cursor
    this._drawHandCursor();

    requestAnimationFrame(() => this._draw());
  }

  _drawGrid() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const step = 60;

    ctx.strokeStyle = 'rgba(0,245,255,0.04)';
    ctx.lineWidth = 1;

    for (let x = 0; x < W; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Center crosshair
    ctx.strokeStyle = 'rgba(0,245,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.stroke();
  }

  _updateEntity(e, idx) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    if (e.grabbed) {
      // Follow hand position
      e.x += (this.handX - e.x) * 0.3;
      e.y += (this.handY - e.y) * 0.3;
      e.vx = 0;
      e.vy = 0;
    } else {
      // Brownian motion (random tiny movements)
      e.vx += (Math.random() - 0.5) * this.brownianStrength * 0.001;
      e.vy += (Math.random() - 0.5) * this.brownianStrength * 0.001;

      // Apply gravity
      e.vy += this.gravity * 0.0001;

      // Damping (slow down over time)
      e.vx *= 0.99;
      e.vy *= 0.99;

      // Particle-particle interaction
      if (e.type === 'particle') {
        this.entities.forEach((other, j) => {
          if (j === idx || !other) return;
          const dx = other.x - e.x;
          const dy = other.y - e.y;
          const dist = Math.sqrt(dx*dx + dy*dy) + 0.001;
          if (dist < 0.15) {
            // Electrostatic: same charge = repel, opposite = attract
            const force = (e.charge * (other.charge || 0)) * -0.00002 / (dist * dist);
            e.vx += (dx / dist) * force;
            e.vy += (dy / dist) * force;
          }
        });
      }

      e.x += e.vx;
      e.y += e.vy;

      // Bounce off walls
      if (e.x < e.radius || e.x > 1 - e.radius) e.vx *= -0.8;
      if (e.y < e.radius || e.y > 1 - e.radius) e.vy *= -0.8;
      e.x = Math.max(e.radius, Math.min(1 - e.radius, e.x));
      e.y = Math.max(e.radius, Math.min(1 - e.radius, e.y));
    }

    // Angle rotation
    if (e.angle !== undefined) e.angle += 0.01;
    if (e.electronAngle !== undefined) e.electronAngle += 0.05;
    if (e.pulsation !== undefined) e.pulsation += 0.02;
  }

  _drawEntity(e) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const x = e.x * W;
    const y = e.y * H;
    const r = e.radius * Math.min(W, H);

    if (e.type === 'atom') this._drawAtom(e, x, y, r);
    else if (e.type === 'cell') this._drawCell(e, x, y, r);
    else this._drawParticle(e, x, y, r);
  }

  _drawAtom(atom, x, y, r) {
    const ctx = this.ctx;

    // Nucleus
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = atom.grabbed ? '#00f5ff' : atom.color;
    ctx.shadowColor = atom.color;
    ctx.shadowBlur = atom.grabbed ? 30 : 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Symbol
    ctx.font = `bold ${r * 1.2}px JetBrains Mono, monospace`;
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(atom.symbol, x, y);

    // Electron orbit
    const orbitR = r * 2.5;
    ctx.beginPath();
    ctx.ellipse(x, y, orbitR, orbitR * 0.4, atom.angle, 0, Math.PI * 2);
    ctx.strokeStyle = `${atom.color}50`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Electron dot
    const ex = x + Math.cos(atom.electronAngle) * orbitR;
    const ey = y + Math.sin(atom.electronAngle) * orbitR * 0.4;
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#00f5ff';
    ctx.fill();
  }

  _drawCell(cell, x, y, r) {
    const ctx = this.ctx;
    const pulse = 1 + 0.05 * Math.sin(cell.pulsation);

    ctx.beginPath();
    ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
    ctx.fillStyle = cell.color + '40';
    ctx.strokeStyle = cell.grabbed ? '#00f5ff' : cell.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = cell.color;
    ctx.shadowBlur = cell.grabbed ? 30 : 8;
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cell membrane detail
    ctx.beginPath();
    ctx.arc(x, y, r * pulse * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = cell.color + '60';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Name label
    ctx.font = `${r * 0.7}px Rajdhani, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(cell.name.split(' ')[0], x, y + r * 1.6);
  }

  _drawParticle(p, x, y, r) {
    const ctx = this.ctx;

    // Trail
    if (p.trail) {
      p.trail.push({ x, y });
      if (p.trail.length > 8) p.trail.shift();
      p.trail.forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r * (i / p.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round((i / p.trail.length) * 80).toString(16).padStart(2,'0');
        ctx.fill();
      });
    }

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = p.grabbed ? '#00f5ff' : p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = p.grabbed ? 25 : 6;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Charge indicator
    ctx.font = `${r}px Arial`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(p.charge > 0 ? '+' : '−', x, y + r * 0.4);
  }

  _drawScaleIndicator() {
    const ctx = this.ctx;
    const W = this.canvas.width;

    const labels = ['1nm', '10nm', '100nm', '1μm', '10μm'];
    const label  = labels[Math.min(4, Math.floor(this.scale / 2))];

    const el = document.getElementById('scale-display');
    if (el) el.textContent = `SCALE: ${label}`;
  }

  _drawHandCursor() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const x = this.handX * W;
    const y = this.handY * H;

    const color = this.isPinching ? '#00ff88' : '#00f5ff';
    const size  = this.isPinching ? 8 : 16;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 15;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.stroke();

    if (this.isPinching) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }

  // ── Gesture Control ─────────────────────────────────────────

  setupGestures() {
    const engine = window.trackingEngine;
    if (!engine) return;

    engine.on('handUpdate', ({ landmarks }) => {
      this.handX = landmarks[0].x; // Use wrist position
      this.handY = landmarks[0].y;

      const pinch = engine.getPinchDistance(landmarks);
      const wasPinching = this.isPinching;
      this.isPinching = pinch < 0.06;

      // Grab nearest entity on pinch start
      if (this.isPinching && !wasPinching) {
        let nearest = null;
        let minDist = 0.1;

        this.entities.forEach((e, i) => {
          const dx = e.x - this.handX;
          const dy = e.y - this.handY;
          const d  = Math.sqrt(dx*dx + dy*dy);
          if (d < minDist) { minDist = d; nearest = i; }
        });

        if (nearest !== null) {
          this.grabbed = nearest;
          this.entities[nearest].grabbed = true;
        }
      }

      // Release on open palm
      if (!this.isPinching && wasPinching && this.grabbed !== null) {
        this.entities[this.grabbed].grabbed = false;
        // Give velocity based on hand movement
        this.entities[this.grabbed].vx = (this.handX - this.entities[this.grabbed].x) * 0.1;
        this.entities[this.grabbed].vy = (this.handY - this.entities[this.grabbed].y) * 0.1;
        this.grabbed = null;
      }

      // Pinch zoom for scale
      if (this.lastPinchDist !== null) {
        const delta = pinch - this.lastPinchDist;
        if (Math.abs(delta) > 0.01) {
          this.scale = Math.max(1, Math.min(10, this.scale + delta * 10));
          const el = document.getElementById('scale-display');
          if (el) el.textContent = `SCALE: ${this.scale.toFixed(1)}×`;
        }
      }
      this.lastPinchDist = pinch;
    });

    engine.on('gesture', ({ gesture }) => {
      if (gesture === 'OPEN_PALM') {
        // Spread all entities outward
        const cx = 0.5, cy = 0.5;
        this.entities.forEach(e => {
          const dx = e.x - cx;
          const dy = e.y - cy;
          const d  = Math.sqrt(dx*dx + dy*dy) + 0.01;
          e.vx += (dx / d) * 0.008;
          e.vy += (dy / d) * 0.008;
        });
      }
    });
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'atoms')     this.spawnAtoms();
    else if (mode === 'cells') this.spawnCells();
    else                       this.spawnParticles();

    window.gestureToast?.show(`🔬 Mode: ${mode.toUpperCase()}`);
  }

  toggleGravity() {
    this.gravity = this.gravity === 0 ? 1 : 0;
  }
}

window.microWorld = null;
document.addEventListener('DOMContentLoaded', () => {
  // Initialize when page is active
});
