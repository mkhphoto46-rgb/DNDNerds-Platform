// RC7: tell the table app when a player's right to a table ends on the website, so it
// can close their seat and session there too.
//
// Contract: POST {VTT_INTERNAL_URL}/api/platform/membership-revoked
//   body    {"platformTableId": uuid | null, "platformUserId": uuid, "reason": Reason}
//           (keys in this order; platformTableId null = every table of that user)
//   headers X-Platform-Timestamp: milliseconds since the epoch
//           X-Platform-Signature: hex HMAC-SHA256(VTT_BRIDGE_SECRET, `${timestamp}:${body}`)
// The same signing scheme as /api/platform/invite. Fire-and-forget: 5 s timeout,
// logged, never throws into the request that triggered it.
import { createHmac } from "node:crypto";

import { resolveVttOrigin } from "./vtt-origin.js";

export type MembershipRevokedReason =
  | "seat-withdrawn" | "table-closed" | "table-hidden" | "table-deleted"
  | "account-banned" | "account-suspended" | "logout";

export type MembershipRevoked = { platformTableId: string | null; platformUserId: string; reason: MembershipRevokedReason };

type Log = { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; debug: (obj: object, msg: string) => void };

export function membershipRevokedRequest(input: MembershipRevoked, secret: string, now = Date.now()) {
  const body = JSON.stringify({ platformTableId: input.platformTableId, platformUserId: input.platformUserId, reason: input.reason });
  const timestamp = String(now);
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Platform-Timestamp": timestamp,
      "X-Platform-Signature": createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex"),
    },
  };
}

export async function sendMembershipRevoked(
  input: MembershipRevoked,
  options: { secret?: string; origin?: string; log: Log; request?: typeof fetch },
): Promise<boolean> {
  const secret = options.secret?.trim() ?? "";
  const target = resolveVttOrigin(options.origin);
  const context = { platformTableId: input.platformTableId, reason: input.reason };
  if (!target || secret.length < 32) {
    options.log.debug(context, "Membership revocation not sent: the table-app bridge is not configured");
    return false;
  }
  const { body, headers } = membershipRevokedRequest(input, secret);
  try {
    const response = await (options.request ?? fetch)(new URL("/api/platform/membership-revoked", target), {
      method: "POST", headers, body, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      options.log.warn({ ...context, status: response.status }, "Table app refused the membership revocation");
      return false;
    }
    options.log.info(context, "Membership revocation sent to the table app");
    return true;
  } catch (error) {
    options.log.warn({ ...context, error: error instanceof Error ? error.name : "Error" }, "Membership revocation could not reach the table app");
    return false;
  }
}

/** Fire-and-forget wrapper for routes: reads the bridge settings and never throws. */
export function notifyMembershipRevoked(inputs: MembershipRevoked | MembershipRevoked[], log: Log): void {
  for (const input of Array.isArray(inputs) ? inputs : [inputs]) {
    void sendMembershipRevoked(input, { secret: process.env.VTT_BRIDGE_SECRET, origin: process.env.VTT_INTERNAL_URL, log }).catch(() => {});
  }
}
