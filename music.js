/**
 * music.js — Gesture-Controlled Music Player
 * Uses Web Audio API for sound synthesis + gesture events from TrackingEngine
 *
 * VOCABULARY:
 * "oscillator" = an audio object that generates sound waves
 * "frequency"  = the pitch/tone of a sound (Hz = Hertz)
 * "debounce"   = preventing a function from firing too many times rapidly
 * "synthesis"  = creating sound electronically (not recording)
 */

class MusicPlayer {
  constructor() {
    // Audio engine setup using Web Audio API
    this.audioCtx  = null;
    this.analyser  = null;
    this.gainNode  = null;  // Controls volume
    this.isPlaying = false;
    this.currentTrack = 0;
    this.volume    = 0.7;
    this.isMuted   = false;

    // Animation frame for visualizer
    this.animFrame = null;

    // Last hand Y for volume control
    this.lastHandY = null;

    // Playlist — using synthesized tones since we have no audio files
    this.playlist = [
      { title: 'Neon Dreams',    artist: 'GestureX Synth', emoji: '🌆', color: '#00f5ff', bpm: 128 },
      { title: 'Quantum Pulse',  artist: 'AI Composer',    emoji: '⚡', color: '#bf00ff', bpm: 140 },
      { title: 'Void Walker',    artist: 'Neural Beats',   emoji: '🌌', color: '#ff0080', bpm: 95  },
      { title: 'Data Flow',      artist: 'Synthetic Mind', emoji: '💾', color: '#00ff88', bpm: 110 },
      { title: 'Solar Wind',     artist: 'Orbit Sounds',   emoji: '☀️', color: '#ff6b00', bpm: 120 },
      { title: 'Deep Hex',       artist: 'Binary Ghost',   emoji: '🔮', color: '#00f5ff', bpm: 85  },
    ];

    // Track progress simulation
    this.progressInterval = null;
    this.progress = 0;
    this.trackDuration = 210; // 3:30 in seconds

    this.init();
  }

  // ── Initialization ──────────────────────────────────────────

  init() {
    this.buildUI();
    this.setupGestureListeners();
    this.renderPlaylist();
    this.loadTrack(0);
    console.log('[MusicPlayer] Ready');
  }

  // ── Audio Context ───────────────────────────────────────────

