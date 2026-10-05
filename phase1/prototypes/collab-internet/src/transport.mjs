// Browser/Tauri-WebView adapter. Sends opaque protocol frames, not project files.
// A host/editor/viewer policy must be enforced above this layer on the host.
export const MAX_DATA_BYTES = 16 * 1024
export const MAX_BUFFER_BYTES = 256 * 1024
export function signalingUrl(value) {
  const url = new URL(value)
  if (url.username || url.password || url.hash || url.search) throw new Error('Credentials must not be in the signaling URL')
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Signaling requires WSS except on loopback')
  return url.href
}
export function sendFrame(channel, bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_DATA_BYTES) throw new Error('Frame must contain 1-16384 bytes')
  if (channel.readyState !== 'open') throw new Error('Data channel is not open')
  if (channel.bufferedAmount + bytes.byteLength > MAX_BUFFER_BYTES) throw new Error('Backpressure: retry after buffer drains')
  channel.send(bytes)
}

export class InternetPeer {
  constructor({ url, role, token, iceServers = [], relayOnly = false, timeoutMs = 20_000, onFrame = () => {}, onStatus = () => {}, PeerConnection = globalThis.RTCPeerConnection, Socket = globalThis.WebSocket }) {
    if (!['host', 'guest'].includes(role)) throw new Error('Unknown role')
    this.url = signalingUrl(url)
    this.role = role
    this.token = token
    this.Socket = Socket
    this.onFrame = onFrame
    this.onStatus = onStatus
    this.timeoutMs = timeoutMs
    this.pc = new PeerConnection({ iceServers, iceTransportPolicy: relayOnly ? 'relay' : 'all' })
    this.pendingCandidates = []
    this.sequence = Promise.resolve()
    this.closed = false
    this.started = false
    this.pc.onicecandidate = e => { if (e.candidate && !this.closed) this.signal({ type: 'candidate', candidate: e.candidate.toJSON() }) }
    this.pc.onconnectionstatechange = () => {
      this.status(this.pc.connectionState)
      if (this.pc.connectionState === 'failed') this.close('Connection failed; start a new room')
    }
    this.pc.ondatachannel = e => this.attach(e.channel)
  }
  status(value) { this.onStatus(value) }
  connect() {
    if (this.started || this.closed) throw new Error('Create a fresh peer to connect again')
    this.started = true
    this.timer = setTimeout(() => this.close('Connection timed out; check TURN or use a relay'), this.timeoutMs)
    this.ws = new this.Socket(this.url)
    this.ws.onopen = () => {
      this.signal({ type: 'auth', role: this.role, token: this.token })
      this.token = undefined
    }
    this.ws.onmessage = e => {
      // Serialize SDP/ICE work to avoid addIceCandidate before setRemoteDescription.
      if (typeof e.data !== 'string' || e.data.length > 32 * 1024) return this.close('Invalid signaling frame')
      this.sequence = this.sequence.then(() => this.receive(JSON.parse(e.data))).catch(() => this.close('Signaling failed'))
    }
    this.ws.onerror = () => this.close('Signaling unavailable')
    this.ws.onclose = () => { if (!this.closed) this.close('Signaling closed; start a new room') }
    this.status('Connecting')
    return this
  }
  signal(message) {
    if (this.ws?.readyState !== 1) throw new Error('Signaling is not open')
    this.ws.send(JSON.stringify(message))
  }
  async receive(m) {
    if (this.closed) return
    if (m.type === 'authenticated') return this.status('Waiting for peer')
    if (m.type === 'ready' && this.role === 'host' && !this.channel) {
      this.attach(this.pc.createDataChannel('somnia-protocol', { ordered: true }))
      await this.pc.setLocalDescription(await this.pc.createOffer())
      this.signal({ type: 'description', description: this.pc.localDescription.toJSON() })
    } else if (m.type === 'description') {
      await this.pc.setRemoteDescription(m.description)
      for (const c of this.pendingCandidates.splice(0)) await this.pc.addIceCandidate(c)
      if (this.role === 'guest') {
        await this.pc.setLocalDescription(await this.pc.createAnswer())
        this.signal({ type: 'description', description: this.pc.localDescription.toJSON() })
      }
    } else if (m.type === 'candidate') {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(m.candidate)
      else {
        if (this.pendingCandidates.length >= 256) throw new Error('Too many pending ICE candidates')
        this.pendingCandidates.push(m.candidate)
      }
    }
  }
  attach(channel) {
    if (this.channel) { channel.close(); return }
    this.channel = channel
    channel.binaryType = 'arraybuffer'
    channel.onopen = () => { clearTimeout(this.timer); this.status('Data channel open') }
    channel.onclose = () => { if (!this.closed) this.close('Data channel closed') }
    channel.onmessage = e => {
      if (!(e.data instanceof ArrayBuffer) || !e.data.byteLength || e.data.byteLength > MAX_DATA_BYTES) return this.close('Invalid data frame')
      this.onFrame(new Uint8Array(e.data))
    }
  }
  send(bytes) { sendFrame(this.channel, bytes) }
  close(reason = 'Closed') {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.timer)
    this.token = undefined
    this.pendingCandidates.length = 0
    this.channel?.close()
    this.pc.close()
    this.ws?.close()
    this.status(reason)
  }
}
