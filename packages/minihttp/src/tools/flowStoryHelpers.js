// Small helpers used by flowStoryLab

export const MODE_META = {
  ethical_dilemma: {
    label: "Ethical dilemma",
    listPrompt: (cfg) =>
      `List 12 distinct ${cfg.style} ethical dilemmas suitable for ages ${cfg.age}. Respond as a numbered list of short titles.`,
    stageSystem: (cfg) =>
      `You are an expert ethical-dilemma designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a brief scene (2–4 sentences) that frames the ethical tension clearly and neutrally.
Then produce ${cfg.branching} distinct options (short, action-oriented). Avoid graphic content.`,
    escalate: (nextStage) =>
      `Escalate the ethical stakes for stage ${nextStage} by introducing a new constraint, trade-off, or stakeholder.`,
    wrapupNote:
      "Offer 2–3 short reflection questions that encourage perspective-taking (we'll render separately).",
  },
  adventure: {
    label: "Choose-your-own adventure",
    listPrompt: (cfg) =>
      `List 12 ${cfg.style} adventure hooks suitable for ages ${cfg.age}. Numbered list of short titles.`,
    stageSystem: (cfg) =>
      `You are an expert adventure designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a vivid but concise scene (2–4 sentences) ending in a clear decision point.
Then produce ${cfg.branching} distinct options (verbs up front).`,
    escalate: (nextStage) =>
      `Raise stakes for stage ${nextStage} with a twist, time pressure, or new obstacle.`,
    wrapupNote:
      "Write a 2–4 sentence epilogue resolving the most recent choice.",
  },
  mystery: {
    label: "Mystery",
    listPrompt: (cfg) =>
      `List 12 ${cfg.style} mystery premises suitable for ages ${cfg.age}. Numbered list of short titles.`,
    stageSystem: (cfg) =>
      `You are an expert mystery designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a clue-rich scene (2–4 sentences). Then produce ${cfg.branching} investigation options.`,
    escalate: (nextStage) =>
      `For stage ${nextStage}, deepen the mystery with a clue, red herring, or suspect behavior.`,
    wrapupNote:
      "Reveal the key insight that ties the clues together (no gore).",
  },
  survival: {
    label: "Survival scenario",
    listPrompt: (cfg) =>
      `List 12 ${cfg.style} survival scenarios suitable for ages ${cfg.age}. Numbered short titles.`,
    stageSystem: (cfg) =>
      `You are an expert survival scenario writer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a concise survival scene (2–4 sentences). Then produce ${cfg.branching} pragmatic options.`,
    escalate: (nextStage) =>
      `For stage ${nextStage}, introduce resource constraints, environment hazards, or time limits.`,
    wrapupNote: "Summarise the final status and one practical takeaway.",
  },
  social_drama: {
    label: "Social drama",
    listPrompt: (cfg) =>
      `List 12 ${cfg.style} school/community social situations suitable for ages ${cfg.age}. Numbered short titles.`,
    stageSystem: (cfg) =>
      `You are an expert social scenario designer. Keep content appropriate for ages ${cfg.age}. Tone: ${cfg.style}.
Write a short scene (2–4 sentences) focusing on relationships and consequences. Then produce ${cfg.branching} options.`,
    escalate: (nextStage) =>
      `For stage ${nextStage}, add a social complication (misunderstanding, reputation cost, conflicting goals).`,
    wrapupNote: "Offer 2 practical de-escalation or repair strategies.",
  },
};

export function ageGuard(age) {
  switch (age) {
    case "5-8":
      return "No violence, no injuries, no romance; simple language (~Grade 2–3). Positive framing, supportive adults.";
    case "9-12":
      return "No gore or romance; low peril; age-appropriate language (~Grade 4–6). Emphasise teamwork and learning.";
    case "13-15":
      return "PG-level content; no graphic harm. Keep language clean. Emphasise agency and consequences.";
    case "16-18":
      return "M-level themes allowed; avoid explicit content. Nuanced consequences; realistic dialogue.";
    default:
      return "General content; avoid graphic depictions. Be thoughtful and respectful.";
  }
}

export function beatFor(stage, total) {
  if (stage <= 1) return "Setup: establish protagonist/goal + gentle hook.";
  const mid = Math.ceil(total / 2);
  if (stage === mid) return "Midpoint: reveal twist or reframe the goal.";
  if (stage === total - 1)
    return "Crisis: toughest trade-off; consequences from prior choices bite.";
  if (stage >= total)
    return "Climax setup: immediate lead-in to ending; choices should be decisive.";
  return "Rising action: escalate stakes, add constraint, show consequences of last choice.";
}

export function clampBranching(n) {
  return Math.max(2, Math.min(4, Number(n) || 3));
}

export function makeRecap(ctx) {
  return [
    ctx.state.lastSummary ? `Recent recap: ${ctx.state.lastSummary}` : "",
    ctx.path?.length ? `Last choice: ${ctx.path.at(-1)?.choice}` : "",
    ctx.state.flags?.length ? `Flags: ${ctx.state.flags.join(", ")}` : "",
    ctx.state.inventory?.length
      ? `Inventory/Clues: ${ctx.state.inventory.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

export function evolveStateAfterChoice(ctx, chosen) {
  const total = ctx.maxStages || 5;
  const step = 1 / Math.max(2, total);
  ctx.state.progress = Math.min(1, (ctx.state.progress || 0) + step);
  ctx.state.tension = Math.min(1, (ctx.state.tension || 0) + 0.15);

  // tags/flags
  const lower = String(chosen).toLowerCase();
  const tags = [];
  if (lower.includes("help") || lower.includes("ally"))
    tags.push("ally_gained");
  if (lower.includes("wait") || lower.includes("hide")) tags.push("time_cost");
  if (
    lower.includes("risk") ||
    lower.includes("steal") ||
    lower.includes("fight")
  )
    tags.push("risk_taken");
  if (
    lower.includes("evidence") ||
    lower.includes("map") ||
    lower.includes("tool")
  )
    tags.push("resource_found");
  if (
    lower.includes("apolog") ||
    lower.includes("repair") ||
    lower.includes("trust")
  )
    tags.push("relationship_repair");

  ctx.state.flags.push(...tags);
  if (tags.includes("resource_found"))
    ctx.state.inventory.push(`asset@stage${ctx.stage}`);
  if (tags.includes("ally_gained")) {
    ctx.state.relations["ally"] = Math.min(
      1,
      (ctx.state.relations["ally"] || 0) + 0.5
    );
  }

  // rolling summary
  const last2 = (ctx.transcriptStages || [])
    .slice(-2)
    .map((s) => `${s.stage}:${s.choice ?? "—"}`)
    .join(", ");
  ctx.state.lastSummary = `Progress ${
    (ctx.state.progress * 100) | 0
  }%, tension ${(ctx.state.tension * 100) | 0}% — recent choices ${last2}`;

  // motifs
  (ctx.currentNarrative || "")
    .split(/\W+/)
    .filter((w) => w && w.length > 4)
    .slice(0, 8)
    .forEach((m) => ctx.state.motifs.add(m.toLowerCase()));
}

export function makeChoiceActions(options) {
  return options.map((opt, idx) => ({
    label: opt,
    tool: "__resume__",
    args: { choice: opt, choiceIndex: idx },
  }));
}
