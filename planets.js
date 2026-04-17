/**
 * planets.js — Gesture-Controlled Solar System Simulation
 * Uses Canvas 2D API for rendering
 *
 * VOCABULARY:
 * "orbital period" = time for a planet to complete one full orbit
 * "eccentricity"   = how oval-shaped an orbit is (0=circle, 1=line)
 * "inclination"    = tilt angle of orbit
 * "scale"          = size ratio (zoom level)
 */

class SolarSystem {
  constructor() {
    this.canvas  = document.getElementById('planet-canvas');
    this.ctx     = this.canvas.getContext('2d');

    // View state
    this.zoom    = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.rotation= 0; // Overall system rotation

    // Interaction state
    this.selectedPlanet = null;
    this.handX = 0.5;
    this.handY = 0.5;
    this.pinchDist = null;
    this.lastPinch  = null;

    // Simulation speed (1.0 = real-time proportional)
    this.speed = 1.0;
    this.mode  = 'learning'; // 'learning' | 'physics' | 'fun'
    this.time  = 0;

    // Animation
    this.animId = null;
    this.isRunning = false;

    // Planet data (real relative values)
    this.planets = [
      {
        name: 'Mercury', color: '#b5b5b5', radius: 4,
        orbitRadius: 80,  period: 88,    emoji: '🪨',
        mass: '3.3×10²³ kg', gravity: '3.7 m/s²',
        temp: '430°C',    moons: 0,       info: 'Closest to the Sun'
      },
      {
        name: 'Venus',   color: '#e8cda0', radius: 9,
        orbitRadius: 130, period: 225,   emoji: '🌕',
        mass: '4.9×10²⁴ kg', gravity: '8.9 m/s²',
        temp: '465°C',    moons: 0,       info: 'Hottest planet'
      },
      {
        name: 'Earth',   color: '#4fc3f7', radius: 10,
        orbitRadius: 185, period: 365,   emoji: '🌍',
        mass: '5.97×10²⁴ kg', gravity: '9.8 m/s²',
        temp: '15°C',     moons: 1,       info: 'Our home world'
      },
      {
        name: 'Mars',    color: '#ef5350', radius: 7,
        orbitRadius: 245, period: 687,   emoji: '🔴',
        mass: '6.4×10²³ kg', gravity: '3.7 m/s²',
        temp: '-60°C',    moons: 2,       info: 'The Red Planet'
      },
      {
        name: 'Jupiter', color: '#f4a460', radius: 26,
        orbitRadius: 340, period: 4333,  emoji: '🟠',
        mass: '1.9×10²⁷ kg', gravity: '24.8 m/s²',
        temp: '-110°C',   moons: 95,      info: 'Largest planet'
      },
      {
        name: 'Saturn',  color: '#c8a96e', radius: 22,
        orbitRadius: 430, period: 10759, emoji: '🪐',
        mass: '5.7×10²⁶ kg', gravity: '10.4 m/s²',
        temp: '-140°C',   moons: 146,     info: 'Has famous rings'
      },
      {
        name: 'Uranus',  color: '#80deea', radius: 16,
        orbitRadius: 510, period: 30687, emoji: '🔵',
        mass: '8.7×10²⁵ kg', gravity: '8.7 m/s²',
        temp: '-195°C',   moons: 28,      info: 'Rotates on its side'
      },
      {
        name: 'Neptune', color: '#1565c0', radius: 15,
        orbitRadius: 580, period: 60190, emoji: '🔵',
        mass: '1.0×10²⁶ kg', gravity: '11.2 m/s²',
        temp: '-200°C',   moons: 16,      info: 'Windiest planet'
      },
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupGestures();
    this.setupMouseFallback();
    this.start();
  }

  resize() {
    this.canvas.width  = this.canvas.parentElement.offsetWidth  || window.innerWidth;
    this.canvas.height = this.canvas.parentElement.offsetHeight || window.innerHeight;
    this.cx = this.canvas.width  / 2;
    this.cy = this.canvas.height / 2;
  }

  // ── Main Draw Loop ──────────────────────────────────────────

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._draw();
  }

  stop() {
    this.isRunning = false;
    if (this.animId) cancelAnimationFrame(this.animId);
  }

  _draw() {
    if (!this.isRunning) return;

    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Clear with space background
    ctx.fillStyle = '#020408';
    ctx.fillRect(0, 0, W, H);

    // Draw starfield
    this._drawStars();

    // Apply zoom and offset transforms
    ctx.save();
    ctx.translate(this.cx + this.offsetX, this.cy + this.offsetY);
    ctx.rotate(this.rotation);
    ctx.scale(this.zoom, this.zoom);

    // Draw orbits
    this.planets.forEach(p => this._drawOrbit(p));

    // Draw Sun
    this._drawSun();

    // Draw planets
    this.planets.forEach(p => this._drawPlanet(p));

    // Hand cursor
    this._drawHandCursor();

    ctx.restore();

    // Advance time
    this.time += 0.005 * this.speed;

    this.animId = requestAnimationFrame(() => this._draw());
  }

