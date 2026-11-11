export async function marketplaceImage(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8_000_000)throw new Error('تصویر PNG، JPEG یا WebP تا ۸ مگابایت انتخاب کنید.');
 return compressProductImage(file);
}

export async function compressProductImage(file:File):Promise<string>{
 const bitmap=await createImageBitmap(file).catch(()=>{
   throw new Error('این فایل به‌عنوان عکس قابل خواندن نیست.');
 });
 try{
   let scale=Math.min(1,1280/bitmap.width,800/bitmap.height);
   const canvas=document.createElement('canvas');
   const ctx=canvas.getContext('2d');
   if(!ctx)throw new Error('تبدیل تصویر انجام نشد.');
   while(true){
     canvas.width=Math.max(1,Math.round(bitmap.width*scale));
     canvas.height=Math.max(1,Math.round(bitmap.height*scale));
     ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
     const webp=canvas.toDataURL('image/webp',0.8);
     if(!webp.startsWith('data:image/webp;base64,'))throw new Error('مرورگر امکان فشرده‌سازی عکس را ندارد.');
     if(webp.length<=666690)return webp;
     const smallerWebp=canvas.toDataURL('image/webp',0.5);
     if(smallerWebp.length<=666690)return smallerWebp;
     scale*=0.75;
   }
 }finally{
   bitmap.close();
 }
}
