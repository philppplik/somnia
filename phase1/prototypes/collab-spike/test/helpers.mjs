import { Relay } from '../src/relay.mjs'
import { Session } from '../src/session.mjs'
export async function start(opts) {
  const relay = new Relay(opts); await relay.ready
  const sessions = []
  const join = async url => { const s = new Session(url); sessions.push(s); await s.connect(); return s }
  const stop = async () => { sessions.forEach(s => { s.ws?.terminate(); s.awareness.destroy() }); await relay.close() }
  return { relay, join, stop }
}
export const until = async (fn, ms = 2000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout'); await new Promise(r => setTimeout(r, 10)) } }
// Awareness timers of sessions created inside tests would keep node alive; the runner exits explicitly.
import { after } from 'node:test'
after(() => setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref())
