/**
 * app.js — Main Application Controller
 * Manages: page routing, camera init, gesture toast, UI wiring
 */

// ── Gesture Toast Notification System ──────────────────────────

class GestureToast {
  constructor() {
    this.el = document.getElementById('gesture-toast');
    this.timer = null;
  }

  show(message, duration = 1800) {
    if (!this.el) return;
    this.el.textContent = message;
    this.el.classList.add('show');

    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.el.classList.remove('show');
    }, duration);
  }
}

window.gestureToast = new GestureToast();

// ── Page Router ─────────────────────────────────────────────────

class AppRouter {
  constructor() {
    this.currentPage = 'home';
    this.pages = ['home', 'music', 'planets', 'games', 'micro'];
    this.pageInstances = {};
  }

  navigate(pageId) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    // Show target page
    const target = document.getElementById(`page-${pageId}`);
    if (target) target.classList.add('active');

    // Update navbar
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === pageId);
    });

    // Initialize page-specific modules on first visit
    this._initPage(pageId);

    this.currentPage = pageId;

    // Show gesture hints for this page
    this._showHints(pageId);
  }

  _initPage(pageId) {
    if (this.pageInstances[pageId]) return; // Already initialized

    switch (pageId) {
      case 'planets':
        if (!window.solarSystem) {
          window.solarSystem = new SolarSystem();
        }
        break;

      case 'micro':
        if (!window.microWorld) {
          window.microWorld = new MicroWorld();
        }
        break;

      case 'games':
        // CatchGame already initialized on DOMContentLoaded
        break;
    }

    this.pageInstances[pageId] = true;
  }

  _showHints(pageId) {
    const hints = {
      music: [
        { emoji: '✋', action: 'Open Palm', desc: 'Play music' },
        { emoji: '✊', action: 'Fist', desc: 'Pause' },
        { emoji: '👉', action: 'Swipe Right', desc: 'Next track' },
        { emoji: '👈', action: 'Swipe Left', desc: 'Prev track' },
        { emoji: '☝️', action: 'Hand Up', desc: 'Volume up' },
      ],
      planets: [
        { emoji: '🤏', action: 'Pinch', desc: 'Zoom in/out' },
        { emoji: '✋', action: 'Open Palm', desc: 'Reset view' },
        { emoji: '☝️', action: 'Point', desc: 'Select planet' },
        { emoji: '✊', action: 'Fist', desc: 'Pause simulation' },
      ],
      games: [
        { emoji: '✋', action: 'Open Palm', desc: 'Start game' },
        { emoji: '↔️', action: 'Move hand', desc: 'Control paddle' },
        { emoji: '✊', action: 'Fist', desc: 'Stop game' },
      ],
      micro: [
        { emoji: '🤏', action: 'Pinch', desc: 'Grab particle' },
        { emoji: '✋', action: 'Open Palm', desc: 'Explode outward' },
        { emoji: '🤏+🔄', action: 'Pinch zoom', desc: 'Change scale' },
      ],
    };

    const hintPanel = document.getElementById('gesture-hint');
    const list = hints[pageId];

    if (!list || !hintPanel) {
      if (hintPanel) hintPanel.classList.remove('visible');
      return;
    }

    hintPanel.innerHTML = `
      <div class="hint-title">✦ GESTURE CONTROLS</div>
      ${list.map(h => `
        <div class="hint-item">
          <span class="hint-icon">${h.emoji}</span>
          <div>
            <span style="color:var(--neon-cyan);font-size:0.75rem;font-weight:600;">${h.action}</span>
            <div class="hint-text">${h.desc}</div>
          </div>
        </div>
      `).join('')}
    `;

    hintPanel.classList.add('visible');
    setTimeout(() => hintPanel.classList.remove('visible'), 6000);
  }
}

window.appRouter = new AppRouter();

// ── Camera & Permission System ──────────────────────────────────

class CameraManager {
  constructor() {
    this.permissionGranted = false;
    this.modal = document.getElementById('permission-modal');
  }

