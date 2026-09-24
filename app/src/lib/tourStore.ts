const DONE_KEY = "cairn-tour-done-v1";

// Per-viewer convenience only. Blocked storage means the tour shows again next visit.
export function tourDone() {
  try {
    return localStorage.getItem(DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTourDone() {
  try { localStorage.setItem(DONE_KEY, "1"); } catch { /* see tourDone */ }
}
