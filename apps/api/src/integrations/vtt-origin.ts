/** Never forward bridge signatures to a user-controlled or public origin. */
export function resolveVttOrigin(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "http://127.0.0.1:4200");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "host.docker.internal"].includes(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url : null;
  } catch { return null; }
}

type Env = Record<string, string | undefined>;

/**
 * B72: without VTT_INTERNAL_URL the bridge silently uses http://127.0.0.1:4200.
 * That default stays (deployments may rely on it), but a site that has a public
 * table-app address and no bridge address gets a startup warning.
 */
export function vttConfigWarnings(env: Env = process.env): string[] {
  if (!env.VTT_PUBLIC_URL?.trim()) return [];
  const internal = env.VTT_INTERNAL_URL?.trim();
  if (!internal) return ["VTT_PUBLIC_URL is set but VTT_INTERNAL_URL is not; the table-app bridge falls back to http://127.0.0.1:4200. Set VTT_INTERNAL_URL to the table app's loopback address."];
  if (!resolveVttOrigin(internal)) return ["VTT_INTERNAL_URL must be a loopback http origin (127.0.0.1, localhost or host.docker.internal) with no path; the table-app bridge is off."];
  return [];
}

/** B72: the join-by-code answer when the bridge failed because VTT_INTERNAL_URL is missing. */
export function inviteBridgeError(status: number, env: Env = process.env): { code: string; message: string } | null {
  if (status !== 503 || env.VTT_INTERNAL_URL?.trim()) return null;
  return { code: "VTT_INTERNAL_URL_MISSING", message: "اتصال داخلی سرور بازی تنظیم نشده است. مدیر سایت باید VTT_INTERNAL_URL را تنظیم کند." };
}
