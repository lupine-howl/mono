// src/shared/services/ai-chat/constants.js
export const MAX_TURNS = 40;
export const PREFS_KEY = "aiChat.prefs.v1";
// Only persist model here; ToolsService persists tool selection itself.
export const PREF_KEYS = ["model", "mode"];
