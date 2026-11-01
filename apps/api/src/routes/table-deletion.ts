import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthUser } from '../auth/session.js';
import { sqlClient } from '../db/client.js';
import { processTableDeletion } from '../jobs/table-deletion.js';

export async function registerTableDeletionRoutes(app: FastifyInstance) {
 app.delete<{Params:{tableId:string}}>('/api/v1/game-hub/tables/:tableId',async(request,reply) => {
  const user = await requireAuthUser(request);
  if (!user) return reply.code(401).send({error:{message:'برای ادامه وارد حساب خود شوید.'}});
  const parsed = z.object({confirmTitle:z.string().trim().min(1).max(120)}).safeParse(request.body);
  if (!z.string().uuid().safeParse(request.params.tableId).success || !parsed.success) return reply.code(400).send({error:{message:'نام میز را وارد کنید.'}});
  const outcome = await sqlClient.begin(async tx => {
   const [table] = await tx`SELECT host_user_id,title FROM game_tables WHERE id=${request.params.tableId} FOR UPDATE`;
   if (!table) return 404;
   if (table.host_user_id!==user.id) return 403;
   if (table.title!==parsed.data.confirmTitle) return 409;
   await tx`INSERT INTO game_table_deletions(table_id,requested_by) VALUES(${request.params.tableId},${user.id}) ON CONFLICT(table_id) DO NOTHING`;
   await tx`UPDATE game_tables SET status='HIDDEN',updated_at=now() WHERE id=${request.params.tableId}`;
   return 202;
  });
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
 app.addHook('onReady',async()=>{if(process.env.NODE_ENV!=='test'){timer=setInterval(tick,20000);timer.unref();tick();}});
 app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await running;});
}
