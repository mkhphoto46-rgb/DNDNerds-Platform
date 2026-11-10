import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NextRequest} from 'next/server';
import {proxy} from './proxy';
test('free launch allows seller preparation but keeps purchase and payout pages closed',()=>{
 const before=process.env.FREE_LAUNCH_MODE;process.env.FREE_LAUNCH_MODE='true';
 try{
  assert.equal(proxy(new NextRequest('https://dndnerds.ir/seller/marketplace')).status,200);
  for(const path of ['/cart','/checkout','/seller/payouts','/seller/dashboard'])assert.equal(proxy(new NextRequest('https://dndnerds.ir'+path)).status,307,path);
 }finally{if(before===undefined)delete process.env.FREE_LAUNCH_MODE;else process.env.FREE_LAUNCH_MODE=before;}
});


test('store subdomain rewrites root without redirect and preserves query while account stays on apex',()=>{
 const response=proxy(new NextRequest('https://moralin.dndnerds.ir/?page=2',{headers:{host:'moralin.dndnerds.ir'}}));
 assert.equal(response.status,200);const rewritten=new URL(response.headers.get('x-middleware-rewrite')!);
 assert.equal(rewritten.host,'moralin.dndnerds.ir');assert.equal(rewritten.pathname,'/store/moralin');assert.equal(rewritten.search,'?page=2');
 const account=proxy(new NextRequest('https://moralin.dndnerds.ir/login?next=%2Fstore%2Fmoralin',{headers:{host:'moralin.dndnerds.ir'}}));
 assert.equal(account.status,307);assert.equal(new URL(account.headers.get('location')!).host,'dndnerds.ir');
 for(const host of ['dndnerds.ir','www.dndnerds.ir','moralin.dndnerds.ir.attacker.test','evil.moralin.dndnerds.ir','-bad.dndnerds.ir']){
  const result=proxy(new NextRequest('https://'+host+'/',{headers:{host}}));assert.equal(result.headers.get('x-middleware-rewrite'),null,host);
 }
 const badCsrf=proxy(new NextRequest('https://moralin.dndnerds.ir/api/marketplace/v21/comment',{method:'POST',headers:{host:'moralin.dndnerds.ir',origin:'https://attacker.test'}}));assert.equal(badCsrf.status,403);
});
