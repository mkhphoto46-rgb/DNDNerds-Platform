import AdminControl from './client';
export const metadata={title:'مدیریت سایت و میزها'};
export default async function Page({searchParams}:{searchParams:Promise<{kind?:string;id?:string}>}){
 const query=await searchParams;
 const kind=query.kind==='stores'||query.kind==='products'?query.kind:'tables';
 return <AdminControl key={`${kind}:${query.id??''}`} initialKind={kind} initialId={query.id}/>;
}