  _drawStars() {
    // Static starfield (seed-based to avoid flicker)
    if (!this._stars) {
      this._stars = Array.from({ length: 200 }, () => ({
        x: Math.random() * 2000 - 1000,
        y: Math.random() * 2000 - 1000,
        size: Math.random() * 1.5 + 0.5,
        brightness: Math.random()
      }));
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.cx, this.cy);

    this._stars.forEach(s => {
      const flicker = 0.7 + 0.3 * Math.sin(this.time * 2 + s.x);
      ctx.fillStyle = `rgba(255,255,255,${s.brightness * flicker * 0.8})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  _drawOrbit(planet) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(0, 0, planet.orbitRadius, 0, Math.PI * 2);
    ctx.strokeStyle = this.selectedPlanet?.name === planet.name
      ? 'rgba(0,245,255,0.4)' : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = this.selectedPlanet?.name === planet.name ? 2 : 1;
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawSun() {
    const ctx = this.ctx;

    // Sun glow
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    gradient.addColorStop(0,   'rgba(255,220,50,1)');
    gradient.addColorStop(0.4, 'rgba(255,160,0,0.9)');
    gradient.addColorStop(0.7, 'rgba(255,80,0,0.3)');
    gradient.addColorStop(1,   'rgba(255,0,0,0)');

    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Solar corona pulses
    const pSize = 55 + 5 * Math.sin(this.time * 3);
    ctx.beginPath();
    ctx.arc(0, 0, pSize, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,180,0,0.15)';
    ctx.lineWidth = 8;
    ctx.stroke();
  }

  _drawPlanet(planet) {
    const ctx = this.ctx;

    // Calculate planet position using circular orbit formula
    const angle = (this.time / planet.period) * Math.PI * 2;
    const x = Math.cos(angle) * planet.orbitRadius;
    const y = Math.sin(angle) * planet.orbitRadius;

    // Store current position for click detection
    planet.currentX = x;
    planet.currentY = y;

    const isSelected = this.selectedPlanet?.name === planet.name;

    // Planet glow when selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, planet.radius + 10, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,245,255,0.15)';
      ctx.fill();
    }

    // Planet body
    const gradient = ctx.createRadialGradient(x - planet.radius * 0.3, y - planet.radius * 0.3, 0, x, y, planet.radius);
    gradient.addColorStop(0, this._lighten(planet.color, 60));
    gradient.addColorStop(1, planet.color);

    ctx.beginPath();
    ctx.arc(x, y, planet.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Saturn's rings
    if (planet.name === 'Saturn') {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.3);
      ctx.beginPath();
      ctx.arc(0, 0, planet.radius + 18, 0, Math.PI * 2);
      ctx.arc(0, 0, planet.radius + 8,  0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(200,180,100,0.5)';
      ctx.fill();
      ctx.restore();
    }

    // Earth's moon
    if (planet.name === 'Earth') {
      const moonAngle = this.time * 13;
      const mx = x + Math.cos(moonAngle) * 18;
      const my = y + Math.sin(moonAngle) * 18;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ccc';
      ctx.fill();
    }

    // Planet name label
    if (isSelected || this.zoom > 1.2 || this.mode === 'learning') {
      ctx.font = `${10 / this.zoom}px Orbitron, monospace`;
      ctx.fillStyle = isSelected ? '#00f5ff' : 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(planet.name, x, y - planet.radius - 8);
    }

    // Check if hand is hovering over planet
    const screenX = (x + this.offsetX) * this.zoom;
    const screenY = (y + this.offsetY) * this.zoom;
    const hx = (this.handX - 0.5) * this.canvas.width;
    const hy = (this.handY - 0.5) * this.canvas.height;
    const dist = Math.sqrt((screenX - hx) ** 2 + (screenY - hy) ** 2);

    if (dist < (planet.radius * this.zoom + 20)) {
      this._selectPlanet(planet);
    }
  }

  _drawHandCursor() {
    const ctx = this.ctx;
    const hx = (this.handX - 0.5) * this.canvas.width / this.zoom;
    const hy = (this.handY - 0.5) * this.canvas.height / this.zoom;

    // Crosshair cursor
    ctx.strokeStyle = 'rgba(0,245,255,0.8)';
    ctx.lineWidth = 1 / this.zoom;

    const size = 15 / this.zoom;
    ctx.beginPath();
    ctx.moveTo(hx - size, hy); ctx.lineTo(hx + size, hy);
    ctx.moveTo(hx, hy - size); ctx.lineTo(hx, hy + size);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hx, hy, size * 0.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,245,255,0.4)';
    ctx.stroke();
  }

  // ── Gesture Control ─────────────────────────────────────────

  setupGestures() {
    const engine = window.trackingEngine;
    if (!engine) return;

    engine.on('handUpdate', ({ landmarks, label }) => {
      const center = engine.getHandCenter(landmarks);
      this.handX = center.x;
      this.handY = center.y;

      // Pinch to zoom
      const pinch = engine.getPinchDistance(landmarks);
      if (this.lastPinch !== null) {
        const delta = pinch - this.lastPinch;
        if (Math.abs(delta) > 0.005) {
          this.zoom = Math.max(0.3, Math.min(5, this.zoom - delta * 8));
        }
      }
      this.lastPinch = pinch;

      // Hand rotation maps to system rotation
      const openness = engine.getHandOpenness(landmarks);
      const dx = center.x - 0.5;
      if (openness > 0.7 && Math.abs(dx) > 0.1) {
        this.rotation += dx * 0.02;
      }

      // Speed control: hand height
      const wristY = landmarks[0].y;
      this.speed = Math.max(0.1, Math.min(5, (1 - wristY) * 4));
    });

    engine.on('gesture', ({ gesture }) => {
      if (gesture === 'OPEN_PALM') this._resetView();
      if (gesture === 'FIST') this.speed = 0;
      if (gesture === 'POINTING') {
        // Find nearest planet and select it
        const nearestPlanet = this._findNearestPlanet(this.handX, this.handY);
        if (nearestPlanet) this._selectPlanet(nearestPlanet);
      }
    });
  }

  setupMouseFallback() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - this.cx - this.offsetX) / this.zoom;
      const my = (e.clientY - rect.top  - this.cy - this.offsetY) / this.zoom;

      let clicked = null;
      let minDist  = Infinity;

      this.planets.forEach(p => {
        if (!p.currentX) return;
        const d = Math.sqrt((p.currentX - mx)**2 + (p.currentY - my)**2);
        if (d < p.radius + 15 && d < minDist) {
          minDist = d;
          clicked = p;
        }
      });

      if (clicked) this._selectPlanet(clicked);
      else { this.selectedPlanet = null; this._hidePlanetInfo(); }
    });

    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.3, Math.min(5, this.zoom * delta));
    });

    // Drag to pan
    let dragging = false, dragX, dragY;
    this.canvas.addEventListener('mousedown', e => { dragging=true; dragX=e.clientX; dragY=e.clientY; });
    this.canvas.addEventListener('mousemove', e => {
      if (!dragging) return;
      this.offsetX += e.clientX - dragX;
      this.offsetY += e.clientY - dragY;
      dragX = e.clientX;
      dragY = e.clientY;
    });
    this.canvas.addEventListener('mouseup', () => { dragging = false; });
  }

  _selectPlanet(planet) {
    if (this.selectedPlanet?.name === planet.name) return;
    this.selectedPlanet = planet;
    this._showPlanetInfo(planet);
  }

  _showPlanetInfo(planet) {
    const panel = document.getElementById('planet-info-panel');
    if (!panel) return;

    panel.classList.add('visible');
    panel.innerHTML = `
      <div style="font-family:var(--font-display);font-size:0.9rem;color:var(--neon-cyan);margin-bottom:16px;">
        ${planet.emoji} ${planet.name}
      </div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:16px;">${planet.info}</div>
      <div class="planet-stat"><span class="stat-label">Mass</span><span class="stat-value">${planet.mass}</span></div>
      <div class="planet-stat"><span class="stat-label">Gravity</span><span class="stat-value">${planet.gravity}</span></div>
      <div class="planet-stat"><span class="stat-label">Avg Temp</span><span class="stat-value">${planet.temp}</span></div>
      <div class="planet-stat"><span class="stat-label">Moons</span><span class="stat-value">${planet.moons}</span></div>
      <div class="planet-stat"><span class="stat-label">Orbital Period</span><span class="stat-value">${planet.period} days</span></div>
      <div class="planet-stat"><span class="stat-label">Sim Speed</span><span class="stat-value">${this.speed.toFixed(1)}×</span></div>
    `;
  }

  _hidePlanetInfo() {
    document.getElementById('planet-info-panel')?.classList.remove('visible');
  }

  _findNearestPlanet(hx, hy) {
    let nearest = null, minDist = Infinity;
    this.planets.forEach(p => {
      if (!p.currentX) return;
      const px = (p.currentX / (this.canvas.width / this.zoom)) + 0.5;
      const py = (p.currentY / (this.canvas.height / this.zoom)) + 0.5;
      const d  = Math.sqrt((px - hx)**2 + (py - hy)**2);
      if (d < minDist) { minDist = d; nearest = p; }
    });
    return nearest;
  }

  _resetView() {
    this.zoom     = 1.0;
    this.offsetX  = 0;
    this.offsetY  = 0;
    this.rotation = 0;
    this.speed    = 1.0;
  }

  setMode(mode) {
    this.mode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    if (mode === 'fun')     this.speed = 5;
    if (mode === 'physics') this.speed = 0.5;
    if (mode === 'learning') this.speed = 1;
  }

  // ── Utility ─────────────────────────────────────────────────

  _lighten(hex, amount) {
    const num = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (num >> 16) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return `rgb(${r},${g},${b})`;
  }
}

window.solarSystem = null;
document.addEventListener('DOMContentLoaded', () => {
  // Initialize when planet page becomes active
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.solarSystem?.setMode(btn.dataset.mode);
    });
  });
});
