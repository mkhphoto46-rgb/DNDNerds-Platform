import {test} from 'node:test';
import assert from 'node:assert/strict';
import {homebrewInput} from './knowledge-input.js';
test('homebrew validates publish length and rejects an injected author or category',()=>{
 const valid={title:'چراغ آزمایشی',summary:'معرفی روشن و قابل خواندن',body:'الف '.repeat(150),kind:'ITEM',status:'PUBLISHED'};
 assert.equal(homebrewInput.safeParse(valid).success,true);
 assert.equal(homebrewInput.safeParse({...valid,body:'کوتاه'}).success,false);
 assert.equal(homebrewInput.safeParse({...valid,body:'ب'.repeat(20001)}).success,false);
 assert.equal(homebrewInput.safeParse({...valid,authorUserId:'someone-else'}).success,false);
 assert.equal(homebrewInput.safeParse({...valid,status:'ADMIN'}).success,false);
 assert.equal(homebrewInput.safeParse({...valid,kind:'bad'}).success,false);
 assert.equal(homebrewInput.safeParse({...valid,title:'   '}).success,false);
});
