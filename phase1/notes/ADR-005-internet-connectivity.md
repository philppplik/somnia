# ADR-005: Internet connectivity research and prototype

Date: 2026-10-05. Status: recommendation only, not a deployment decision. Companion prototype: `phase1/prototypes/collab-internet`. No app code changed.

## Recommendation

For a shipping internet mode, use host-centred WebRTC data channels, authenticated WSS signaling and short-lived TURN credentials with UDP and TURN/TLS-over-TCP on port 443. Preserve the host as the only disk writer. Add an authenticated, end-to-end-encrypted WSS data relay as the explicit fallback when ICE or corporate filtering prevents WebRTC. Do not promise "firewall-free": outbound connections remove router setup, but networks can still block the protocol, hostname or port. Start with the local spike and a controlled two-network test, not a public tunnel around the existing plain-WS relay.

This plan prioritizes no inbound router configuration, local ownership of files, browser joins, metadata minimization and explicit spend control. It is an architecture proposal, not authorization to create a service, activate billing or publish a project.

## Ranked choices

| Choice | Fit | Cost model | Privacy and limits |
| --- | --- | --- | --- |
| 1. WebRTC + WSS signaling + managed TURN | Product direction; direct where possible, TURN when needed | Signaling hosting plus TURN outbound usage. Cloudflare documents $0.05/GB and a shared 1,000 GB free tier with SFU [1,2] | DTLS protects data over TURN, but signaling identity must be bound to the invite. IPs, timing and room metadata remain visible. TURN/TLS 443 is not HTTP and may be blocked. |
| 2. Self-hosted WSS encrypted data relay | Required compatibility fallback; also viable simpler first remote alpha | Server, bandwidth, maintenance and abuse control. No verified hosting quote selected. | All content passes through a server. TLS alone gives the server plaintext; an authenticated application encryption layer is required for the local-first privacy claim. |
| 3. Self-hosted coturn | Owner-controlled TURN; useful if region/ops control matters | Open-source server [7]; compute, bandwidth, patching, certificates and abuse controls still cost | Relay carries encrypted WebRTC packets. Requires reachable server ports and relay allocation ranges, not client router forwarding. Never run anonymous public TURN. |
| 4. Private Tailscale network | Controlled developer/team trial, not frictionless browser guests | Plan eligibility must be checked for the actual team; no commercial price claimed | Participants need appropriate network access/software. Funnel is a distinct public exposure feature; its relay cannot decrypt the TLS proxy payload [5]. |
| 5. ngrok / Cloudflare Tunnel / Funnel | Opt-in developer diagnostics, not default product architecture | ngrok free: 1 GB/month outbound, 20,000 HTTP requests/month, up to 3 endpoints [4]. Other production totals not established here. | Public endpoints still require app admission. Cloudflare supports WebSockets but needs outbound 7844; not a universal 443-only workaround [8,9]. Funnel has fixed bandwidth limits [5]. |

An SFU is not needed for this text-data prototype. Host fan-out is a suggested topology, not a benchmarked multi-guest result. Binary assets, file permissions and code-editor bindings are separate work.

## Transport facts and design

### Signaling is separate from data

WebRTC does not define the application's signaling transport [6]. Exchange SDP offers/answers and trickled ICE candidates over authenticated WSS. The prototype has exactly one host and guest, a fixed offerer (avoids offer glare), and serializes incoming SDP/ICE. A future multiparty implementation must isolate each guest connection and support ICE restart. Do not forward project content through signaling. Tokens belong in an authenticated frame/header rather than URL queries. Do not log SDP or candidates by default: they contain network information.

### NAT traversal and firewalls

ICE uses direct candidates and STUN to find paths; TURN relays when direct paths fail [3,6]. RFC 8835 requires TURN-over-TCP and TURN-over-TLS-over-TCP support for UDP-blocking firewalls [3]. This does not mean every WebView or corporate proxy will permit it. Port 443 is a deployment choice; verify it is actually provided by the selected TURN service and negotiate the exact credential response, rather than synthesizing vendor hostnames. A TLS-capable TURN listener is not an HTTPS endpoint and cannot be put behind an ordinary HTTP reverse proxy unchanged.

A WSS relay uses outbound web traffic and may fit restrictive proxies better, but application/network policy can still deny WebSockets. Explain the failure rather than requesting users disable their firewall. Never silently route through a new vendor.

### Privacy and authentication

RTCDataChannel traffic is DTLS-encrypted [10]. Cloudflare states that its TURN service cannot read WebRTC contents and does process client IPs, ports and timing [1]. This describes TURN packet forwarding, not protection from a compromised signaling service. Authenticate the peer's SDP fingerprint/handshake using a separate trusted identity or invite-derived secret before making an end-to-end privacy claim. A signaling service able to replace SDP can otherwise impersonate endpoints.

Direct connection also gives the other participant candidate/network information. Offer relay-only as a privacy mode with a clear bandwidth-cost tradeoff. It must fail when no TURN route exists, not fall back to direct ICE. Hosted signaling still sees metadata. TURN compliance is not an application-wide GDPR guarantee; Cloudflare's FAQ directs compliance questions to its certifications/enterprise process [1]. No regional residence or data-processing agreement has been verified here.

