/**
 * tracking.js — MediaPipe Hand & Face Tracking Engine
 * Handles: camera setup, landmark detection, smoothing, FPS monitoring
 * 
 * VOCABULARY:
 * "landmark" = a specific point on your hand/face detected by AI
 * "inference" = the AI making a prediction/calculation
 * "smoothing" = removing jittery/shaky movement from raw data
 */

class TrackingEngine {
  constructor() {
    // DOM elements
    this.video      = document.getElementById('webcam');
    this.canvas     = document.getElementById('landmark-canvas');
    this.ctx        = this.canvas.getContext('2d');

    // State
    this.isRunning  = false;
    this.handResults = null;
    this.faceResults = null;

    // Smoothing buffers — stores last N positions to average
    this.handSmooth = { left: [], right: [] };
    this.SMOOTH_FRAMES = 5; // Average over 5 frames = smooth movement

    // FPS counter
    this.fpsFrames  = 0;
    this.fpsTime    = performance.now();
    this.currentFPS = 0;

    // Event listeners (other modules subscribe here)
    this.listeners  = {};

    // MediaPipe instances
    this.hands = null;
    this.faceMesh = null;

    // Detected gesture state
    this.lastGesture = null;
    this.gestureTime = 0;
    this.GESTURE_DEBOUNCE = 600; // ms between same gesture triggers

    console.log('[TrackingEngine] Initialized');
  }

  // ── Camera Permission & Setup ───────────────────────────────

