import {z} from 'zod';
// Keep this normalization identical to marketplace_store_name_key() in migration 0042.
// ASCII case folding is deliberate: Persian has no case and SQL lower() varies by locale.
export const normalizeStoreName=(value:string)=>value.replace(/[يك]/g,c=>c==='ي'?'ی':'ک').replace(/[\s\u200c\u200d]+/gu,' ').trim().replace(/[A-Z]/g,c=>c.toLowerCase());
export const RESERVED_STORE_SLUGS=['www','acme','api','admin','mail','smtp','imap','pop','pop3','webmail','autodiscover','autoconfig','voice','turn','stun','vtt','play','app','account','auth','login','support','status','cdn','assets','static','media','files','storage','download','downloads','docs','blog','shop','store','marketplace','cartography','ns1','ns2','localhost','ftp','sftp','vpn','dev','test','staging'] as const;
export const storeNameSchema=z.string().transform(v=>v.replace(/[\s\u200c\u200d]+/gu,' ').trim()).pipe(z.string().min(2).max(180));
export const storeSlugSchema=z.string().trim().toLowerCase().min(3).max(63).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(v=>!RESERVED_STORE_SLUGS.includes(v as typeof RESERVED_STORE_SLUGS[number]),'این نشانی برای زیرساخت سایت رزرو شده است.');
export function rethrowStoreIdentityError(error:unknown):never {
 const outer=error as {cause?:unknown};
 const e=(outer?.cause??error) as {code?:string;constraint_name?:string;constraint?:string};
 const constraint=e?.constraint_name??e?.constraint;
 if(e?.code==='23505'&&constraint==='seller_profiles_user_id_unique')throw Object.assign(new Error('درخواست فروشندگی برای این حساب قبلاً ثبت شده است.'),{statusCode:409,apiCode:'APPLICATION_EXISTS'});
 if(e?.code==='23505'&&constraint==='stores_name_normalized_unique')throw Object.assign(new Error('این نام فروشگاه قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.'),{statusCode:409,apiCode:'STORE_NAME_TAKEN'});
 if(e?.code==='23505'&&constraint==='stores_slug_unique')throw Object.assign(new Error('این نشانی فروشگاه قبلاً گرفته شده است.'),{statusCode:409,apiCode:'SLUG_TAKEN'});
 if(e?.code==='23514'&&constraint==='stores_slug_dns_safe')throw Object.assign(new Error('نشانی فروشگاه معتبر نیست یا برای زیرساخت سایت رزرو شده است.'),{statusCode:400,apiCode:'INVALID_STORE_SLUG'});
 throw error;
}
