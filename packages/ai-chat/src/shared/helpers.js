// src/shared/services/ai-chat/helpers.js
export function nid() {
  return Math.random().toString(36).slice(2);
}

export function safeParse(s) {
  if (!s || typeof s !== "string") return null;
  try { return JSON.parse(s); } catch { return null; }
}

export function findMessage(svc, id) {
  return svc.state.messages.find(m => m.id === id);
}