  initAudio() {
    if (this.audioCtx) return;

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Analyser node for visualizer bars
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 64; // 32 frequency bins

    // Gain node for volume control
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this.volume;

    // Connect: analyser → gain → output
    this.analyser.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);
  }

  // ── Synthesize Track Sound ──────────────────────────────────

  playTone(bpm, color) {
    if (!this.audioCtx) return;

    // Create oscillator (generates audio wave)
    const osc  = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    osc.connect(gain);
    gain.connect(this.analyser);

    // Set frequency based on BPM (creative mapping)
    const freq = 200 + (bpm - 80) * 2;
    osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
    osc.type = 'sine';

    // Fade in
    gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.15, this.audioCtx.currentTime + 0.5);

    // Fade out after 2s
    gain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 2.5);

    osc.start();
    osc.stop(this.audioCtx.currentTime + 3);

    // Store reference to stop later
    this.currentOscillator = osc;
  }

  // ── Playback Controls ───────────────────────────────────────

  play() {
    if (this.isPlaying) return;
    this.initAudio();
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    this.isPlaying = true;
    const track = this.playlist[this.currentTrack];
    this.playTone(track.bpm, track.color);

    // Update UI
    document.getElementById('play-btn').textContent = '⏸';
    document.querySelector('.album-art').classList.add('spinning');

    // Start progress simulation
    this._startProgress();

    // Start visualizer animation
    this._animateEqualizer(true);
  }

  pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    if (this.audioCtx) this.audioCtx.suspend();

    document.getElementById('play-btn').textContent = '▶';
    document.querySelector('.album-art').classList.remove('spinning');

    clearInterval(this.progressInterval);
    this._animateEqualizer(false);
  }

  togglePlay() {
    this.isPlaying ? this.pause() : this.play();
  }

  nextTrack() {
    this.currentTrack = (this.currentTrack + 1) % this.playlist.length;
    this.loadTrack(this.currentTrack);
    if (this.isPlaying) { this.pause(); setTimeout(() => this.play(), 100); }
  }

  prevTrack() {
    this.currentTrack = (this.currentTrack - 1 + this.playlist.length) % this.playlist.length;
    this.loadTrack(this.currentTrack);
    if (this.isPlaying) { this.pause(); setTimeout(() => this.play(), 100); }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.gainNode) this.gainNode.gain.value = this.isMuted ? 0 : this.volume;

    const slider = document.getElementById('vol-slider');
    if (slider) slider.value = this.volume * 100;

    const icon = document.getElementById('vol-icon');
    if (icon) {
      icon.textContent = this.volume === 0 ? '🔇' :
                         this.volume < 0.5  ? '🔉' : '🔊';
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.gainNode) {
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
    }
    const icon = document.getElementById('vol-icon');
    if (icon) icon.textContent = this.isMuted ? '🔇' : '🔊';
  }

  loadTrack(index) {
    this.currentTrack = index;
    this.progress = 0;
    clearInterval(this.progressInterval);

    const track = this.playlist[index];
    document.querySelector('.track-title').textContent  = track.title;
    document.querySelector('.track-artist').textContent = track.artist;
    document.querySelector('.album-art').textContent    = track.emoji;

    // Update active playlist item
    document.querySelectorAll('.playlist-item').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });

    this._updateProgress();
  }

  // ── Progress Bar ──────────────────────────────────────────

  _startProgress() {
    clearInterval(this.progressInterval);
    this.progressInterval = setInterval(() => {
      this.progress += 1;
      if (this.progress >= this.trackDuration) {
        this.progress = 0;
        this.nextTrack();
      }
      this._updateProgress();
    }, 1000);
  }

  _updateProgress() {
    const pct = (this.progress / this.trackDuration) * 100;
    const fill = document.querySelector('.progress-fill');
    if (fill) fill.style.width = pct + '%';

    const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    const cur = document.querySelector('.time-current');
    const tot = document.querySelector('.time-total');
    if (cur) cur.textContent = fmt(this.progress);
    if (tot) tot.textContent = fmt(this.trackDuration);
  }

  // ── Equalizer Visualizer ──────────────────────────────────

  _animateEqualizer(active) {
    const bars = document.querySelectorAll('.eq-bar');
    if (!bars.length) return;

    if (!active) {
      bars.forEach(b => { b.style.height = '4px'; });
      return;
    }

    const animate = () => {
      if (!this.isPlaying) return;

      if (this.analyser) {
        // Use real audio data if available
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(data);
        bars.forEach((b, i) => {
          const val = data[i] || 0;
          b.style.height = Math.max(4, val / 4) + 'px';
        });
      } else {
        // Fake animation when no audio
        bars.forEach(b => {
          b.style.height = (4 + Math.random() * 40) + 'px';
        });
      }

      this.animFrame = requestAnimationFrame(animate);
    };
    animate();
  }

  // ── Gesture Listeners ─────────────────────────────────────

  setupGestureListeners() {
    const engine = window.trackingEngine;
    if (!engine) return;

    // Main gesture handler
    engine.on('gesture', ({ gesture, label }) => {
      switch (gesture) {
        case 'OPEN_PALM': this.play();      break;
        case 'FIST':      this.pause();     break;
        case 'SWIPE_RIGHT': this.nextTrack(); break;
        case 'SWIPE_LEFT':  this.prevTrack(); break;
        case 'THUMBS_UP': this.setVolume(this.volume + 0.1); break;
      }

      // Two-hand peace = mute toggle
      if (gesture === 'PEACE' && label === 'both') this.toggleMute();
    });

    // Continuous hand position for volume
    engine.on('handUpdate', ({ landmarks, label }) => {
      if (label === 'Right') {
        const wristY = landmarks[0].y; // 0=top, 1=bottom
        if (this.lastHandY !== null) {
          const delta = this.lastHandY - wristY; // Positive = hand moved up
          if (Math.abs(delta) > 0.02) {
            this.setVolume(this.volume + delta * 0.5);
          }
        }
        this.lastHandY = wristY;
      }
    });

    // Face detection — auto play/pause
    engine.on('faceUpdate', ({ present }) => {
      // Auto play when face detected
      if (present && !this.isPlaying && this._autoPlayEnabled) {
        this.play();
      }
    });

    engine.on('faceStatus', ({ present }) => {
      // Auto pause when face leaves
      if (!present && this.isPlaying && this._autoPlayEnabled) {
        this.pause();
      }
    });

    // Head tilt for fine volume
    engine.on('faceUpdate', ({ tilt }) => {
      if (Math.abs(tilt) > 0.3) {
        this.setVolume(this.volume + tilt * 0.01);
      }
    });
  }

  // ── Build UI ─────────────────────────────────────────────

  buildUI() {
    // Equalizer bars
    const eq = document.querySelector('.equalizer');
    if (eq) {
      eq.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const bar = document.createElement('div');
        bar.className = 'eq-bar';
        bar.style.animationDelay = `${i * 0.05}s`;
        bar.style.height = '4px';
        eq.appendChild(bar);
      }
    }

    // Volume slider
    const slider = document.getElementById('vol-slider');
    if (slider) {
      slider.value = this.volume * 100;
      slider.addEventListener('input', e => {
        this.setVolume(e.target.value / 100);
      });
    }

    // Auto-play toggle
    this._autoPlayEnabled = false;
    const autoToggle = document.getElementById('auto-play-toggle');
    if (autoToggle) {
      autoToggle.addEventListener('click', () => {
        this._autoPlayEnabled = !this._autoPlayEnabled;
        autoToggle.classList.toggle('active', this._autoPlayEnabled);
        autoToggle.textContent = this._autoPlayEnabled ? '👁️ Auto ON' : '👁️ Auto OFF';
      });
    }
  }

  renderPlaylist() {
    const container = document.getElementById('playlist-items');
    if (!container) return;

    container.innerHTML = this.playlist.map((t, i) => `
      <div class="playlist-item ${i === 0 ? 'active' : ''}"
           onclick="window.musicPlayer.loadTrack(${i})">
        <div class="pl-emoji">${t.emoji}</div>
        <div class="pl-info">
          <div class="pl-title">${t.title}</div>
          <div class="pl-artist">${t.artist}</div>
        </div>
        <div class="pl-duration">${Math.floor(this.trackDuration/60)}:${String(this.trackDuration%60).padStart(2,'0')}</div>
      </div>
    `).join('');
  }
}

// Initialize when page loads
window.musicPlayer = null;
document.addEventListener('DOMContentLoaded', () => {
  window.musicPlayer = new MusicPlayer();
});
