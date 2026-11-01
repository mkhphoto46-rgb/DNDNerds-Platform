import { NextResponse } from 'next/server';
import { apiFetch } from '@/lib/bff-api';
async function forward(request:Request,context:{params:Promise<{path:string[]}>}){
  const {path}=await context.params;
  if(!path.length||path.some(p=>!p||p==='.'||p==='..'))return NextResponse.json({error:{message:'مسیر معتبر نیست.'}},{status:400});
  const expectedOrigin=process.env.NODE_ENV==='production'?new URL(process.env.PUBLIC_SITE_URL??'https://dndnerds.ir').origin:new URL(request.url).origin;
  if(request.method!=='GET'&&request.headers.get('origin')!==expectedOrigin)return NextResponse.json({error:{message:'مبدأ درخواست معتبر نیست.'}},{status:403});
  const init:RequestInit={method:request.method,headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000)};
  if(request.method!=='GET')init.body=await request.text();
  try{const r=await apiFetch(`/api/v1/marketplace/v21/${path.map(encodeURIComponent).join('/')}${new URL(request.url).search}`,init);if(r.headers.get('content-type')?.startsWith('image/webp'))return new Response(r.body,{status:r.status,headers:{'content-type':'image/webp','cache-control':'private, no-store','x-content-type-options':'nosniff'}});return NextResponse.json(await r.json(),{status:r.status});}
  catch{return NextResponse.json({error:{message:'ارتباط با بازارچه برقرار نشد.'}},{status:502});}
}
export const GET=forward;export const POST=forward;export const PUT=forward;export const PATCH=forward;export const DELETE=forward;
