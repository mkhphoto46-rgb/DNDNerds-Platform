import type { FastifyInstance } from "fastify";
import { desc,eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { siteFeedback,users,marketplaceAdminAuditLogs } from "../db/schema.js";
import { requireAuthUser } from "../auth/session.js";
import { getAdmin } from "./admin.js";
import { consumeRateLimit } from "../security/redis-rate-limit.js";
const base="/api/v1/game-hub";
const input=z.object({kind:z.enum(["SUGGESTION","CRITICISM","COMMENT"]),subject:z.string().trim().min(3).max(120),message:z.string().trim().min(10).max(3000)}).strict();
export async function registerFeedbackRoutes(app:FastifyInstance) {
 app.post(`${base}/feedback`,async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:"برای ثبت پیام وارد حساب شو."}});
  const parsed=input.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:{message:"نوع پیام، عنوان و متن را کامل کن. فقط متن پذیرفته می‌شود."}});
  const limit=await consumeRateLimit(`feedback:${user.id}`,5,600_000);
  if(limit.limited)return reply.header("Retry-After",limit.retryAfterSeconds).code(429).send({error:{message:"در هر ۱۰ دقیقه حداکثر ۵ پیام می‌توان ثبت کرد. کمی بعد دوباره تلاش کن."}});
  const [row]=await db.insert(siteFeedback).values({userId:user.id,...parsed.data}).returning();
  return reply.code(201).send({data:row});
 });
 app.get(`${base}/feedback/me`,async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:"برای دیدن پیام‌ها وارد حساب شو."}});
  return {data:await db.select().from(siteFeedback).where(eq(siteFeedback.userId,user.id)).orderBy(desc(siteFeedback.createdAt)).limit(20)};
 });
 app.get(`${base}/admin/feedback`,async(request,reply)=>{
  if(!await getAdmin(request))return reply.code(403).send({error:{message:"دسترسی مدیر لازم است."}});
  return {data:await db.select({id:siteFeedback.id,userId:siteFeedback.userId,username:users.username,kind:siteFeedback.kind,subject:siteFeedback.subject,message:siteFeedback.message,status:siteFeedback.status,createdAt:siteFeedback.createdAt}).from(siteFeedback).innerJoin(users,eq(siteFeedback.userId,users.id)).orderBy(desc(siteFeedback.createdAt)).limit(100)};
 });
 app.put<{Params:{feedbackId:string}}>(`${base}/admin/feedback/:feedbackId/status`,async(request,reply)=>{
  const admin=await getAdmin(request);if(!admin)return reply.code(403).send({error:{message:"دسترسی مدیر لازم است."}});
  const id=z.string().uuid().safeParse(request.params.feedbackId),parsed=z.object({status:z.enum(["NEW","READ","RESOLVED"])}).strict().safeParse(request.body);
  if(!id.success||!parsed.success)return reply.code(400).send({error:{message:"وضعیت معتبر نیست."}});
  const row=await db.transaction(async tx=>{
   const [updated]=await tx.update(siteFeedback).set({status:parsed.data.status,updatedAt:new Date()}).where(eq(siteFeedback.id,id.data)).returning();
   if(updated)await tx.insert(marketplaceAdminAuditLogs).values({adminUserId:admin.userId,action:"UPDATE_FEEDBACK_STATUS",entityType:"site_feedback",entityId:updated.id,details:JSON.stringify({status:updated.status})});
   return updated;
  });
  if(!row)return reply.code(404).send({error:{message:"پیام پیدا نشد."}});return {data:row};
 });
}
