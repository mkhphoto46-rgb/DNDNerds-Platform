import assert from 'node:assert/strict';
import {after,before,test} from 'node:test';
import postgres from 'postgres';
import {readFileSync} from 'node:fs';
import {startApi,type TestApi} from '../support/api.js';
import {normalizeStoreName,RESERVED_STORE_SLUGS} from '../../src/marketplace/store-identity.js';
let api:TestApi,q:ReturnType<typeof postgres>;
const apply='/api/v1/marketplace/v21/seller/apply';
const payload=(name:string,slug:string)=>({name,slug,description:'Synthetic store identity verification',category:'dice'});
before(async()=>{api=await startApi();api.app.log.level='silent';q=postgres(process.env.DATABASE_URL!,{max:4});});
after(async()=>{await q?.end();await api?.stop();});
test('canonical name SQL matches Persian, Latin and Unicode whitespace handling',async()=>{
 for(const name of ['  My\t SHOP  ','فروشگاه يك','فروشگاه یک','نام\u200cفروشگاه','\ufeffx\u00a0\u200dY\u3000','a\u200bb']){
  const [row]=await q`select marketplace_store_name_key(${name}) as key`;assert.equal(row!.key,normalizeStoreName(name));
 }
});
test('concurrent applications atomically reserve Persian normalized names',async()=>{
 const users=await Promise.all([api.register('identity-a'),api.register('identity-b')]);
 const results=await Promise.all(users.map((u,i)=>api.request({method:'POST',url:apply,token:u.token,payload:payload(i?'فروشگاه یک':'  فروشگاه   يك  ','identity-persian-'+i)})));
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const rejected=results.find(r=>r.status===409)!;assert.match(JSON.stringify(rejected.body),/نام فروشگاه/);
 const [row]=await q`select count(*)::int n from seller_profiles where user_id in (${users[0]!.userId},${users[1]!.userId})`;assert.equal(row!.n,1,'failed insert rolls seller profile back');
});
test('seller rename rejects normalized name collision and permits its own name',async()=>{
 const a=await api.register('rename-a'),b=await api.register('rename-b');
 const first=await api.request({method:'POST',url:apply,token:a.token,payload:payload('Identity SHOP','identity-rename-a')});
 const second=await api.request({method:'POST',url:apply,token:b.token,payload:payload('Other SHOP','identity-rename-b')});
 assert.equal(first.status,201);assert.equal(second.status,201);
 assert.equal((await api.request({method:'PATCH',url:`/api/v1/marketplace/v21/seller/stores/${second.body.id}`,token:b.token,payload:{name:' identity  shop ',description:'Rename attempt'}})).status,409);
 assert.equal((await api.request({method:'PATCH',url:`/api/v1/marketplace/v21/seller/stores/${first.body.id}`,token:a.token,payload:{name:' identity  shop ',description:'Own store rename'}})).status,200);
});
test('DNS labels reject reserved names, overlength and edge hyphens; duplicate slug is 409',async()=>{
 const user=await api.register('slug-invalid');
 for(const slug of [...RESERVED_STORE_SLUGS,'x'.repeat(64),'-invalid','invalid-','has.dot'])assert.equal((await api.request({method:'POST',url:apply,token:user.token,payload:payload('Invalid slug store',slug)})).status,400,slug);
 const r=await api.request({method:'POST',url:apply,token:user.token,payload:payload('DNS valid store','x'.repeat(63))});assert.equal(r.status,201,JSON.stringify(r.body));
 const other=await api.register('slug-taken');assert.equal((await api.request({method:'POST',url:apply,token:other.token,payload:payload('Different DNS store','x'.repeat(63))})).status,409);
});
test('legacy onboarding and admin assignment enforce the same identity constraints',async()=>{
 const legacy=await api.register('identity-legacy');
 const legacyBody={displayName:'Legacy seller',storeName:'Legacy Unique Store',storeSlug:'identity-legacy',description:'Synthetic legacy store description',category:'dice'};
 assert.equal((await api.request({method:'POST',url:'/api/v1/seller/onboard',token:legacy.token,payload:legacyBody})).status,201);
 const other=await api.register('identity-legacy-duplicate');assert.equal((await api.request({method:'POST',url:'/api/v1/seller/onboard',token:other.token,payload:{...legacyBody,storeName:' legacy unique STORE ',storeSlug:'identity-legacy-other'}})).status,409);
 const admin=await api.register('identity-admin');await q`insert into marketplace_admins(user_id,role,active) values(${admin.userId},'SUPER_ADMIN',true)`;
 const assigned=await api.request({method:'POST',url:'/api/v1/admin/marketplace/seller-access',token:admin.token,payload:{userId:other.userId,name:'LEGACY UNIQUE STORE',slug:'identity-admin-assign',category:'dice',password:admin.password,reason:'Synthetic uniqueness verification'}});assert.equal(assigned.status,409,JSON.stringify(assigned.body));
});
test('database enforces DNS labels for direct writes and migration preflight preserves conflicts',async()=>{
 const [store]=await q`select id from stores limit 1`;
 for(const slug of ['api','x'.repeat(64),'-invalid'])await assert.rejects(q`update stores set slug=${slug} where id=${store!.id}`,e=>(e as any).constraint_name==='stores_slug_dns_safe');
 const migration=readFileSync(new URL('../../drizzle/0042_store_identity.sql',import.meta.url),'utf8');
 // The real preflight is rerun in a rolled-back transaction after temporarily removing its protections.
 await assert.rejects(q.begin(async tx=>{
  await tx`drop index stores_name_normalized_unique`;await tx`alter table stores drop constraint stores_slug_dns_safe`;
  await tx`update stores set slug='api' where id=${store!.id}`;
  const preflight=migration.split('--> statement-breakpoint')[1]!;await tx.unsafe(preflight);
 }),/Store identity migration blocked.*invalid\/reserved slug api/s);
 await assert.rejects(q.begin(async tx=>{
  await tx`drop index stores_name_normalized_unique`;
  await tx`update stores set name='Duplicate migration preflight' where id in (select id from stores limit 2)`;
  await tx.unsafe(migration.split('--> statement-breakpoint')[1]!);
 }),/Store identity migration blocked.*duplicate name duplicate migration preflight/s);
 const [current]=await q`select slug from stores where id=${store!.id}`;assert.notEqual(current!.slug,'api');
});
