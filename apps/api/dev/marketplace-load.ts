// Isolated real HTTP catalog acceptance. Never accepts a target URL or production database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {createHash} from 'node:crypto';
import { startApi } from '../tests/support/api.js';
import postgres from 'postgres';
import autocannon from 'autocannon';

async function main(){
const reportPath=process.env.MARKETPLACE_LOAD_REPORT ?? '../../.deploy/marketplace/load-report.json';
const started=new Date().toISOString();
process.env.API_RATE_LIMIT_MAX='1000000';
const api=await startApi();api.app.log.level='silent';
const q=postgres(process.env.DATABASE_URL!,{max:2});
const report:any={started,catalogSha256:createHash('sha256').update(fs.readFileSync(__dirname+'/../src/marketplace/catalog.ts')).digest('hex'),notes:['Loopback HTTP on isolated PostgreSQL/Redis; global per-IP limit raised only in this process; no LiveKit or real provider traffic.'],environment:{node:process.version,platform:process.platform,cpus:os.cpus().length,hostMemoryBytes:os.totalmem()},fixtures:{sellers:30,products:3000,users:10000,historicalSuborders:50000,variants:9097,maxVariantsPerProduct:100},profiles:[]};
try{
  await q`insert into users(email,email_verified) select 'synthetic-'||n||'@example.test',true from generate_series(1,10000)n`;
  await q`insert into seller_profiles(user_id,display_name,status) select id,'Synthetic seller','ACTIVE' from users order by email limit 30`;
  await q`insert into stores(seller_profile_id,slug,name,description,category,status) select id,'synthetic-'||row_number()over(),'کارگاه تست','Only synthetic fixtures','dice','ACTIVE' from seller_profiles`;
  await q`insert into products(store_id,slug,name,description,category,status) select s.id,'dice-'||n,'تاس '||n,'تاس ساختگی آزمون فشار','dice','PUBLISHED' from stores s cross join generate_series(1,100)n`;
  await q`insert into product_variants(product_id,sku,name,price_rial,is_default,options) select id,'sku-'||id,'آبی',100000,true,'{"color":"آبی","faces":"20"}'::jsonb from products`;
  await q`insert into product_variants(product_id,sku,name,price_rial,options) select p.id,'sku-'||p.id||'-'||n,case when n=1 then 'قرمز' else 'سبز' end,110000,jsonb_build_object('color',case when n=1 then 'قرمز' else 'سبز' end,'faces','20') from products p cross join generate_series(1,2)n`;
  await q`insert into product_variants(product_id,sku,name,price_rial,options) select p.id,'bulk-'||p.id||'-'||n,'تنوع '||n,120000,jsonb_build_object('color','رنگ '||n,'faces','20') from (select id from products order by name,id limit 1)p cross join generate_series(1,97)n`;
  await q`insert into inventory(variant_id,quantity_on_hand) select id,10 from product_variants`;
  await q`insert into marketplace_orders(user_id,idempotency_key,status,customer_total_rial,platform_commission_rial,seller_net_rial,expires_at) select u.id,'history-'||n,'CANCELLED',100000,5000,95000,now()-interval '1 day' from (select id from users limit 1)u cross join generate_series(1,50000)n`;
  await q`insert into marketplace_seller_orders(order_id,store_id,status,gross_rial,commission_bps_snapshot,platform_commission_rial,seller_net_rial) select o.id,s.id,'CANCELLED',100000,500,5000,95000 from marketplace_orders o cross join (select id from stores limit 1)s`;
  await q`analyze products`;await q`analyze product_variants`;await q`analyze inventory`;
  let checks=0;
  for(let batch=0;batch<500;batch++){
    await Promise.all(Array.from({length:20},async(_,i)=>{
      const color=i%2?'آبی':'بنفش';const r=await api.request({method:'GET',url:`/api/v1/products?q=${encodeURIComponent('تاس')}&category=dice&color=${encodeURIComponent(color)}&available=true&minPrice=90000&maxPrice=110000&limit=12&page=1`});
      assert.equal(r.status,200);assert.equal(r.body.data.length,color==='آبی'?12:0);
      for(const p of r.body.data)assert.ok(p.variants.every((v:any)=>v.options.color===color&&v.inventory===10));checks++;
    }));
  }
  report.searchCorrectness={requests:checks,passed:true};
  const address=await api.app.listen({host:'127.0.0.1',port:0});
  for(const profile of [{connections:50,duration:600},{connections:200,duration:120}]){
    const timings:number[]=[];
    const result:any=await new Promise((resolve,reject)=>{
      const load=autocannon({url:`${address}/api/v1/products?category=dice&limit=24`,connections:profile.connections,duration:profile.duration,timeout:10},(err:any,data:any)=>err?reject(err):resolve(data));
      load.on('response',(_client:any,_status:any,_bytes:any,ms:number)=>{timings.push(ms);});
      let last=0;
      load.on('tick',()=>{if(Date.now()-last>30000){last=Date.now();console.log(JSON.stringify({progress:profile.connections,rss:process.memoryUsage().rss,time:new Date().toISOString()}));}if(process.memoryUsage().rss>2_000_000_000)load.stop();});
    });
    timings.sort((a,b)=>a-b);
    report.profiles.push({p95Ms:timings[Math.ceil(timings.length*.95)-1],p99Ms:timings[Math.ceil(timings.length*.99)-1],connections:profile.connections,durationSeconds:result.duration,requests:result.requests.total,throughputBytes:result.throughput.total,latencyMs:result.latency,errors:result.errors,timeouts:result.timeouts,non2xx:result.non2xx,rssBytes:process.memoryUsage().rss});
    // Use an explicit ordinary local path for artifacts, no runtime secrets.
    fs.mkdirSync(reportPath.replace(/[\\/][^\\/]+$/,''),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
    assert.equal(result.errors,0);assert.equal(result.non2xx,0);assert.equal(result.timeouts,0);
  }
  report.finished=new Date().toISOString();report.completed=true;
}catch(e){report.failure=String(e);throw e;}finally{fs.mkdirSync(reportPath.replace(/[\\/][^\\/]+$/,''),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));await q.end();await api.stop();}

}
main().catch(e=>{console.error(e);process.exitCode=1;});
