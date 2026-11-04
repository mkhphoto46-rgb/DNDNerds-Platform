export const INITIAL_XP = 1000;
export const XP_PER_LEVEL = 1000;

export type PresenceMode = "site" | "game";

// Award these only from a verified Arena result when PvP goes live.
export function pvpXpForOutcome(outcome: "win" | "loss") {
  return outcome === "win" ? 100 : 50;
}

export function xpSnapshot(totalXp: number) {
  return {
    totalXp,
    level: Math.floor(totalXp / XP_PER_LEVEL) + 1,
    levelXp: totalXp % XP_PER_LEVEL,
    xpToNextLevel: XP_PER_LEVEL,
  };
}

export function accruePresence(activeSeconds: number, elapsedSeconds: number, mode: PresenceMode) {
  if (elapsedSeconds > 120) return { earned: 0, activeSeconds: 0 };
  const elapsed = Math.max(0, Math.min(90, elapsedSeconds));
  const accrued = activeSeconds + elapsed;
  const minutes = Math.floor(accrued / 60);
  return { earned: minutes * (mode === "game" ? 2 : 1), activeSeconds: Math.round((accrued % 60) * 1000) / 1000 };
}
