import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startApi, type TestApi } from '../support/api.js';
let api: TestApi;
before(async () => { process.env.VTT_BRIDGE_SECRET = 'a'.repeat(64); api = await startApi(); });
after(async () => { await api?.stop(); });
test('only owner can delete; offline bridge persists hidden intent and retry preserves accounts', async () => {
 const owner = await api.register('delete_owner'), other = await api.register('delete_other');
 const created = await api.request({method:'POST',url:'/api/v1/game-hub/tables',token:owner.token,payload:{title:'Delete fixture',description:'Campaign deletion fixture',system:'DND',language:'فارسی',playStyle:'داستانی',levelRange:'1-5',schedule:'Friday',capacity:4,status:'PUBLISHED',visibility:'PUBLIC'}});
 assert.equal(created.status,201,JSON.stringify(created.body));
 const id = created.body.data.id, url = `/api/v1/game-hub/tables/${id}`;
 await api.request({method:'POST',url:'/api/v1/game-hub/dms/me/activate',token:owner.token});
 for(const target of [url,`/api/v1/game-hub/dms/${owner.userId}`]) {
  assert.equal((await api.request({method:'PUT',url:`${target}/review`,token:other.token,payload:{comment:'A preserved fixture review'}})).status,200);
  assert.equal((await api.request({method:'PUT',url:`${target}/reaction`,token:other.token,payload:{value:1}})).status,200);
 }
 assert.equal((await api.request({method:'DELETE',url,token:other.token,payload:{confirmTitle:'Delete fixture'}})).status,403);
 assert.equal((await api.request({method:'DELETE',url,token:owner.token,payload:{confirmTitle:'wrong'}})).status,409);
 const fetchBefore = globalThis.fetch;
 globalThis.fetch = (async () => { throw new Error('isolated offline bridge'); }) as typeof fetch;
 try {
  const pending = await api.request({method:'DELETE',url,token:owner.token,payload:{confirmTitle:'Delete fixture'}});
  assert.equal(pending.status,202,JSON.stringify(pending.body));
  assert.equal(pending.body.data.deletionPending,true);
  assert.equal((await api.request({method:'GET',url})).status,404);
  const rows = await api.query(`SELECT t.status,d.attempt_count FROM game_tables t JOIN game_table_deletions d ON d.table_id=t.id WHERE t.id='${id}'`) as any[];
  assert.equal(rows[0].status,'HIDDEN');
  assert.equal(rows[0].attempt_count,1);
  globalThis.fetch = (async () => new Response(JSON.stringify({data:{deleted:true}}))) as typeof fetch;
  const done = await api.request({method:'DELETE',url,token:owner.token,payload:{confirmTitle:'Delete fixture'}});
  assert.equal(done.status,200,JSON.stringify(done.body));
  assert.equal(done.body.data.deleted,true);
  assert.equal((await api.query(`SELECT id FROM game_tables WHERE id='${id}'`) as any[]).length,0);
  assert.equal((await api.query(`SELECT id FROM users WHERE id='${owner.userId}'`) as any[]).length,1,'account survives');
  assert.equal((await api.query(`SELECT id FROM game_table_reviews WHERE table_id='${id}'`) as any[]).length,0);
  assert.equal((await api.query(`SELECT id FROM game_table_reactions WHERE table_id='${id}'`) as any[]).length,0);
  assert.equal((await api.query(`SELECT id FROM dm_reviews WHERE dm_user_id='${owner.userId}'`) as any[]).length,1,'direct DM feedback survives');
 } finally { globalThis.fetch = fetchBefore; }
});
