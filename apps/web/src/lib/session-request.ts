/** One short-lived, private, in-memory session lookup for all browser consumers. */
export function createSessionRequest(
  request: () => Promise<Response>,
  now: () => number = Date.now,
) {
  let generation = 0;
  let cached: { response: Response; expires: number } | undefined;
  let pending: Promise<Response> | undefined;
  return {
    invalidate() {
      generation++;
      cached = undefined;
      pending = undefined;
    },
    async get(): Promise<Response> {
      if (cached && now() < cached.expires) return cached.response.clone();
      if (!pending) {
        const version = generation;
        const current = request().then(response => {
          if (version === generation && (response.ok || response.status === 401)) {
            cached = { response: response.clone(), expires: now() + 30_000 };
          }
          return response;
        }).finally(() => {
          if (version === generation) pending = undefined;
        });
        pending = current;
      }
      return (await pending).clone();
    },
  };
}
