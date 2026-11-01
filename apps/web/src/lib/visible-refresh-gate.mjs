/** Serialize refreshes, retaining at most one invalidation while a request runs. */
export function createRefreshGate(work, isVisible = () => true) {
  let running = false;
  let pending = false;
  return async function refresh() {
    if (!isVisible()) return;
    if (running) { pending = true; return; }
    running = true;
    try { await work(); }
    finally {
      running = false;
      if (pending) { pending = false; void refresh(); }
    }
  };
}