  async requestPermission() {
    const statusEl = this.modal.querySelector('.permission-status');
    const btn = this.modal.querySelector('#grant-camera-btn');

    statusEl.textContent = '⏳ Requesting access...';
    statusEl.className = 'permission-status status-waiting';

    const result = await window.trackingEngine.requestCamera();

    if (result.success) {
      statusEl.textContent = '✅ Camera access granted';
      statusEl.className = 'permission-status status-granted';
      this.permissionGranted = true;

      // Load MediaPipe models
      statusEl.textContent = '🧠 Loading AI models...';

      await window.trackingEngine.initModels();
      await window.trackingEngine.start();

      statusEl.textContent = '🚀 All systems ready!';

      setTimeout(() => {
        this.modal.style.display = 'none';
        document.getElementById('camera-container').style.display = 'block';
      }, 800);
    } else {
      statusEl.textContent = '❌ Camera denied — gesture control disabled';
      statusEl.className = 'permission-status status-denied';
      btn.textContent = 'Use Without Camera';
      btn.onclick = () => {
        this.modal.style.display = 'none';
        window.gestureToast?.show('⚠️ Running without gesture control');
      };
    }
  }

  skipCamera() {
    this.modal.style.display = 'none';
    window.gestureToast?.show('⚠️ Gesture control disabled');
  }
}

window.cameraManager = new CameraManager();

// ── DOM Ready ───────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Hide loading overlay
  setTimeout(() => {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.classList.add('fade-out');
    setTimeout(() => loader?.remove(), 500);
  }, 1500);

  // Wire up nav buttons
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      window.appRouter.navigate(btn.dataset.page);
    });
  });

  // Wire hero feature cards
  document.querySelectorAll('.hero-feature[data-page]').forEach(card => {
    card.addEventListener('click', () => {
      window.appRouter.navigate(card.dataset.page);
    });
  });

  // Camera permission button
  document.getElementById('grant-camera-btn')?.addEventListener('click', () => {
    window.cameraManager.requestPermission();
  });

  document.getElementById('skip-camera-btn')?.addEventListener('click', () => {
    window.cameraManager.skipCamera();
  });

  // Music controls
  document.getElementById('play-btn')?.addEventListener('click', () => window.musicPlayer?.togglePlay());
  document.getElementById('next-btn')?.addEventListener('click', () => window.musicPlayer?.nextTrack());
  document.getElementById('prev-btn')?.addEventListener('click', () => window.musicPlayer?.prevTrack());
  document.getElementById('mute-btn')?.addEventListener('click', () => window.musicPlayer?.toggleMute());
  document.getElementById('vol-icon')?.addEventListener('click',  () => window.musicPlayer?.toggleMute());

  // Game controls
  document.getElementById('start-game-btn')?.addEventListener('click', () => window.catchGame?.startGame());
  document.getElementById('restart-game-btn')?.addEventListener('click', () => window.catchGame?.startGame());
  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => window.catchGame?.setDifficulty(btn.dataset.diff));
  });

  // Micro world controls
  document.querySelectorAll('.micro-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.microWorld?.setMode(btn.dataset.mode);
      document.querySelectorAll('.micro-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById('gravity-toggle')?.addEventListener('click', () => window.microWorld?.toggleGravity());

  // Calibration
  document.getElementById('calibrate-btn')?.addEventListener('click', async () => {
    const result = await window.trackingEngine?.calibrate();
    window.gestureToast?.show(result ? '✅ Calibration complete!' : '⚠️ Calibration skipped');
  });

  // Fullscreen toggle
  document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Camera container expand/collapse
  document.getElementById('camera-container')?.addEventListener('click', (e) => {
    if (e.target.closest('#camera-container')) {
      document.getElementById('camera-container')?.classList.toggle('expanded');
    }
  });

  // Screenshot gesture (saved to clipboard)
  window.trackingEngine?.on('gesture', ({ gesture }) => {
    if (gesture === 'PEACE') {
      // Take screenshot by capturing canvas
      const canvas = document.querySelector('.page.active canvas');
      if (canvas) {
        canvas.toBlob(blob => {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          window.gestureToast?.show('📸 Screenshot copied!');
        });
      }
    }
  });

  // Default page
  window.appRouter.navigate('home');
});
