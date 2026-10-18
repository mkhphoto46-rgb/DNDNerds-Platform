import { randomUUID } from "node:crypto";
import { sqlClient } from "../db/client.js";

// J2O-A worker processes IN_APP only. No network delivery, Telegram, Bale, SMTP or Web Push.
export async function processInAppNotificationBatch(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Notification worker limit must be 1..100");
  }
  const token = randomUUID();
  const claimed = await sqlClient<{ id: string }[]>`
    WITH ready AS (
      SELECT id FROM seller_notification_outbox
      WHERE channel = 'IN_APP'
        AND (
          (status = 'PENDING' AND available_at <= now())
          OR (status = 'PROCESSING' AND locked_until < now())
        )
      ORDER BY available_at ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE seller_notification_outbox n
    SET status = 'PROCESSING', claim_token = ${token}::uuid,
        attempts = n.attempts + 1,
        locked_until = now() + interval '2 minutes', updated_at = now()
    FROM ready WHERE n.id = ready.id
    RETURNING n.id
  `;
  let delivered = 0;
  for (const entry of claimed) {
    const done = await sqlClient<{ id: string }[]>`
      UPDATE seller_notification_outbox
      SET status = 'DELIVERED', delivered_at = now(), locked_until = NULL,
          claim_token = NULL, updated_at = now(), last_error = NULL
      WHERE id = ${entry.id}::uuid AND claim_token = ${token}::uuid
        AND status = 'PROCESSING' AND channel = 'IN_APP'
      RETURNING id
    `;
    delivered += done.length;
  }
  return { claimed: claimed.length, delivered };
}
