import assert from "node:assert/strict";
import { test } from "node:test";
import { validProfileImage } from "../../src/routes/profile-image.js";
import { startApi } from "../support/api.js";
const tiny = Buffer.from("UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoBAAEAAUAmJaACdLoAA5gA/vIiX/xaHWh1oaOu7D5aiAAA", "base64");
function webp(bytes: number) {
  const junk = Buffer.alloc(8); junk.write("JUNK"); junk.writeUInt32LE(bytes - tiny.length - 8, 4);
  const file = Buffer.concat([tiny, junk, Buffer.alloc(bytes - tiny.length - 8)]); file.writeUInt32LE(file.length - 8, 4);
  return `data:image/webp;base64,${file.toString("base64")}`;
}
test("profile limits allow 500KB avatar and 1MB header while campaign remains small", () => {
 assert.equal(validProfileImage(webp(500_000), "avatar"), true);
 assert.equal(validProfileImage(webp(500_002), "avatar"), false);
 assert.equal(validProfileImage(webp(1_000_000), "banner"), true);
 assert.equal(validProfileImage(webp(1_000_002), "banner"), false);
 assert.equal(validProfileImage(webp(300_000), "campaign"), false);
});
test("text feedback persists privately, admin review is authorized and large profiles save", async () => {
 delete process.env.FREE_LAUNCH_MODE;
 const api = await startApi();
 try {
  const owner=await api.register("feedback-owner"),other=await api.register("feedback-other"),admin=await api.register("feedback-admin");
  process.env.FREE_LAUNCH_MODE="true";
  const plan=await api.request({method:"GET",url:"/api/v1/subscriptions/plan"});assert.equal(plan.body.data.free,true);assert.equal(plan.body.data.priceRial,0);
  const base="/api/v1/game-hub", payload={kind:"SUGGESTION",subject:"پیشنهاد برای میز",message:"لطفاً امکان جستجوی بیشتری اضافه کنید."};
  assert.equal((await api.request({method:"POST",url:`${base}/feedback`,payload})).status,401);
  const created=await api.request({method:"POST",url:`${base}/feedback`,token:owner.token,payload});assert.equal(created.status,201);
  assert.equal((await api.request({method:"POST",url:`${base}/feedback`,token:owner.token,payload:{...payload,imageData:"anything"}})).status,400);
  assert.equal((await api.request({method:"POST",url:`${base}/feedback`,token:owner.token,payload:{...payload,message:"x".repeat(3001)}})).status,400);
  assert.equal((await api.request({method:"GET",url:`${base}/feedback/me`,token:other.token})).body.data.length,0);
  assert.equal((await api.request({method:"GET",url:`${base}/feedback/me`,token:owner.token})).body.data[0].message,payload.message);
  assert.equal((await api.request({method:"GET",url:`${base}/admin/feedback`,token:other.token})).status,403);
  await api.query(`INSERT INTO marketplace_admins (user_id,role,active) VALUES ('${admin.userId}','SUPER_ADMIN',true)`);
  assert.equal((await api.request({method:"GET",url:`${base}/admin/feedback`,token:admin.token})).body.data.length,1);
  const statusUrl=`${base}/admin/feedback/${created.body.data.id}/status`;
  assert.equal((await api.request({method:"PUT",url:statusUrl,token:other.token,payload:{status:"RESOLVED"}})).status,403);
  assert.equal((await api.request({method:"PUT",url:statusUrl,token:admin.token,payload:{status:"RESOLVED"}})).status,200);
  assert.equal((await api.request({method:"GET",url:`${base}/feedback/me`,token:owner.token})).body.data[0].status,"RESOLVED");
  for(let i=0;i<4;i++) assert.equal((await api.request({method:"POST",url:`${base}/feedback`,token:owner.token,payload})).status,201);
  assert.equal((await api.request({method:"POST",url:`${base}/feedback`,token:owner.token,payload})).status,429);
  const profile={displayName:"بازیگر",bio:"معرفی",avatarData:webp(500_000),bannerData:webp(1_000_000)};
  assert.equal((await api.request({method:"PUT",url:`${base}/players/me/page`,token:owner.token,payload:profile})).status,200);
  assert.equal((await api.request({method:"GET",url:`${base}/players/me/page`,token:owner.token})).body.data.bannerData.length,profile.bannerData.length);
  assert.equal((await api.request({method:"PUT",url:`${base}/dms/me/page`,token:owner.token,payload:{...profile,playStyle:"داستانی",languages:"فارسی",experienceYears:1,visible:true}})).status,200);
 } finally {await api.stop();}
});
