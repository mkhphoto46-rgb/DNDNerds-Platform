// B74: a form submit that is already saving ignores further submits, even ones that
// arrive before React has re-rendered the disabled button.
export function singleFlight<Args extends unknown[]>(run: (...args: Args) => Promise<unknown>) {
  let pending = false;
  return async (...args: Args): Promise<void> => {
    if (pending) return;
    pending = true;
    try { await run(...args); }
    finally { pending = false; }
  };
}
