import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startApi } from '../support/api.js';
test('independent campaign and DM feedback allows active non-members, switching and clearing votes', async () => {
 const api=await startApi(); const base='/api/v1/game-hub';
 try {
 const owner=await api.register('feedback-owner'), other=await api.register('feedback-reader');
 await api.request({method:'POST',url:`${base}/dms/me/activate`,token:owner.token});
 const made=await api.request({method:'POST',url:`${base}/tables`,token:owner.token,payload:{title:'Discovery table',description:'',system:'5e',language:'fa',playStyle:'story',levelRange:'1-5',schedule:'Friday',capacity:4,status:'PUBLISHED',visibility:'PUBLIC'}});
 const tableId=made.body.data.id, table=`${base}/tables/${tableId}`, dm=`${base}/dms/${owner.userId}`;
 for(const target of [table,dm]) {
 assert.equal((await api.request({method:'PUT',url:`${target}/reaction`,payload:{value:1}})).status,401);
 assert.equal((await api.request({method:'PUT',url:`${target}/reaction`,token:owner.token,payload:{value:1}})).status,403);
 assert.equal((await api.request({method:'PUT',url:`${target}/review`,token:owner.token,payload:{comment:'hello'}})).status,403);
 assert.equal((await api.request({method:'PUT',url:`${target}/review`,token:other.token,payload:{comment:'ab'}})).status,400);
 }
 const vote=await api.request({method:'PUT',url:`${table}/reaction`,token:other.token,payload:{value:1}});
 assert.equal(vote.status,200); assert.equal(vote.body.data.likes,1);
 assert.equal((await api.request({method:'PUT',url:`${table}/review`,token:other.token,payload:{comment:'great'}})).status,200);
 let page=await api.request({method:'GET',url:`${dm}/page`,token:other.token}); assert.equal(page.body.data.likes,0); assert.equal(page.body.data.reviewCount,0); assert.equal(page.body.data.campaignReviews.length,1);
 await api.request({method:'PUT',url:`${dm}/reaction`,token:other.token,payload:{value:-1}});
 await api.request({method:'PUT',url:`${dm}/review`,token:other.token,payload:{comment:'direct DM comment'}});
 await api.request({method:'PUT',url:`${table}/review`,token:other.token,payload:{comment:'edited'}});
 page=await api.request({method:'GET',url:table,token:other.token}); assert.equal(page.body.data.likes,1); assert.equal(page.body.data.reviewCount,1); assert.equal(page.body.data.reviews[0].comment,'edited'); assert.equal(page.body.data.rating,undefined);
 const switched=await api.request({method:'PUT',url:`${table}/reaction`,token:other.token,payload:{value:-1}}); assert.equal(switched.body.data.likes,0); assert.equal(switched.body.data.dislikes,1);
 const cleared=await api.request({method:'PUT',url:`${table}/reaction`,token:other.token,payload:{value:null}}); assert.equal(cleared.body.data.myVote,null); assert.equal(cleared.body.data.dislikes,0);
 const campaignList=await api.request({method:'GET',url:`${base}/tables`,token:other.token});
 assert.equal(campaignList.body.data[0].reviewCount,1);assert.equal(campaignList.body.data[0].recentReviews[0].comment,'edited');
 const dmList=await api.request({method:'GET',url:`${base}/dms`,token:other.token});
 assert.equal(dmList.body.data[0].dislikes,1);assert.equal(dmList.body.data[0].myVote,-1);assert.equal(dmList.body.data[0].recentReviews[0].comment,'direct DM comment');
 await api.query(`UPDATE users SET status='SUSPENDED' WHERE id='${other.userId}'`);
 assert.equal((await api.request({method:'PUT',url:`${dm}/reaction`,token:other.token,payload:{value:1}})).status,401);
 } finally {await api.stop();}
});
