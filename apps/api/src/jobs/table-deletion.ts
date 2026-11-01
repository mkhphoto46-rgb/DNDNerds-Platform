import { sqlClient } from '../db/client.js';
import { requestVttTableDeletion } from '../integrations/vtt-table-deletion.js';

/** The lease spans the cross-store operation; VTT tombstones make retries idempotent. */
export async function processTableDeletion(tableId?: string): Promise<boolean> {
 const job = await sqlClient.begin(async tx => {
  const rows = tableId
   ? await tx`SELECT d.table_id,t.host_user_id FROM game_table_deletions d JOIN game_tables t ON t.id=d.table_id WHERE d.table_id=${tableId} AND (d.lease_until IS NULL OR d.lease_until<now()) LIMIT 1 FOR UPDATE OF d SKIP LOCKED`
   : await tx`SELECT d.table_id,t.host_user_id FROM game_table_deletions d JOIN game_tables t ON t.id=d.table_id WHERE d.lease_until IS NULL OR d.lease_until<now() ORDER BY d.attempt_count,d.requested_at LIMIT 1 FOR UPDATE OF d SKIP LOCKED`;
  const row = rows[0];
  if (!row) return null;
  const [lease] = await tx`UPDATE game_table_deletions SET lease_until=now()+interval '60 seconds',attempt_count=attempt_count+1 WHERE table_id=${row.table_id} RETURNING lease_until::text`;
  return { tableId:String(row.table_id), hostUserId:String(row.host_user_id), lease:lease!.lease_until };
 });
 if (!job) return false;
 const deleted = await requestVttTableDeletion({tableId:job.tableId,hostUserId:job.hostUserId},process.env.VTT_BRIDGE_SECRET?.trim() ?? '');
 await sqlClient.begin(async tx => {
  const leases = await tx`SELECT table_id FROM game_table_deletions WHERE table_id=${job.tableId} AND lease_until=${job.lease} FOR UPDATE`;
  if (!leases.length) return;
  if (deleted) await tx`DELETE FROM game_tables WHERE id=${job.tableId} AND status='HIDDEN'`;
  else await tx`UPDATE game_table_deletions SET lease_until=NULL,last_error='VTT_DELETE_UNAVAILABLE' WHERE table_id=${job.tableId}`;
 });
 return deleted;
}
