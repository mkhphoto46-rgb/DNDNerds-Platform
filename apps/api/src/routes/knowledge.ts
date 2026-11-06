import type {FastifyInstance} from 'fastify';
import {and,desc,eq,sql} from 'drizzle-orm';
import {z} from 'zod';
import {db} from '../db/client.js';
import {users} from '../db/schema.js';
import {knowledgeHomebrew as posts} from '../db/knowledge-schema.js';
import {requireAuthUser} from '../auth/session.js';
import {homebrewInput} from './knowledge-input.js';
const base='/api/v1/game-hub/homebrew';
const uuid=z.string().uuid();
const listing={id:posts.id,title:posts.title,summary:posts.summary,kind:posts.kind,status:posts.status,createdAt:posts.createdAt,updatedAt:posts.updatedAt};
export async function registerKnowledgeRoutes(app:FastifyInstance){
 app.get<{Querystring:{page?:string}}>(base,async(request,reply)=>{
  const parsed=z.coerce.number().int().min(1).max(10000).default(1).safeParse(request.query.page);if(!parsed.success)return reply.code(400).send({error:{message:'شمارهٔ صفحه معتبر نیست.'}});
  const where=and(eq(posts.status,'PUBLISHED'),eq(users.status,'ACTIVE'));
  const [rows,[count]]=await Promise.all([db.select({...listing,author:users.username}).from(posts).innerJoin(users,eq(posts.authorUserId,users.id)).where(where).orderBy(desc(posts.createdAt),desc(posts.id)).limit(12).offset((parsed.data-1)*12),db.select({total:sql<number>`count(*)::int`}).from(posts).innerJoin(users,eq(posts.authorUserId,users.id)).where(where)]);
  return {data:rows,pagination:{page:parsed.data,limit:12,total:count?.total??0}};
 });
 app.get(`${base}/mine`,async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:'برای دیدن نوشته‌ها وارد حساب شو.'}});
  return {data:await db.select(listing).from(posts).where(eq(posts.authorUserId,user.id)).orderBy(desc(posts.updatedAt)).limit(100)};
 });
 app.get<{Params:{id:string}}>(`${base}/:id`,async(request,reply)=>{
  if(!uuid.safeParse(request.params.id).success)return reply.code(400).send({error:{message:'شناسهٔ نوشته معتبر نیست.'}});
  const [row]=await db.select({...listing,body:posts.body,authorUserId:posts.authorUserId,author:users.username,authorStatus:users.status}).from(posts).innerJoin(users,eq(posts.authorUserId,users.id)).where(eq(posts.id,request.params.id)).limit(1);
  const user=await requireAuthUser(request);
  if(!row||row.authorStatus!=='ACTIVE'||(row.status!=='PUBLISHED'&&row.authorUserId!==user?.id))return reply.code(404).send({error:{message:'نوشته پیدا نشد.'}});
  const {authorUserId,authorStatus:_authorStatus,...safe}=row;return {data:{...safe,mine:authorUserId===user?.id}};
 });
 app.post(base,{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:'برای نوشتن وارد حساب شو.'}});
  const parsed=homebrewInput.safeParse(request.body);if(!parsed.success)return reply.code(400).send({error:{message:'عنوان، معرفی و متن را کامل کن؛ انتشار حداقل ۲۰۰ نویسه متن نیاز دارد.'}});
  const [row]=await db.insert(posts).values({...parsed.data,authorUserId:user.id}).returning({id:posts.id});return reply.code(201).send({data:row});
 });
 app.put<{Params:{id:string}}>(`${base}/:id`,async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:'برای ویرایش وارد حساب شو.'}});
  const parsed=homebrewInput.safeParse(request.body);if(!uuid.safeParse(request.params.id).success||!parsed.success)return reply.code(400).send({error:{message:'اطلاعات نوشته معتبر نیست؛ متن انتشار حداقل ۲۰۰ نویسه است.'}});
  const [row]=await db.update(posts).set({...parsed.data,updatedAt:new Date()}).where(and(eq(posts.id,request.params.id),eq(posts.authorUserId,user.id))).returning({id:posts.id});if(!row)return reply.code(404).send({error:{message:'نوشته پیدا نشد یا متعلق به تو نیست.'}});return {data:row};
 });
 app.delete<{Params:{id:string}}>(`${base}/:id`,async(request,reply)=>{
  const user=await requireAuthUser(request);if(!user)return reply.code(401).send({error:{message:'برای حذف وارد حساب شو.'}});
  if(!uuid.safeParse(request.params.id).success)return reply.code(400).send({error:{message:'شناسهٔ نوشته معتبر نیست.'}});
  const [row]=await db.delete(posts).where(and(eq(posts.id,request.params.id),eq(posts.authorUserId,user.id))).returning({id:posts.id});if(!row)return reply.code(404).send({error:{message:'نوشته پیدا نشد یا متعلق به تو نیست.'}});return {data:{deleted:true}};
 });
}