  async requestCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30, max: 60 }
        }
      });
      this.video.srcObject = stream;
      await this.video.play();

      // Resize canvas to match video
      this.video.addEventListener('loadedmetadata', () => {
        this.canvas.width  = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
      });

      return { success: true };
    } catch (err) {
      console.error('[TrackingEngine] Camera error:', err);
      return { success: false, error: err.message };
    }
  }

  // ── Initialize MediaPipe Models ──────────────────────────────

  async initModels() {
    try {
      // Hand Tracking — 21 landmarks per hand
      this.hands = new Hands({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,      // 0=lite, 1=full
        minDetectionConfidence: 0.7,
        minTrackingConfidence:  0.5
      });
      this.hands.onResults((r) => this._onHandResults(r));

      // Face Mesh — 468 face landmarks
      this.faceMesh = new FaceMesh({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });
      this.faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5
      });
      this.faceMesh.onResults((r) => this._onFaceResults(r));

      console.log('[TrackingEngine] Models loaded');
      return true;
    } catch (err) {
      console.error('[TrackingEngine] Model init failed:', err);
      return false;
    }
  }

  // ── Main Loop ──────────────────────────────────────────────

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._loop();
    console.log('[TrackingEngine] Started');
  }

  stop() {
    this.isRunning = false;
  }

  async _loop() {
    if (!this.isRunning) return;

    // Send current video frame to MediaPipe
    if (this.video.readyState >= 2) {
      if (this.hands)    await this.hands.send({ image: this.video });
      if (this.faceMesh) await this.faceMesh.send({ image: this.video });
    }

    // Update FPS counter
    this._updateFPS();

    // Request next frame (≈60 FPS target)
    requestAnimationFrame(() => this._loop());
  }

  // ── Hand Results Handler ────────────────────────────────────

  _onHandResults(results) {
    this.handResults = results;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!results.multiHandLandmarks?.length) {
      this._emit('handLost');
      return;
    }

    // Process each detected hand
    results.multiHandLandmarks.forEach((landmarks, i) => {
      const label = results.multiHandedness[i].label; // "Left" or "Right"

      // Apply smoothing filter
      const smoothed = this._smoothLandmarks(landmarks, label.toLowerCase());

      // Draw landmarks on canvas
      this._drawHandLandmarks(smoothed, label);

      // Recognize gesture from landmarks
      const gesture = this._recognizeHandGesture(smoothed, label);

      // Emit events
      this._emit('handUpdate', { landmarks: smoothed, label, gesture });
      this._emitGesture(gesture, label);
    });

    // Process face after hands
    if (this.faceResults) {
      this._processFaceGestures(this.faceResults);
    }
  }

  // ── Landmark Smoothing (Exponential Moving Average) ─────────

  _smoothLandmarks(landmarks, hand) {
    if (!this.handSmooth[hand]) this.handSmooth[hand] = [];
    const buf = this.handSmooth[hand];

    buf.push(landmarks);
    if (buf.length > this.SMOOTH_FRAMES) buf.shift(); // Keep buffer size

    // Average each landmark across buffered frames
    return landmarks.map((_, i) => ({
      x: buf.reduce((s, f) => s + f[i].x, 0) / buf.length,
      y: buf.reduce((s, f) => s + f[i].y, 0) / buf.length,
      z: buf.reduce((s, f) => s + f[i].z, 0) / buf.length,
    }));
  }

  // ── Draw Hand Landmarks ─────────────────────────────────────

  _drawHandLandmarks(landmarks, label) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const color = label === 'Right' ? '#00f5ff' : '#bf00ff';

    // Hand connections (which landmarks connect to which)
    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],           // Thumb
      [0,5],[5,6],[6,7],[7,8],           // Index
      [0,9],[9,10],[10,11],[11,12],      // Middle
      [0,13],[13,14],[14,15],[15,16],    // Ring
      [0,17],[17,18],[18,19],[19,20],    // Pinky
      [5,9],[9,13],[13,17]               // Palm
    ];

    // Draw connections
    this.ctx.strokeStyle = color + '80'; // 50% opacity
    this.ctx.lineWidth = 2;
    CONNECTIONS.forEach(([a, b]) => {
      this.ctx.beginPath();
      this.ctx.moveTo(landmarks[a].x * W, landmarks[a].y * H);
      this.ctx.lineTo(landmarks[b].x * W, landmarks[b].y * H);
      this.ctx.stroke();
    });

    // Draw dots on each landmark
    landmarks.forEach((lm, i) => {
      const x = lm.x * W;
      const y = lm.y * H;
      const isTip = [4,8,12,16,20].includes(i); // Fingertips

      this.ctx.beginPath();
      this.ctx.arc(x, y, isTip ? 6 : 3, 0, Math.PI * 2);
      this.ctx.fillStyle = isTip ? color : color + 'aa';
      this.ctx.fill();

      // Glow effect on fingertips
      if (isTip) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 12, 0, Math.PI * 2);
        this.ctx.strokeStyle = color + '40';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
      }
    });
  }

  // ── Gesture Recognition ─────────────────────────────────────

  _recognizeHandGesture(lm, label) {
    /**
     * Finger landmark indices:
     * Thumb: 1-4 | Index: 5-8 | Middle: 9-12 | Ring: 13-16 | Pinky: 17-20
     * TIP = [4, 8, 12, 16, 20]
     * MCP = [2, 5, 9, 13, 17] (knuckles)
     */

    const fingerExtended = this._checkFingers(lm);
    const [thumb, index, middle, ring, pinky] = fingerExtended;
    const allOpen   = thumb && index && middle && ring && pinky;
    const allClosed = !index && !middle && !ring && !pinky;
    const onlyIndex = index && !middle && !ring && !pinky;
    const peaceSign = index && middle && !ring && !pinky;
    const thumbsUp  = thumb && allClosed;
    const pinchDist = this._distance(lm[4], lm[8]); // Thumb tip to index tip
    const isPinching = pinchDist < 0.06;

    // Wrist Y position (0=top, 1=bottom of frame)
    const wristY = lm[0].y;
    // Wrist X position
    const wristX = lm[0].x;

    if (isPinching)    return 'PINCH';
    if (allOpen)       return 'OPEN_PALM';
    if (allClosed)     return 'FIST';
    if (peaceSign)     return 'PEACE';
    if (thumbsUp)      return 'THUMBS_UP';
    if (onlyIndex)     return 'POINTING';

    // Detect swipe by comparing current vs previous wrist position
    const dx = this._getSwipeDelta(wristX, label);
    if (Math.abs(dx) > 0.08) return dx > 0 ? 'SWIPE_RIGHT' : 'SWIPE_LEFT';

    return 'UNKNOWN';
  }

  _checkFingers(lm) {
    // Returns [thumb, index, middle, ring, pinky] — true if extended
    return [
      lm[4].x < lm[3].x,                  // Thumb (compare x positions)
      lm[8].y < lm[6].y,                   // Index
      lm[12].y < lm[10].y,                 // Middle
      lm[16].y < lm[14].y,                 // Ring
      lm[20].y < lm[18].y,                 // Pinky
    ];
  }

  _distance(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  // Track wrist X history for swipe detection
  _wristXHistory = { left: [], right: [] };
  _getSwipeDelta(x, hand) {
    const key = hand.toLowerCase();
    const hist = this._wristXHistory[key] || [];
    hist.push(x);
    if (hist.length > 8) hist.shift();
    this._wristXHistory[key] = hist;
    if (hist.length < 5) return 0;
    return hist[hist.length - 1] - hist[0]; // Delta from 5 frames ago
  }

  // ── Face Results Handler ───────────────────────────────────

  _onFaceResults(results) {
    this.faceResults = results;

    if (!results.multiFaceLandmarks?.length) {
      this._emit('faceStatus', { present: false });
      return;
    }

    const face = results.multiFaceLandmarks[0];

    // Head tilt — compare eye Y positions
    const leftEyeY  = face[159].y;   // Left eye center
    const rightEyeY = face[386].y;   // Right eye center
    const tilt = (rightEyeY - leftEyeY) * 10;  // Scale for sensitivity

    // Mouth open — compare upper/lower lip Y distance
    const mouthOpen = Math.abs(face[13].y - face[14].y) > 0.02;

    // Eye blink detection
    const leftBlink  = Math.abs(face[159].y - face[145].y) < 0.008;
    const rightBlink = Math.abs(face[386].y - face[374].y) < 0.008;

    // Head nod direction (Y position of nose tip)
    const headY = face[1].y;

    this._emit('faceUpdate', {
      present: true,
      tilt,
      mouthOpen,
      leftBlink,
      rightBlink,
      headY,
      landmarks: face
    });

    // Draw face mesh (simplified)
    this._drawFaceMesh(face);
  }

  _drawFaceMesh(face) {
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Draw subtle face outline
    this.ctx.fillStyle = 'rgba(191,0,255,0.6)';
    [10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
     361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
     176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
     162, 21, 54, 103, 67, 109].forEach(i => {
      if (!face[i]) return;
      this.ctx.beginPath();
      this.ctx.arc(face[i].x * W, face[i].y * H, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  _processFaceGestures(results) {
    if (!results.multiFaceLandmarks?.length) return;
    const face = results.multiFaceLandmarks[0];
    const mouthOpen = Math.abs(face[13].y - face[14].y) > 0.02;
    if (mouthOpen) this._emitGesture('MOUTH_OPEN', 'face');
  }

  // ── Event System ────────────────────────────────────────────

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  _emitGesture(gesture, label) {
    if (!gesture || gesture === 'UNKNOWN') return;

    const now = Date.now();
    const key = `${gesture}-${label}`;

    // Debounce — don't fire same gesture too rapidly
    if (this.lastGesture === key && now - this.gestureTime < this.GESTURE_DEBOUNCE) return;

    this.lastGesture = key;
    this.gestureTime = now;

    this._emit('gesture', { gesture, label });

    // Show visual toast notification
    window.gestureToast?.show(`${this._gestureEmoji(gesture)} ${gesture.replace(/_/g, ' ')}`);
  }

  _gestureEmoji(g) {
    const map = {
      OPEN_PALM:'✋', FIST:'✊', PEACE:'✌️', PINCH:'🤏',
      THUMBS_UP:'👍', POINTING:'☝️', SWIPE_LEFT:'👈',
      SWIPE_RIGHT:'👉', MOUTH_OPEN:'😮'
    };
    return map[g] || '🖐️';
  }

  // ── FPS Monitor ──────────────────────────────────────────────

  _updateFPS() {
    this.fpsFrames++;
    const now = performance.now();
    const elapsed = now - this.fpsTime;

    if (elapsed >= 1000) { // Update every second
      this.currentFPS = Math.round(this.fpsFrames * 1000 / elapsed);
      this.fpsFrames  = 0;
      this.fpsTime    = now;

      const badge = document.getElementById('fps-badge');
      if (badge) {
        badge.textContent = `${this.currentFPS} FPS`;
        badge.style.color = this.currentFPS >= 25 ? '#00ff88' :
                             this.currentFPS >= 15 ? '#ffc800' : '#ff4444';
      }
    }
  }

  // ── Calibration ─────────────────────────────────────────────

  async calibrate() {
    const screen = document.getElementById('calibration-screen');
    const fill   = screen.querySelector('.calibration-fill');
    const steps  = screen.querySelectorAll('.calib-step');

    screen.classList.add('active');

    const gestures = ['OPEN_PALM', 'FIST', 'PINCH', 'PEACE'];
    let collected = 0;

    return new Promise(resolve => {
      const onGesture = ({ gesture }) => {
        if (gestures.includes(gesture)) {
          collected++;
          const pct = (collected / gestures.length) * 100;
          fill.style.width = pct + '%';

          if (collected >= gestures.length) {
            this.off('gesture', onGesture);
            setTimeout(() => {
              screen.classList.remove('active');
              resolve(true);
            }, 800);
          }
        }
      };
      this.on('gesture', onGesture);

      // Auto-close after 15 seconds even if incomplete
      setTimeout(() => {
        this.off('gesture', onGesture);
        screen.classList.remove('active');
        resolve(false);
      }, 15000);
    });
  }

  // ── Utilities ────────────────────────────────────────────────

  getHandCenter(landmarks) {
    // Average of all 21 landmark positions
    const x = landmarks.reduce((s, l) => s + l.x, 0) / landmarks.length;
    const y = landmarks.reduce((s, l) => s + l.y, 0) / landmarks.length;
    return { x, y };
  }

  getPinchDistance(landmarks) {
    return this._distance(landmarks[4], landmarks[8]);
  }

  getHandOpenness(landmarks) {
    // Returns 0 (closed fist) to 1 (fully open)
    const tips = [8, 12, 16, 20];
    const base = landmarks[0]; // Wrist
    const avg  = tips.reduce((s, i) =>
      s + this._distance(landmarks[i], base), 0) / tips.length;
    return Math.min(1, Math.max(0, (avg - 0.15) / 0.25));
  }
}

// Export global instance
window.trackingEngine = new TrackingEngine();
