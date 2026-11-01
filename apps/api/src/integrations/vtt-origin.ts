/** Never forward bridge signatures to a user-controlled or public origin. */
export function resolveVttOrigin(value: string | undefined): URL | null {
  try {
    const url = new URL(value ?? "http://127.0.0.1:4200");
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "host.docker.internal"].includes(url.hostname)
      && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash ? url : null;
  } catch { return null; }
}
