import {randomBytes} from 'node:crypto';
import postgres from 'postgres';
/** Each suite owns exactly one newly created database on an explicitly selected loopback QA server. */
export async function isolatedPostgres(adminUrl:string){
 const url=new URL(adminUrl);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('QA PostgreSQL must be loopback');
 const database='dnd_test_'+randomBytes(12).toString('hex');
 const admin=postgres(adminUrl,{max:1,prepare:false});
 await admin.unsafe(`CREATE DATABASE "${database}" TEMPLATE template0 ENCODING 'UTF8'`);
 url.pathname='/'+database;
 return {url:url.href,stop:async()=>{try{await admin.unsafe(`DROP DATABASE "${database}" WITH (FORCE)`);}finally{await admin.end();}}};
}
