/** Accept only local page paths, preserving their query and anchor. */
export function safeAuthDestination(requested: string | null): string {
  // Control characters are matched on purpose: they are stripped from user text.
  // oxlint-disable-next-line no-control-regex
  if (!requested?.startsWith("/") || /[\u0000-\u0020\\]/.test(requested)) return "/";
  try {
    const url = new URL(requested, "https://dndnerds.invalid");
    if (url.origin !== "https://dndnerds.invalid" || !/^\/(?!\/)[a-z0-9/_-]*$/i.test(url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