The existing LAN spike holds a Y.Doc at its local relay and accepts invite codes in a plain WS URL. Simply exposing that service is not this design. It also keys failed admissions on socket address; behind a proxy all clients may share that address. Correctly trusted proxy attribution and per-principal controls need a separate design. Viewer enforcement remains on the host above transport, never only in the guest UI.

### Cost and spend control

Cloudflare's current official pricing page states $0.05 per GB of egress and a shared 1,000 GB free tier for SFU and TURN [2]. The fetched text does not state a reset period for that allowance, so this report does not assume it is monthly. The FAQ measures TURN traffic from Cloudflare edge to TURN client, including overhead [1]. As a simple sensitivity calculation, 20 GB of **billable** egress at that rate is $1; that is not a quote for a session, and ignores signaling, tax and other services. Both direction/fan-out and frequent full-state resyncs change usage. Existing spike's 435 KB full-state result is local baseline context, not measured internet bandwidth.

Do not rely on a free tier as a spending guard. Before enabling any service: owner-selected billing terms, enforced traffic/admission quotas, abuse protection, short-lived credentials and a real shutoff policy. Alerts alone do not cap a bill. Self-hosted coturn is not free hosting: capacity, TLS, egress and operations need a separately sourced quote.

### Tunnels are trial paths, not a bypass promise

Cloudflare Tunnel supports WebSockets [8], but the current setup page asks restrictive networks to allow outbound 7844 [9]. Quick Tunnels have no uptime guarantee, changing hostnames, 200 in-flight requests and no SSE [11]. ngrok free has traffic/request quotas and an HTML interstitial [4]. Tailscale Funnel is public, TLS-only, restricted to tailnet DNS and ports 443/8443/10000, with non-configurable bandwidth limits [5]. Its documented TLS proxy encryption differs from an HTTPS-terminating reverse proxy: do not treat all tunnel vendors as having the same content visibility.

No tunnel was opened and no actual provider account limits or endpoint were tested. A tunnel can accidentally expose the host's local server and requires separate explicit opt-in, authentication and safe scope.

## Prototype result and open gates

Implemented authenticated loopback signaling plus a browser-compatible WebRTC adapter. 14 unit/integration tests pass, and two real Chromium contexts exchange binary data both ways and close on peer departure. This validates basic protocol flow, not internet NAT traversal. No Yjs/doc integration or Windows installer is included. Frame size is 16 KiB, so the old spike's larger initial sync requires chunk/reassembly tests before integration.

Before calling internet mode ready:

1. Bind admission and SDP fingerprints to trusted identity/invite, audit denial paths, guest revocation, viewer enforcement and unauthenticated service limits.
2. Select a deployment/provider only after region, operational responsibilities, pricing, quotas and permission are settled.
3. Validate TURN/UDP, TURN/TLS 443, relay-only and no-route failure across home/mobile and restricted networks, with candidate-pair evidence.
4. Validate WebView2 feature availability and Tauri CSP/network settings on Windows; Chromium success is not that evidence.
5. Add authenticated E2EE WSS data fallback, bounded chunking, reconnect/resync and an honest connection-status UI. Distinguish room join expiration from active session lifetime.
6. Keep disk writes on the host and preserve unsaved/conflict handling. Transport encryption cannot solve malicious HTML/assets or CRDT semantic conflicts.

## Source ledger

All links below were opened as readable pages on 2026-10-05. Vendor claims are attributed; no independent NAT success rate or Windows benchmark was found or claimed. Sources include protocol standards, implementation guidance and vendor operations/pricing documentation.

1. Cloudflare, Realtime TURN FAQ, updated 2026-07-14. Pricing basis, metadata, DTLS, compliance limits: https://developers.cloudflare.com/realtime/turn/faq/
2. Cloudflare, Realtime SFU pricing. Shared free tier and egress rate: https://developers.cloudflare.com/realtime/sfu/pricing/
3. IETF/RFC Editor, RFC 8835, January 2021. ICE and TCP/TLS TURN transport requirements: https://www.rfc-editor.org/rfc/rfc8835.html
4. ngrok, Free Plan Limits. Quotas and free HTML interstitial: https://ngrok.com/docs/pricing-limits/free-plan-limits
5. Tailscale, Funnel documentation. Public exposure, TLS proxy confidentiality and limits: https://tailscale.com/docs/features/tailscale-funnel
6. WebRTC project, Getting started with peer connections. Signaling, SDP and trickle ICE: https://webrtc.org/getting-started/peer-connections
7. coturn project, README.turnserver. Long-term authentication and secret-based timed credentials: https://github.com/coturn/coturn/blob/master/README.turnserver
8. Cloudflare, Tunnels FAQ, updated 2026-09-16. WebSocket support and public routing caveats: https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/
9. Cloudflare, Set up Cloudflare Tunnel. Outbound 7844 requirement: https://developers.cloudflare.com/tunnel/setup/
10. MDN, Using WebRTC data channels. DTLS and data channel handling: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels
11. Cloudflare, Quick Tunnels. Test-only uptime and capacity limits: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/

Security guidance beyond the sources (fingerprint binding, admission controls, WSS E2EE fallback) is proposed implementation work, not a claim that this prototype already meets it.
