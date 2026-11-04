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
