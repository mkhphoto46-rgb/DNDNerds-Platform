import {readFile} from 'node:fs/promises';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 let enabled=false;
 try{const marker=JSON.parse(await readFile(/* turbopackIgnore: true */ process.env.STORE_DOMAIN_READY_FILE??'/opt/dndnerds/store-domains-ready.json','utf8'));enabled=marker.enabled===true&&marker.domain==='dndnerds.ir';}catch{}
 return Response.json({enabled,domain:'dndnerds.ir'},{headers:{'Cache-Control':'no-store'}});
}
