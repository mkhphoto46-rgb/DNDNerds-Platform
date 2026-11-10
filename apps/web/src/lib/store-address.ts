// Store hosts share public storefronts; account cookies stay host-only.
export const STORE_DOMAIN = 'dndnerds.ir';
const reserved: readonly string[] = ['www','acme','api','admin','mail','smtp','imap','pop','pop3','webmail','autodiscover','autoconfig','voice','turn','stun','vtt','play','app','account','auth','login','support','status','cdn','assets','static','media','files','storage','download','downloads','docs','blog','shop','store','marketplace','cartography','ns1','ns2','localhost','ftp','sftp','vpn','dev','test','staging'];
export function storeAddress(slug:string){
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length<3||slug.length>63||reserved.includes(slug))return null;
 return `https://${slug}.${STORE_DOMAIN}`;
}
export function storeHostSlug(host:string):string|null{
 const hostname=host.toLowerCase().replace(/:\d+$/,'');
 const suffix='.'+STORE_DOMAIN;if(!hostname.endsWith(suffix))return null;
 const slug=hostname.slice(0,-suffix.length);return storeAddress(slug)?slug:null;
}
export function storeHostRoute(host:string,pathname:string):{kind:'rewrite'|'redirect';pathname:string}|null{
 const slug=storeHostSlug(host);if(!slug)return null;
 if(pathname==='/')return {kind:'rewrite',pathname:'/store/'+slug};
 if(pathname===`/store/${slug}`||pathname.startsWith(`/store/${slug}/`))return null;
 if(pathname.startsWith('/api/')||pathname.startsWith('/_next/')||/^\/(site-ui|fonts|images|assets)\//.test(pathname)||/\.(png|jpe?g|svg|webp|ico|woff2?|ttf|css|js|map)$/i.test(pathname))return null;
 return {kind:'redirect',pathname};
}
