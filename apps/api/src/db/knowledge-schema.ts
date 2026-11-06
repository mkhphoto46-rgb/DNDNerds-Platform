import {pgTable,uuid,varchar,text,timestamp,index,check} from 'drizzle-orm/pg-core';
import {sql} from 'drizzle-orm';
import {users} from './schema.js';
export const knowledgeHomebrew=pgTable('knowledge_homebrew',{
 id:uuid('id').primaryKey().defaultRandom(),
 authorUserId:uuid('author_user_id').notNull().references(()=>users.id,{onDelete:'restrict'}),
 title:varchar('title',{length:160}).notNull(),summary:varchar('summary',{length:500}).notNull(),
 body:text('body').notNull(),kind:varchar('kind',{length:20}).notNull(),status:varchar('status',{length:16}).notNull().default('DRAFT'),
 createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),updatedAt:timestamp('updated_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('knowledge_homebrew_public_idx').on(t.status,t.createdAt),index('knowledge_homebrew_author_idx').on(t.authorUserId,t.updatedAt),check('knowledge_homebrew_status_valid',sql`${t.status} IN ('DRAFT','PUBLISHED')`),check('knowledge_homebrew_kind_valid',sql`${t.kind} IN ('ITEM','CHARACTER','CREATURE','STORY','RULE','OTHER')`)]);
