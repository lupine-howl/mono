// src/ui/task-viewer.js
import { LitElement, html, css } from "lit";

// Psychedelic swirling vortex + lightweight WebAudio.
export class TaskViewer extends LitElement {
  static styles = css`
    :host { display: block; }
    .wrap { position: relative; display: grid; place-items: center; }
    canvas {
      width: 448px; height: 576px;
      border: 1px solid #1f1f22; border-radius: 8px; background: #000;
    }
    .audioBtn {
      position: absolute; top: 8px; right: 8px;
      padding: 6px 8px; border-radius: 8px; border: 1px solid #2a2a30;
      background: #0b0b0c; color: inherit; cursor: pointer; font: inherit;
      opacity: 0.9;
    }
  `;

  constructor() { super(); this._raf = 0; this._last = 0; this._audio = null; }

  render() {
    return html`
      <div class="wrap">
        <canvas id="c" width="448" height="576"></canvas>
        <button id="audio" class="audioBtn" title="Toggle psychedelic audio" aria-label="Toggle audio">🔇</button>
      </div>
    `;
  }

  firstUpdated() {
    this.#initCanvas();
    this.#start();
    const btn = this.renderRoot.getElementById('audio');
    btn?.addEventListener('click', () => this.#toggleAudio());
    // Also allow starting by clicking the canvas.
    this.renderRoot.getElementById('c')?.addEventListener('click', () => this.#toggleAudio());
  }
  disconnectedCallback() {
    super.disconnectedCallback?.();
    cancelAnimationFrame(this._raf); this._raf = 0;
    // Tear down audio
    const a = this._audio;
    if (a?.oscA) { try { a.oscA.stop(); } catch {}
      try { a.oscB.stop(); } catch {} }
    if (a?.ctx) { try { a.ctx.close(); } catch {} }
    this._audio = null;
  }

  #initCanvas() {
    const c = this.renderRoot.getElementById('c');
    const ctx = c.getContext('2d');
    const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
    c.width = Math.floor(448 * dpr); c.height = Math.floor(576 * dpr);
    c.style.width = '448px'; c.style.height = '576px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._c = c; this._ctx = ctx;
  }

  #start() {
    const loop = (t) => { this.#draw(t || 0); this._raf = requestAnimationFrame(loop); };
    this._raf = requestAnimationFrame(loop);
  }

  async #toggleAudio() {
    // Create or toggle WebAudio with a user gesture.
    if (!this._audio) {
      const ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = 0.05; master.connect(ctx.destination);
      const mix = ctx.createGain(); mix.gain.value = 0.7; mix.connect(master);

      const oscA = ctx.createOscillator(); oscA.type = 'sine'; oscA.frequency.value = 140; oscA.detune.value = -7;
      const oscB = ctx.createOscillator(); oscB.type = 'sawtooth'; oscB.frequency.value = 70; oscB.detune.value = +3;

      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 1.1; mix.connect(filter);
      const pan = ctx.createStereoPanner(); filter.connect(pan); pan.connect(master);

      oscA.connect(mix); oscB.connect(mix);
      oscA.start(); oscB.start();

      this._audio = { ctx, master, mix, oscA, oscB, filter, pan };
      await ctx.resume();
      this.#updateAudioButton();
      return;
    }

    const ctx = this._audio.ctx;
    if (ctx.state === 'running') await ctx.suspend(); else await ctx.resume();
    this.#updateAudioButton();
  }

  #updateAudioButton() {
    const btn = this.renderRoot.getElementById('audio');
    const running = !!this._audio && this._audio.ctx.state === 'running';
    if (btn) btn.textContent = running ? '🔊' : '🔇';
  }

  #updateAudio(time) {
    const a = this._audio; if (!a || a.ctx.state !== 'running') return;
    // Slow evolving modulations to keep it psychedelic but unobtrusive.
    const t = time;
    const mod1 = Math.sin(t * 0.5) * 0.5 + 0.5; // 0..1
    const mod2 = Math.sin(t * 0.2 + Math.sin(t * 0.11) * 0.5); // -1..1

    a.filter.frequency.setValueAtTime(200 + mod1 * 1800, a.ctx.currentTime);
    a.pan.pan.setValueAtTime(mod2, a.ctx.currentTime);
    a.master.gain.setValueAtTime(0.03 + (Math.sin(t * 0.4) + 1) * 0.02, a.ctx.currentTime);
    a.oscA.detune.setValueAtTime(Math.sin(t * 0.13) * 20, a.ctx.currentTime);
    a.oscB.detune.setValueAtTime(Math.cos(t * 0.17) * 10, a.ctx.currentTime);
  }

  #draw(t) {
    const ctx = this._ctx; if (!ctx) return;
    const W = 448, H = 576, cx = W / 2, cy = H / 2;
    const time = t * 0.001; // seconds

    // gentle fade to black for trails
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, W, H);

    // vibrant additive blend for glow
    ctx.globalCompositeOperation = 'lighter';

    const arms = 4;           // spiral arms
    const points = 260;       // points per arm (balance quality vs perf)
    const baseHue = (time * 80) % 360;

    for (let a = 0; a < arms; a++) {
      const armPhase = (a / arms) * Math.PI * 2;
      for (let i = 0; i < points; i++) {
        const k = i + a * 7; // stagger
        const ang = k * 0.25 + time * 1.3 + armPhase; // spiral angle
        let r = 6 + k * 1.6; // radius grows with i
        r += Math.sin(time * 2 + k * 0.35) * 8; // wobble

        const x = cx + Math.cos(ang) * r * 0.98;
        const y = cy + Math.sin(ang * 1.03) * r * 0.98; // slight warp for depth

        const hue = (baseHue + k * 1.5) % 360;
        const alpha = 0.9;
        const sz = 1.2 + (Math.sin(time * 3 + k * 0.5) + 1) * 0.8; // pulsate
        ctx.fillStyle = `hsl(${hue} 95% 62% / ${alpha})`;
        ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.fill();
      }
    }

    // subtle center glow
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.35);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, Math.min(W, H) * 0.5, 0, Math.PI * 2); ctx.fill();

    ctx.globalCompositeOperation = 'source-over';

    // drive audio LFOs with the same timebase
    if (this._audio) this.#updateAudio(time);
  }
}

if (!customElements.get('task-viewer'))
  customElements.define('task-viewer', TaskViewer);
