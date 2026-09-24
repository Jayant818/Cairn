const WELCOME_KEY = "cairn-welcome-done-v1";
const COACH_KEY = "cairn-coach-seen-v1";

// Per-viewer conveniences only. Blocked storage means the welcome shows again next visit.
function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // see read()
  }
}

export const welcomeDone = () => read(WELCOME_KEY) === "1";
export const markWelcomeDone = () => write(WELCOME_KEY, "1");

export function coachSeen(): string[] {
  try {
    const value = JSON.parse(read(COACH_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export const markCoachSeen = (step: string) => write(COACH_KEY, JSON.stringify([...new Set([...coachSeen(), step])]));

// The navbar Tour button replays everything.
export function resetTour() {
  write(WELCOME_KEY, null);
  write(COACH_KEY, null);
}
