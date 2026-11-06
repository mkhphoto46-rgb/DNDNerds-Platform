import {z} from 'zod';
export const homebrewInput=z.object({
 title:z.string().trim().min(5).max(160),
 summary:z.string().trim().min(15).max(500),
 body:z.string().trim().min(30).max(20000),
 kind:z.enum(['ITEM','CHARACTER','CREATURE','STORY','RULE','OTHER']),
 status:z.enum(['DRAFT','PUBLISHED']),
}).strict().refine(value=>value.status!=='PUBLISHED'||value.body.length>=200,{message:'برای انتشار، متن باید حداقل ۲۰۰ نویسه داشته باشد.',path:['body']});
