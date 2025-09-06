// src/shared/services/ai-chat/prefs.js
import { PREFS_KEY, PREF_KEYS } from "./constants.js";

export function loadPrefs() {
  try {
    return typeof localStorage === "undefined"
      ? null
      : JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
  } catch {
    return null;
  }
}

export function savePrefs(state) {
  try {
    if (typeof localStorage === "undefined") return;
    const out = {};
    for (const k of PREF_KEYS) out[k] = state[k];
    localStorage.setItem(PREFS_KEY, JSON.stringify(out));
  } catch {}
}
