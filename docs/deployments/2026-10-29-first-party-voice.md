# First-party campaign voice signaling

The previous SSLIP signaling endpoint repeatedly timed out during initial publication in remote Chrome audits, including after the user disabled VPN. The new `wss://dndnerds.ir/voice` route completed the same connection/publication flow.

Nginx proxies `/voice/` to the existing local LiveKit service, strips the prefix and website cookies, preserves WebSocket upgrades, and omits URL access logs. Existing voice hostname remains available.

Only `LIVEKIT_URL` is supplied through a separate `/opt/dndnerds/livekit/voice-public.env` file and the service drop-in `60-voice-public-url.conf`. The secret app environment file is unchanged. Operator probe found zero active human voice rooms before the service restart. Deployment unit `dnd-first-party-voice-deploy-20261029` completed with Result=success / ExecMainStatus=0. Runtime process environment and HTTPS health confirmed the new endpoint. Backup: `/opt/dndnerds/backups/voice-first-party-20261029T150231Z`.

## Evidence and limits

- Two independent Chrome peers received each other continuously over 20 samples / 60 seconds.
- Ten independent Chrome tabs all connected and published without the previous timeout. Late audio-context clock drift coincided with lower non-silent counts, so that run did not pass strict decoded-audio acceptance.
- Ten Rooms with one shared test AudioContext received all 90 remote streams throughout 20 samples / 60 seconds. Last sample: 286,491 received packets, 56 reported lost, maximum jitter 10 ms. This test passed.
- Official CLI local and public TLS/SNI capacity checks each received 100/100 streams with zero reported loss/errors for 60 seconds.
- Forced UDP relay delivered continuous decoded sound in both independent peers. One conservative harness result was false because its sampled nominated-candidate flag was missing; selected-pair collection was corrected to also use transport.selectedCandidatePairId.
- Forced TURN/TLS acceptance remains under investigation. Do not describe the successful direct/shared-context checks as ten independent physical devices or every network being verified.

No real microphone or conversation was captured. User SMM drafts and VTT backend were preserved. A failure-injection check confirmed that a concurrent-runtime preflight abort causes no service or proxy side effects. Independent review accepted the promotion guard/rollback changes.

A subsequent TURN proxy-header/bridge trial did not fix TLS relay and was rolled back with zero active human rooms. Original TURN proxy-protocol handling and route were restored; first-party signaling remains active. Narrow STUN-only capture showed some matched local relay↔SFU transactions but did not establish a working TLS media path. No firewall/authentication policy change was made.
