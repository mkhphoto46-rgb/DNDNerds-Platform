const ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * The visitor address recorded by the reverse proxy in front of the website
 * (nginx): the last X-Forwarded-For entry, which nginx appends itself, else
 * X-Real-IP. Earlier entries are client-supplied and are ignored.
 */
export function visitorAddress(incoming: Pick<Headers, "get">): string | null {
  const chain = incoming.get("x-forwarded-for");
  const last = chain?.split(",").map(part => part.trim()).filter(Boolean).at(-1);
  const candidate = last ?? incoming.get("x-real-ip")?.trim();
  return candidate && ADDRESS.test(candidate) ? candidate : null;
}
