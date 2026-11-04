import {validProfileImage} from '../routes/profile-image.js';
export function cleanReferenceImage(value:string):string|null{
  if(!validProfileImage(value,'campaign'))return null;
  const raw=Buffer.from(value.split(',')[1]!,'base64');const chunks:Buffer[]=[];
  for(let at=12;at+8<=raw.length;){const size=raw.readUInt32LE(at+4);const end=at+8+size+(size%2);if(end>raw.length)return null;
    const type=raw.toString('ascii',at,at+4);
    if(['ANIM','ANMF'].includes(type))return null;
    if(['VP8X','VP8L','VP8 ','ALPH'].includes(type)){const chunk=Buffer.from(raw.subarray(at,end));if(type==='VP8X')chunk[8]=chunk[8]!&0x10;chunks.push(chunk);}at=end;
  }
  if(!chunks.some(c=>['VP8L','VP8 '].includes(c.toString('ascii',0,4))))return null;
  const result=Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP','ascii'),...chunks]);result.writeUInt32LE(result.length-8,4);
  const data='data:image/webp;base64,'+result.toString('base64');return validProfileImage(data,'campaign')?data:null;
}
