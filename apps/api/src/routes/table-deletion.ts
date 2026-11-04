import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthUser } from '../auth/session.js';
import { sqlClient } from '../db/client.js';
import { notifyMembershipRevoked } from '../integrations/vtt-membership-revoked.js';
import { processTableDeletion } from '../jobs/table-deletion.js';
import { shouldRunTableDeletionWorker } from '../jobs/table-deletion-worker-policy.js';

export async function registerTableDeletionRoutes(app: FastifyInstance) {
 app.delete<{Params:{tableId:string}}>('/api/v1/game-hub/tables/:tableId',async(request,reply) => {
  const user = await requireAuthUser(request);
  if (!user) return reply.code(401).send({error:{message:'برای ادامه وارد حساب خود شوید.'}});
  const parsed = z.object({confirmTitle:z.string().trim().min(1).max(120)}).safeParse(request.body);
  if (!z.string().uuid().safeParse(request.params.tableId).success || !parsed.success) return reply.code(400).send({error:{message:'نام میز را وارد کنید.'}});
  let seated: readonly { user_id: unknown }[] = [];
  const outcome = await sqlClient.begin(async tx => {
   const [table] = await tx`SELECT host_user_id,title FROM game_tables WHERE id=${request.params.tableId} FOR UPDATE`;
   if (!table) return 404;
   if (table.host_user_id!==user.id) return 403;
   if (table.title!==parsed.data.confirmTitle) return 409;
   await tx`INSERT INTO game_table_deletions(table_id,requested_by) VALUES(${request.params.tableId},${user.id}) ON CONFLICT(table_id) DO NOTHING`;
   await tx`UPDATE game_tables SET status='HIDDEN',updated_at=now() WHERE id=${request.params.tableId}`;
   seated = await tx`SELECT user_id FROM game_applications WHERE table_id=${request.params.tableId} AND status='ACCEPTED'`;
   return 202;
  });
  // RC7: the seated players are read before the deletion job removes the rows.
  if (outcome===202) notifyMembershipRevoked(seated.map(seat=>({platformTableId:request.params.tableId,platformUserId:String(seat.user_id),reason:'table-deleted'})),request.log);
  if(outcome!==202) return reply.code(outcome).send({error:{message:outcome===409?'نام واردشده با نام میز یکسان نیست.':outcome===403?'فقط سازندهٔ میز می‌تواند آن را حذف کند.':'میز پیدا نشد.'}});
  const done = await processTableDeletion(request.params.tableId);
  return reply.code(done?200:202).send({data:done?{deleted:true}:{deletionPending:true}});
 });
 let running:Promise<void>|undefined;
 const tick = () => {
  if (running) return;
  running = processTableDeletion().then(()=>{}).catch(error=>app.log.error({err:error},'Table deletion retry failed')).finally(()=>{running=undefined;});
 };
 let timer:ReturnType<typeof setInterval>|undefined;
 app.addHook('onReady',async()=>{if(shouldRunTableDeletionWorker(process.env)){timer=setInterval(tick,20000);timer.unref();tick();}});
 app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
}
