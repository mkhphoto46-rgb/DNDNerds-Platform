import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { messagePage } from "./social-message-page.js";
import { db } from "../db/client.js";
import { socialBlocks, socialFriendships, socialGroups, socialGroupInvites,
  socialGroupMembers, socialGroupMessages, socialProfiles } from "../db/schema.js";

const uuid = z.string().uuid();
const groupName = z.object({ title: z.string().trim().min(2).max(80) });
const inviteBody = z.object({ friendCode: z.string().trim().toUpperCase().regex(/^DND-[A-F0-9]{24}$/) });
const textBody = z.object({ body: z.string().trim().min(1).max(2000) });
const badChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
const maxGroupMembers = 20;
function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}
async function actor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAuthUser(request);
  if (!user) { fail(reply, 401, "AUTH_REQUIRED", "Login is required."); return null; }
  return user;
}
async function member(groupId: string, userId: string) {
  const [row] = await db.select({ groupId: socialGroupMembers.groupId }).from(socialGroupMembers)
    .where(and(eq(socialGroupMembers.groupId, groupId), eq(socialGroupMembers.userId, userId))).limit(1);
  return Boolean(row);
}
async function owner(groupId: string, userId: string) {
  const [row] = await db.select({ id: socialGroups.id }).from(socialGroups)
    .where(and(eq(socialGroups.id, groupId), eq(socialGroups.ownerUserId, userId))).limit(1);
  return Boolean(row);
}
async function blocked(a: string, b: string) {
  const [row] = await db.select({ blocker: socialBlocks.blockerUserId }).from(socialBlocks)
    .where(or(and(eq(socialBlocks.blockerUserId, a),eq(socialBlocks.blockedUserId, b)),
      and(eq(socialBlocks.blockerUserId, b),eq(socialBlocks.blockedUserId, a)))).limit(1);
  return Boolean(row);
}
async function friends(a: string, b: string) {
  const [low, high] = a < b ? [a,b] : [b,a];
  const [row] = await db.select({ low: socialFriendships.lowerUserId }).from(socialFriendships)
    .where(and(eq(socialFriendships.lowerUserId, low),eq(socialFriendships.upperUserId, high))).limit(1);
  return Boolean(row);
}
export async function registerSocialGroupRoutes(app: FastifyInstance) {
  app.get("/api/v1/social/groups", async (request, reply) => {
    const user = await actor(request,reply); if (!user) return;
    const rows = await db.select({ id:socialGroups.id, title:socialGroups.title,
      ownerUserId:socialGroups.ownerUserId,createdAt:socialGroups.createdAt })
      .from(socialGroupMembers).innerJoin(socialGroups,eq(socialGroupMembers.groupId,socialGroups.id))
      .where(eq(socialGroupMembers.userId,user.id)).orderBy(desc(socialGroups.createdAt)).limit(100);
    return { data: rows };
  });
  app.post("/api/v1/social/groups", async (request,reply) => {
    const user = await actor(request,reply); if (!user) return;
    const parsed = groupName.safeParse(request.body);
    if (!parsed.success || badChars.test(parsed.data?.title??"")) return fail(reply,400,"INVALID_TITLE","Group name must be 2–80 characters.");
    const existing = await db.select({ id: socialGroups.id }).from(socialGroups)
      .where(eq(socialGroups.ownerUserId,user.id)).limit(25);
    if (existing.length >= 25) return fail(reply,429,"GROUP_LIMIT","Too many groups.");
    const row = await db.transaction(async tx => {
      const [created] = await tx.insert(socialGroups).values({ title: parsed.data.title, ownerUserId:user.id })
        .returning({ id:socialGroups.id,title:socialGroups.title,ownerUserId:socialGroups.ownerUserId,createdAt:socialGroups.createdAt });
      if (!created) throw new Error("GROUP_CREATE_EMPTY_RESULT");
      await tx.insert(socialGroupMembers).values({groupId:created.id,userId:user.id});
      return created;
    });
    return reply.code(201).send({data:row});
  });
  app.get("/api/v1/social/groups/invites", async (request,reply) => {
    const user = await actor(request,reply); if (!user) return;
    const rows = await db.select({id:socialGroupInvites.id,groupId:socialGroupInvites.groupId,
      title:socialGroups.title, createdAt:socialGroupInvites.createdAt})
      .from(socialGroupInvites).innerJoin(socialGroups,eq(socialGroupInvites.groupId,socialGroups.id))
      .where(and(eq(socialGroupInvites.invitedUserId,user.id),eq(socialGroupInvites.status,"PENDING")))
      .orderBy(desc(socialGroupInvites.createdAt)).limit(100);
    return {data:rows};
  });
  app.post<{Params:{groupId:string}}>("/api/v1/social/groups/:groupId/invites", async(request,reply)=>{
    const user = await actor(request,reply); if (!user) return;
    const id=request.params.groupId;
    if (!uuid.safeParse(id).success) return fail(reply,400,"INVALID_ID","Invalid group ID.");
    if (!(await owner(id,user.id))) return fail(reply,403,"NOT_OWNER","Group owner only.");
    const parsed=inviteBody.safeParse(request.body);
    if (!parsed.success) return fail(reply,400,"INVALID_CODE","Invalid Friend ID.");
    const [target]=await db.select({userId:socialProfiles.userId}).from(socialProfiles)
      .where(eq(socialProfiles.friendCode,parsed.data.friendCode)).limit(1);
    if (!target || target.userId===user.id) return fail(reply,400,"INVALID_TARGET","Invalid friend.");
    if (!(await friends(user.id,target.userId)) || await blocked(user.id,target.userId))
      return fail(reply,403,"NOT_FRIENDS","Only accepted, unblocked friends can be invited.");
    if (await member(id,target.userId)) return fail(reply,409,"ALREADY_MEMBER","Already a member.");
    // Serialize invitations/joins on the group row; avoid admitting too many members concurrently.
    const result=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM social_groups WHERE id=${id}::uuid FOR UPDATE`);
      const memberRows=await tx.select({userId:socialGroupMembers.userId}).from(socialGroupMembers)
        .where(eq(socialGroupMembers.groupId,id)).limit(maxGroupMembers);
      if (memberRows.length>=maxGroupMembers) return "FULL";
      const [prior]=await tx.select({id:socialGroupInvites.id,status:socialGroupInvites.status})
        .from(socialGroupInvites).where(and(eq(socialGroupInvites.groupId,id),eq(socialGroupInvites.invitedUserId,target.userId))).limit(1);
      if (prior?.status==="PENDING") return "EXISTS";
      if (prior) {
        await tx.update(socialGroupInvites).set({status:"PENDING",createdAt:new Date(),respondedAt:null,
          senderUserId:user.id}).where(eq(socialGroupInvites.id,prior.id));
        return "OK";
      }
      await tx.insert(socialGroupInvites).values({groupId:id,senderUserId:user.id,invitedUserId:target.userId}).onConflictDoNothing();
      return "OK";
    });
    if (result==="FULL") return fail(reply,409,"GROUP_FULL","Group is full.");
    if (result==="EXISTS") return fail(reply,409,"INVITE_EXISTS","Invite already pending.");
    return reply.code(201).send({data:{invited:true}});
  });
  app.post<{Params:{inviteId:string}}>("/api/v1/social/groups/invites/:inviteId/accept",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.inviteId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid invitation ID.");
    // Lock invite then group in this order; the owner invitation route only locks group.
    const result=await db.transaction(async tx=>{
      const raw=await tx.execute(sql`SELECT id, group_id, sender_user_id FROM social_group_invites WHERE id=${id}::uuid AND invited_user_id=${user.id}::uuid AND status='PENDING' FOR UPDATE`);
      const invite=raw[0] as {group_id:string;sender_user_id:string}|undefined;
      if(!invite)return "MISSING";
      await tx.execute(sql`SELECT id FROM social_groups WHERE id=${invite.group_id}::uuid FOR UPDATE`);
      const members=await tx.select({id:socialGroupMembers.userId}).from(socialGroupMembers)
        .where(eq(socialGroupMembers.groupId,invite.group_id)).limit(maxGroupMembers);
      if(members.length>=maxGroupMembers)return "FULL";
      // Recheck friendship/block at the moment of joining.
      const [low,high]=user.id<invite.sender_user_id?[user.id,invite.sender_user_id]:[invite.sender_user_id,user.id];
      const [friend]=await tx.select({id:socialFriendships.lowerUserId}).from(socialFriendships)
        .where(and(eq(socialFriendships.lowerUserId,low),eq(socialFriendships.upperUserId,high))).limit(1);
      const [block]=await tx.select({id:socialBlocks.blockerUserId}).from(socialBlocks)
        .where(or(and(eq(socialBlocks.blockerUserId,user.id),eq(socialBlocks.blockedUserId,invite.sender_user_id)),
          and(eq(socialBlocks.blockerUserId,invite.sender_user_id),eq(socialBlocks.blockedUserId,user.id)))).limit(1);
      if(!friend || block)return "NOT_FRIENDS";
      await tx.insert(socialGroupMembers).values({groupId:invite.group_id,userId:user.id}).onConflictDoNothing();
      await tx.update(socialGroupInvites).set({status:"ACCEPTED",respondedAt:new Date()}).where(eq(socialGroupInvites.id,id));
      return "OK";
    });
    if(result==="MISSING")return fail(reply,404,"INVITE_NOT_FOUND","Invite unavailable.");
    if(result==="FULL")return fail(reply,409,"GROUP_FULL","Group is full.");
    if(result==="NOT_FRIENDS")return fail(reply,403,"NOT_FRIENDS","Invitation no longer allowed.");
    return {data:{accepted:true}};
  });
  app.post<{Params:{inviteId:string}}>("/api/v1/social/groups/invites/:inviteId/decline",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.inviteId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid invitation ID.");
    const [row]=await db.update(socialGroupInvites).set({status:"DECLINED",respondedAt:new Date()})
      .where(and(eq(socialGroupInvites.id,id),eq(socialGroupInvites.invitedUserId,user.id),
        eq(socialGroupInvites.status,"PENDING"))).returning({id:socialGroupInvites.id});
    if(!row)return fail(reply,404,"INVITE_NOT_FOUND","Invite unavailable.");
    return {data:{declined:true}};
  });
  app.get<{Params:{groupId:string}}>("/api/v1/social/groups/:groupId/members",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.groupId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid group ID.");
    if(!(await member(id,user.id)))return fail(reply,403,"NOT_MEMBER","Group membership required.");
    const rows=await db.select({userId:socialGroupMembers.userId,friendCode:socialProfiles.friendCode,
      joinedAt:socialGroupMembers.joinedAt}).from(socialGroupMembers)
      .leftJoin(socialProfiles,eq(socialGroupMembers.userId,socialProfiles.userId))
      .where(eq(socialGroupMembers.groupId,id)).limit(maxGroupMembers);
    return {data:rows};
  });
  app.get<{Params:{groupId:string};Querystring:{beforeId?:string}}>("/api/v1/social/groups/:groupId/messages",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.groupId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid group ID.");
    if(!(await member(id,user.id)))return fail(reply,403,"NOT_MEMBER","Group membership required.");
    const before=request.query.beforeId;
    let cursor:{id:string;createdAt:Date}|undefined;
    if(before){
      if(!uuid.safeParse(before).success)return fail(reply,400,"BAD_CURSOR","Invalid message cursor.");
      const [c]=await db.select({id:socialGroupMessages.id,createdAt:socialGroupMessages.createdAt})
        .from(socialGroupMessages).where(and(eq(socialGroupMessages.groupId,id),eq(socialGroupMessages.id,before))).limit(1);
      if(!c)return fail(reply,400,"BAD_CURSOR","Unknown message cursor.");cursor=c;
    }
    const rows=await db.select({id:socialGroupMessages.id,body:socialGroupMessages.body,
      senderUserId:socialGroupMessages.senderUserId,createdAt:socialGroupMessages.createdAt})
      .from(socialGroupMessages).where(and(eq(socialGroupMessages.groupId,id),cursor?
        or(lt(socialGroupMessages.createdAt,cursor.createdAt),and(eq(socialGroupMessages.createdAt,cursor.createdAt),lt(socialGroupMessages.id,cursor.id))):undefined))
      .orderBy(desc(socialGroupMessages.createdAt),desc(socialGroupMessages.id)).limit(50);
    return messagePage(rows);
  });
  app.post<{Params:{groupId:string}}>("/api/v1/social/groups/:groupId/messages",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.groupId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid group ID.");
    const parsed=textBody.safeParse(request.body);
    if(!parsed.success || badChars.test(parsed.data?.body??""))return fail(reply,400,"INVALID_MESSAGE","Text must contain 1–2000 characters.");
    // Check member inside transaction alongside write. The group is locked to serialize removals.
    const result=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM social_groups WHERE id=${id}::uuid FOR UPDATE`);
      const [allowed]=await tx.select({id:socialGroupMembers.groupId}).from(socialGroupMembers)
        .where(and(eq(socialGroupMembers.groupId,id),eq(socialGroupMembers.userId,user.id))).limit(1);
      if(!allowed)return null;
      const recent=await tx.select({id:socialGroupMessages.id}).from(socialGroupMessages)
        .where(and(eq(socialGroupMessages.senderUserId,user.id),gt(socialGroupMessages.createdAt,new Date(Date.now()-60_000)))).limit(30);
      if(recent.length>=30)return "RATE_LIMIT" as const;
      const [created]=await tx.insert(socialGroupMessages).values({groupId:id,senderUserId:user.id,body:parsed.data.body})
        .returning({id:socialGroupMessages.id,createdAt:socialGroupMessages.createdAt});
      return created;
    });
    if(result==="RATE_LIMIT")return fail(reply,429,"RATE_LIMIT","Too many messages.");
    if(!result)return fail(reply,403,"NOT_MEMBER","Group membership required.");
    return reply.code(201).send({data:{id:result.id,body:parsed.data.body,senderUserId:user.id,createdAt:result.createdAt}});
  });
  app.post<{Params:{groupId:string}}>("/api/v1/social/groups/:groupId/leave",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.groupId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid group ID.");
    if(await owner(id,user.id))return fail(reply,409,"OWNER_CANNOT_LEAVE","Owner must delete the group.");
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM social_groups WHERE id=${id}::uuid FOR UPDATE`);
      await tx.delete(socialGroupMembers).where(and(eq(socialGroupMembers.groupId,id),eq(socialGroupMembers.userId,user.id)));
    });
    return {data:{left:true}};
  });
  app.post<{Params:{groupId:string;userId:string}}>("/api/v1/social/groups/:groupId/members/:userId/remove",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const {groupId:id,userId:target}=request.params;
    if(!uuid.safeParse(id).success||!uuid.safeParse(target).success)return fail(reply,400,"INVALID_ID","Invalid ID.");
    if(!(await owner(id,user.id)))return fail(reply,403,"NOT_OWNER","Group owner only.");
    if(target===user.id)return fail(reply,400,"CANNOT_REMOVE_OWNER","Cannot remove group owner.");
    await db.transaction(async tx=>{
      await tx.execute(sql`SELECT id FROM social_groups WHERE id=${id}::uuid FOR UPDATE`);
      await tx.delete(socialGroupMembers).where(and(eq(socialGroupMembers.groupId,id),eq(socialGroupMembers.userId,target)));
      await tx.delete(socialGroupInvites).where(and(eq(socialGroupInvites.groupId,id),eq(socialGroupInvites.invitedUserId,target)));
    });
    return {data:{removed:true}};
  });
  app.post<{Params:{groupId:string}}>("/api/v1/social/groups/:groupId/delete",async(request,reply)=>{
    const user=await actor(request,reply);if(!user)return;
    const id=request.params.groupId;
    if(!uuid.safeParse(id).success)return fail(reply,400,"INVALID_ID","Invalid group ID.");
    const [deleted]=await db.delete(socialGroups).where(and(eq(socialGroups.id,id),eq(socialGroups.ownerUserId,user.id)))
      .returning({id:socialGroups.id});
    if(!deleted)return fail(reply,403,"NOT_OWNER","Group owner only.");
    return {data:{deleted:true}};
  });
}
