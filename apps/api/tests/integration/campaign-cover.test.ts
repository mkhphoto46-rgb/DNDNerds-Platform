import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validProfileImage} from '../../src/routes/profile-image.js';
function image(width:number,height:number,bytes=30){const b=Buffer.alloc(bytes);b.write('RIFF');b.writeUInt32LE(bytes-8,4);b.write('WEBP',8);b.write('VP8X',12);b.writeUIntLE(width-1,24,3);b.writeUIntLE(height-1,27,3);return 'data:image/webp;base64,'+b.toString('base64');}
test('campaign covers accept detailed landscape previews within bounded size',()=>{assert.equal(validProfileImage(image(1280,800,250000),'campaign'),true);assert.equal(validProfileImage(image(1281,800),'campaign'),false);assert.equal(validProfileImage(image(1280,801),'campaign'),false);assert.equal(validProfileImage(image(1280,800,500001),'campaign'),false);});
