import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import postgres from 'postgres';
import {startApi} from '../support/api.js';

function cover(bytes:number){
 const data=Buffer.alloc(bytes);data.write('RIFF');data.writeUInt32LE(bytes-8,4);data.write('WEBP',8);data.write('VP8X',12);data.writeUIntLE(1279,24,3);data.writeUIntLE(799,27,3);
 return 'data:image/webp;base64,'+data.toString('base64');
}
test('a valid 500KB campaign cover persists on create and owner edit',async()=>{
 const api=await startApi();api.app.log.level='silent';
 try{
  const migration=postgres(process.env.DATABASE_URL!,{max:1});
  try{await migration.unsafe(readFileSync(resolve(__dirname,'../../../../ops/fixes/campaign-cover-limit.sql'),'utf8'));}finally{await migration.end();}
  const owner=await api.register('cover_persistence');
  const input={title:'Cover persistence fixture',description:'',imageData:cover(500000),system:'D&D 5e',language:'فارسی',playStyle:'داستانی',levelRange:'1-5',schedule:'Friday',capacity:4,status:'PUBLISHED',visibility:'PUBLIC'};
  const created=await api.request({method:'POST',url:'/api/v1/game-hub/tables',token:owner.token,payload:input});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const updated=await api.request({method:'PUT',url:`/api/v1/game-hub/tables/${created.body.data.id}`,token:owner.token,payload:{...input,imageData:cover(250000)}});
  assert.equal(updated.status,200,JSON.stringify(updated.body));
  const rejected=await api.request({method:'POST',url:'/api/v1/game-hub/tables',token:owner.token,payload:{...input,imageData:cover(500001)}});
  assert.equal(rejected.status,400);
 }finally{await api.stop();}
});
