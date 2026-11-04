/** Cookie-bearing presence probes must remain on the configured private host. */
export function vttPresenceUrl(value = process.env.VTT_INTERNAL_URL): URL {
  const origin = new URL(value ?? "http://127.0.0.1:4200");
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "host.docker.internal"].includes(origin.hostname)
    || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Invalid private VTT origin");
  }
  return new URL("/api/platform/xp-presence", origin);
}
