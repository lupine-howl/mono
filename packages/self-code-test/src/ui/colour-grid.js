// src/ui/colour-grid.js
import { LitElement, html, css } from "lit";

export class ColourGrid extends LitElement {
  static styles = css`
    :host { display: block; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, 16px);
      grid-gap: 4px;
      justify-content: center;
      padding: 8px;
    }
    .cell {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); filter: brightness(0.9); }
      50% { transform: scale(1.08); filter: brightness(1.25); }
    }
  `;

  static properties = {
    size: { type: Number }
  };

  constructor() {
    super();
    this.size = 10; // determines grid size (size x size)
  }

  render() {
    const cells = Array.from({ length: this.size * this.size });
    return html`
      <div class="grid" aria-label="Colour grid">
        ${cells.map((_, idx) => {
          const hue = (idx * 360) / cells.length;
          const delay = (idx % this.size) * 0.04;
          const style = `background: hsl(${hue} 85% 60%); animation-delay: ${delay}s;`;
          return html`<div class="cell" style="${style}"></div>`;
        })}
      </div>
    `;
  }
}

if (!customElements.get('colour-grid'))
  customElements.define('colour-grid', ColourGrid);
