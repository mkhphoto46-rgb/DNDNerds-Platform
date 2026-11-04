// Disposable local UI fixture server. Credentials stay in a gitignored local file.
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import {startApi} from '../tests/support/api.js';
async function main(){
 const api=await startApi();api.app.log.level='silent';const maker=await api.register('preview-maker');
 const q=postgres(process.env.DATABASE_URL!);const [seller]=await q`insert into seller_profiles(user_id,display_name,status) values(${maker.userId},'Synthetic maker','ACTIVE') returning id`;
 const [store]=await q`insert into stores(seller_profile_id,slug,name,description,category,status,featured_until) values(${seller!.id},'qa-forge','کارگاه آزمون','داده ساختگی برای بررسی رابط؛ فروشگاه واقعی نیست.','dice','ACTIVE',now()+interval '1 day') returning id`;
 await q`insert into store_members(store_id,user_id,role) values(${store!.id},${maker.userId},'OWNER')`;
 await q`insert into products(store_id,slug,name,description,category,status) select ${store!.id},'dice-'||n,'تاس ماجراجو '||n,'توضیح آزمایشی محصول برای بررسی راست‌به‌چپ و اندازهٔ کارت‌ها','dice','PUBLISHED' from generate_series(1,12)n`;
 await q`insert into product_variants(product_id,sku,name,price_rial,is_default,options) select id,'qa-'||id,'آبی',250000,true,'{"color":"آبی","faces":"20"}'::jsonb from products`;
 await q`insert into inventory(variant_id,quantity_on_hand) select id,5 from product_variants`;
 await q.end();const origin=await api.app.listen({host:'127.0.0.1',port:24197});
 const file=path.resolve(__dirname,'../../../.deploy/marketplace/preview-private.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({origin,email:maker.email,password:maker.password}),{mode:0o600});
 console.log('Disposable marketplace API fixture ready on loopback port 24197.');
 const stop=async()=>{await api.stop();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
