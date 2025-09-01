import { css } from "lit";

export const sideWidgetStyles = css`
  :host {
    display: block;
    inline-size: 100%;
    max-inline-size: 100%;
    min-inline-size: 0;
    box-sizing: border-box; /* ← key: includes host padding/border in width */
    color: #999;
  }
  /* make descendants respect border-box too */
  *,
  *::before,
  *::after {
    box-sizing: inherit;
  }
  .wrap {
    display: grid;
  }
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }
  .title {
    padding-left: 9px;
    opacity: 0.5;
  }
  .btn {
    border: 1px solid #2a2a30;
    background: #0b0b0c;
    color: inherit;
    font: inherit;
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .list {
    display: grid;
    gap: 2px;
    max-height: 58vh;
    overflow: auto;
  }
  .item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto; /* name shrinks; menu stays tight */
    align-items: center;
    cursor: pointer;
    border-radius: 10px;
    padding: 6px 8px;
    min-inline-size: 0; /* allow shrink inside grid */
  }
  .item > div:first-child {
    min-inline-size: 0;
  } /* let name/input ellipsize */
  input[type="text"] {
    inline-size: 100%;
  }
  .item.active {
    background: rgba(125, 125, 125, 0.05);
    color: #eee;
  }
  .item:hover {
    background: rgba(125, 125, 125, 0.1);
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  input[type="text"] {
    box-sizing: border-box;
    border: 1px solid #2a2a30;
    background: #0b0b0c;
    color: inherit;
    font: inherit;
    border-radius: 8px;
    padding: 6px 8px;
    width: 100%;
  }
  .menu {
    opacity: 0;
    transition: opacity 120ms ease;
    pointer-events: none;
  }
  .item:hover .menu,
  .item.active:hover .menu {
    opacity: 1;
    pointer-events: auto;
  }
  smart-select.menu {
    --select-hover-bg: rgba(255, 255, 255, 0.08);
  }
`;
