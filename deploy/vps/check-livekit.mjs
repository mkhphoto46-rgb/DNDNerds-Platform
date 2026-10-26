import { AccessToken, RoomServiceClient } from 'livekit-server-sdk'

const url = process.env.LIVEKIT_URL.replace('wss://', 'https://')
const client = new RoomServiceClient(url, process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET)
const rooms = await client.listRooms()
console.log(`livekit-api-ok rooms=${rooms.length}`)

const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
  identity: `deployment-check-${Date.now()}`,
  ttl: 60,
})
token.addGrant({ roomJoin: true, room: 'deployment-check', canPublish: false, canSubscribe: false })
const websocketUrl = new URL(`${process.env.LIVEKIT_URL}/rtc`)
websocketUrl.searchParams.set('access_token', await token.toJwt())
websocketUrl.searchParams.set('auto_subscribe', '0')
websocketUrl.searchParams.set('sdk', 'js')
websocketUrl.searchParams.set('version', '2.23.0')
websocketUrl.searchParams.set('protocol', '15')

await new Promise((resolve, reject) => {
  const socket = new WebSocket(websocketUrl)
  const timeout = setTimeout(() => { socket.close(); reject(new Error('signaling timeout')) }, 10000)
  socket.addEventListener('open', () => {
    clearTimeout(timeout)
    console.log('livekit-websocket-open')
    socket.close()
    resolve()
  }, { once: true })
  socket.addEventListener('error', () => {
    clearTimeout(timeout)
    reject(new Error('signaling error'))
  }, { once: true })
})
