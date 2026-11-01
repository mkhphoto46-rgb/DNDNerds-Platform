const {createHmac}=require('node:crypto');
process.loadEnvFile('/opt/dndnerds/app/.env');
const postgres=require('/opt/dndnerds/app/apps/api/node_modules/postgres');
const sql=postgres(process.env.DATABASE_URL,{max:1});
(async()=>{
try {
 const status=await fetch('http://127.0.0.1:4200/api/platform/status');
 if(!status.ok)throw Error('VTT status unavailable');
 const rooms=(await status.json()).connectedCampaignRooms;
 if(!Number.isInteger(rooms))throw Error('Campaign rooms unavailable');
 const rows=await sql`select id from game_tables`;
 const tableIds=rows.map(row=>row.id);
 const secret=process.env.VTT_BRIDGE_SECRET || createHmac('sha256',process.env.AUTH_SESSION_SECRET||process.env.MFA_ENCRYPTION_KEY).update('dnd-nerds-vtt-bridge-v1').digest('hex');
 const timestamp=String(Date.now());
 const signature=createHmac('sha256',secret).update(`${timestamp}:${tableIds.join(',')}`).digest('hex');
 const response=await fetch('http://127.0.0.1:4200/api/platform/table-status',{method:'POST',headers:{'Content-Type':'application/json','X-Platform-Timestamp':timestamp,'X-Platform-Signature':signature},body:JSON.stringify({tableIds}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Seat probe refused: '+response.status);
 const data=(await response.json()).data;
 const activeSeats=data.reduce((count,row)=>count+row.onlineCount,0);
 console.log(JSON.stringify({linkedTablesChecked:tableIds.length,connectedCampaignRooms:rooms,activeSeats}));
 if(activeSeats&&!process.argv.includes('--allow-active-seats'))process.exitCode=2;
}finally{await sql.end();}
})().catch(error=>{console.error('Seat preflight failed: '+(error.code||error.message));process.exitCode=3;});





