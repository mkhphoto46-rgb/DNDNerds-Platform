import type { FastifyInstance } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireAuthUser } from '../auth/session.js';
import { publicAccountId } from '../auth/public-identity.js';
import { resolveUserRef } from '../auth/public-user-ref.js';
import { db } from '../db/client.js';
import { dmProfiles, dmReactions, dmReviews, gameTableReactions, gameTableReviews, gameTables, users } from '../db/schema.js';
export type FeedbackKind = 'table' | 'dm';
export async function discoveryFeedback(kind: FeedbackKind, targetId: string, ownerId: string, viewerId?: string) {
 const votes = kind === 'table' ? gameTableReactions : dmReactions;
 const reviews = kind === 'table' ? gameTableReviews : dmReviews;
 const voteKey = kind === 'table' ? gameTableReactions.tableId : dmReactions.dmUserId;
 const reviewKey = kind === 'table' ? gameTableReviews.tableId : dmReviews.dmUserId;
 const [counts, total, mine, comments] = await Promise.all([
 db.select({ likes: sql<number>`count(*) filter (where ${votes.value} = 1)::int`, dislikes: sql<number>`count(*) filter (where ${votes.value} = -1)::int` }).from(votes).where(eq(voteKey,targetId)),
 db.select({ count: sql<number>`count(*)::int` }).from(reviews).where(eq(reviewKey,targetId)),
 viewerId ? db.select({value:votes.value}).from(votes).where(and(eq(voteKey,targetId),eq(votes.reviewerUserId,viewerId))).limit(1) : Promise.resolve([]),
 db.select({id:reviews.id,comment:reviews.comment,authorId:reviews.reviewerUserId,author:users.username,createdAt:reviews.createdAt,updatedAt:reviews.updatedAt}).from(reviews).innerJoin(users,eq(reviews.reviewerUserId,users.id)).where(eq(reviewKey,targetId)).orderBy(...(viewerId ? [desc(sql`${reviews.reviewerUserId} = ${viewerId}::uuid`)] : []), desc(reviews.updatedAt)).limit(100)
 ]);
 return { likes: counts[0]?.likes ?? 0, dislikes: counts[0]?.dislikes ?? 0, myVote: (mine[0]?.value ?? null) as 1|-1|null, canReact: Boolean(viewerId && viewerId!==ownerId), reviewCount:total[0]?.count ?? 0, reviews:comments.map(row=>publicReview(row,viewerId)) };
}
// B40: reviews name their author by username or public ID, never the account UUID.
function publicReview<T extends {authorId:string;author:string|null}>({authorId,...row}:T,viewerId?:string){
 const authorPublicId=publicAccountId(authorId);
 return {...row,authorPublicId,author:row.author ?? `بازیکن ${authorPublicId.slice(0,6)}`,mine:authorId===viewerId};
}
// List pages fetch every target in four bounded queries; only the latest three
// comments per target leave PostgreSQL.
export async function discoveryFeedbackList(kind: FeedbackKind, targets: {id:string;ownerId:string}[], viewerId?: string) {
 const result = new Map<string, Omit<Awaited<ReturnType<typeof discoveryFeedback>>, "reviews"> & {recentReviews: Awaited<ReturnType<typeof discoveryFeedback>>["reviews"]}>();
 if (!targets.length) return result;
 const voteTable = sql.raw(kind === "table" ? "game_table_reactions" : "dm_reactions");
 const reviewTable = sql.raw(kind === "table" ? "game_table_reviews" : "dm_reviews");
 const key = sql.raw(kind === "table" ? "table_id" : "dm_user_id");
 const ids = sql`(${sql.join(targets.map(target => sql`${target.id}::uuid`), sql`, `)})`;
 const [counts, totals, mine, comments] = await Promise.all([
 db.execute<{targetId:string;likes:number;dislikes:number}>(sql`select ${key} as "targetId", count(*) filter (where value=1)::int as likes, count(*) filter (where value=-1)::int as dislikes from ${voteTable} where ${key} in ${ids} group by ${key}`),
 db.execute<{targetId:string;count:number}>(sql`select ${key} as "targetId", count(*)::int as count from ${reviewTable} where ${key} in ${ids} group by ${key}`),
 viewerId ? db.execute<{targetId:string;value:1|-1}>(sql`select ${key} as "targetId", value from ${voteTable} where ${key} in ${ids} and reviewer_user_id=${viewerId}`) : Promise.resolve([]),
 db.execute<{targetId:string;id:string;comment:string;authorId:string;author:string|null;createdAt:Date;updatedAt:Date}>(sql`select r.${key} as "targetId", r.id, r.comment, r.reviewer_user_id as "authorId", u.username as author, r.created_at as "createdAt", r.updated_at as "updatedAt" from (select *, row_number() over (partition by ${key} order by updated_at desc) as rn from ${reviewTable} where ${key} in ${ids}) r join users u on u.id=r.reviewer_user_id where r.rn<=3`),
 ]);
 for(const target of targets) result.set(target.id,{likes:0,dislikes:0,myVote:null,canReact:Boolean(viewerId && viewerId!==target.ownerId),reviewCount:0,recentReviews:[]});
 for(const row of counts)Object.assign(result.get(row.targetId)!,{likes:row.likes,dislikes:row.dislikes});
 for(const row of totals)result.get(row.targetId)!.reviewCount=row.count;
 for(const row of mine)result.get(row.targetId)!.myVote=row.value;
 for(const {targetId,...row} of comments)result.get(targetId)!.recentReviews.push(publicReview(row,viewerId));
 return result;
}
export async function registerDiscoveryFeedbackRoutes(app: FastifyInstance) {
 for (const kind of ['table','dm'] as const) for(const action of ['reaction','review'] as const) {
 app.put<{Params:{targetId:string}}>(`/api/v1/game-hub/${kind==='table'?'tables':'dms'}/:targetId/${action}`,async(request,reply)=>{
 const user=await requireAuthUser(request); if(!user)return reply.code(401).send({error:{message:'برای ادامه وارد حساب خود شوید.'}});
 const ref=kind==='dm' ? await resolveUserRef(request.params.targetId) : request.params.targetId;
 const key=z.string().uuid().safeParse(ref);
 const input=action==='reaction' ? z.object({value:z.union([z.literal(1),z.literal(-1),z.null()])}).strict().safeParse(request.body) : z.object({comment:z.string().trim().min(3).max(1200)}).strict().safeParse(request.body);
 if(!key.success||!input.success)return reply.code(400).send({error:{message:'اطلاعات واردشده معتبر نیست.'}});
 const owner=await db.transaction(async tx=>{
 // Lock target through the write so deletion/privacy updates cannot race admission.
 if(kind==='table') {
 await tx.execute(sql`select id from game_tables where id=${key.data} for update`);
 const [target]=await tx.select().from(gameTables).where(and(eq(gameTables.id,key.data),eq(gameTables.status,'PUBLISHED'),eq(gameTables.visibility,'PUBLIC'))).limit(1);
 if(!target||target.hostUserId===user.id)return null;
 if(action==='reaction') { const value=(input.data as {value:1|-1|null}).value;
 if(value===null)await tx.delete(gameTableReactions).where(and(eq(gameTableReactions.tableId,key.data),eq(gameTableReactions.reviewerUserId,user.id)));
 else await tx.insert(gameTableReactions).values({tableId:key.data,reviewerUserId:user.id,value}).onConflictDoUpdate({target:[gameTableReactions.tableId,gameTableReactions.reviewerUserId],set:{value,updatedAt:new Date()}});
 } else {const comment=(input.data as {comment:string}).comment;await tx.insert(gameTableReviews).values({tableId:key.data,reviewerUserId:user.id,comment}).onConflictDoUpdate({target:[gameTableReviews.tableId,gameTableReviews.reviewerUserId],set:{comment,updatedAt:new Date()}});}
 return target.hostUserId;
 }
 await tx.execute(sql`select user_id from dm_profiles where user_id=${key.data} for update`);
 const [target]=await tx.select({userId:dmProfiles.userId}).from(dmProfiles).innerJoin(users,eq(dmProfiles.userId,users.id)).where(and(eq(dmProfiles.userId,key.data),eq(dmProfiles.visible,true),eq(users.status,'ACTIVE'))).limit(1);
 if(!target||target.userId===user.id)return null;
 if(action==='reaction') {const value=(input.data as {value:1|-1|null}).value;
 if(value===null)await tx.delete(dmReactions).where(and(eq(dmReactions.dmUserId,key.data),eq(dmReactions.reviewerUserId,user.id)));
 else await tx.insert(dmReactions).values({dmUserId:key.data,reviewerUserId:user.id,value}).onConflictDoUpdate({target:[dmReactions.dmUserId,dmReactions.reviewerUserId],set:{value,updatedAt:new Date()}});
 } else {const comment=(input.data as {comment:string}).comment;await tx.insert(dmReviews).values({dmUserId:key.data,reviewerUserId:user.id,comment}).onConflictDoUpdate({target:[dmReviews.dmUserId,dmReviews.reviewerUserId],set:{comment,updatedAt:new Date()}});}
 return target.userId;
 });
 if(!owner)return reply.code(403).send({error:{message:'ثبت بازخورد برای این صفحه مجاز نیست.'}});
 const summary=await discoveryFeedback(kind,key.data,owner,user.id);
 if(action==='review')return {data:summary.reviews.find(row=>row.mine)};
 const {reviews:_reviews,...reaction}=summary;return {data:reaction};
 });
 }
}
