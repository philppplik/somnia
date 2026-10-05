// Manual demo on one machine: node demo.mjs  -> prints invite links, edits a file as two users.
import { Relay } from './src/relay.mjs'
import { Session } from './src/session.mjs'
const relay = new Relay(); await relay.ready
const host = new Session(relay.hostUrl()); await host.connect()
host.file('index.html').insert(0, '<h1>Hello</h1>')
console.log('editor invite:', relay.invite('editor')); console.log('viewer invite:', relay.invite('viewer'))
const guest = new Session(relay.invite('editor')); await guest.connect()
await new Promise(r => setTimeout(r, 100))
guest.file('index.html').insert(14, '<p>hi from guest</p>')
await new Promise(r => setTimeout(r, 100))
console.log('host sees:', host.text('index.html'))
host.disconnect(); guest.disconnect(); await relay.close(); process.exit(0)
