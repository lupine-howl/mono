// components/shimmer-effect.js
import { LitElement, html, css } from "lit";

export class ShimmerEffect extends LitElement {
  static properties = {
    /** "text" = shimmer clipped to text; "block" = shimmer across the box */
    mode: { type: String, reflect: true }, // "text" | "block"
    /** Seconds per loop (e.g. 1.2) */
    speed: { type: Number, reflect: true },
    /** Gradient angle in degrees (e.g. 90) */
    angle: { type: Number, reflect: true },
    /** Pause animation */
    paused: { type: Boolean, reflect: true },
    /** Announce politely for screen readers when present */
    announce: { type: Boolean, reflect: true },
  };

  constructor() {
    super();
    this.mode = "text";
    this.speed = 20;
    this.angle = 90;
    this.paused = false;
    this.announce = false;
  }

  static styles = css`
    :host {
      /* Layout */
      display: inline-block;

      /* Customizable via CSS variables */
      --shimmer-base: rgba(255, 255, 255, 1);
      --shimmer-peak: rgba(14, 14, 14, 1);
      --shimmer-size: 1000% 100%;
    }

    .wrap {
      display: inline-block; /* ensure it sizes to content */
      width: max-content; /* don’t compress in grid/flex/fit-content parents */

      background-image: linear-gradient(
          var(--shimmer-angle, 90deg),
          var(--shimmer-base) 0%,
          var(--shimmer-base) 25%,
          var(--shimmer-peak) 50%,
          var(--shimmer-base) 75%,
          var(--shimmer-base) 100%
        ),
        linear-gradient(
          0deg,
          var(--shimmer-ink, currentColor),
          var(--shimmer-ink, currentColor)
        );
      background-size: var(--shimmer-size), 100% 100%;
      background-position: 0 0, 0 0; /* move only the first layer */
      background-repeat: repeat-x;
      animation: shimmer var(--shimmer-speed, 20s) linear infinite;
    }
    :host([mode="text"]) .wrap {
      color: transparent;
      -webkit-background-clip: text;
      background-clip: text;
    }

    /* Block mode: show gradient across the box (skeleton) */
    :host([mode="block"]) {
      /* Provide a default skeleton look; override as needed */
      background: #2a2a2f; /* base surface under shimmer */
      border-radius: 8px;
    }
    :host([mode="block"]) .wrap {
      /* fill available host size */
      display: block;
      width: 100%;
      height: 100%;
    }

    /* Pause control */
    :host([paused]) .wrap {
      animation-play-state: paused;
    }

    /* Reduced motion preference */
    @media (prefers-reduced-motion: reduce) {
      .wrap {
        animation: none;
        background-position: 50% 0;
      }
    }

    @keyframes shimmer {
      0% {
        background-position: 0% 0;
      }
      100% {
        background-position: -1000% 0;
      }
    }
  `;

  updated(changed) {
    // Reflect angle/speed to CSS vars for smoother updates
    if (changed.has("angle")) {
      this.style.setProperty("--shimmer-angle", `${this.angle}deg`);
    }
    if (changed.has("speed")) {
      this.style.setProperty("--shimmer-speed", `${this.speed}s`);
    }
  }

  render() {
    return html`
      <span
        class="wrap"
        role=${this.announce ? "status" : "presentation"}
        aria-live=${this.announce ? "polite" : "off"}
      >
        <slot></slot>
      </span>
    `;
  }
}

if (!customElements.get("shimmer-effect")) {
  customElements.define("shimmer-effect", ShimmerEffect);
}
