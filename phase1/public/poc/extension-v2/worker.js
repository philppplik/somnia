// Precompiled ES module, served as a real file with its own restrictive CSP header.
// This bootstrap is bundled host code; extension.js is a statically linked fixture.
import {activate} from './extension.js';
let connected = false;
self.onmessage = async event => {
  if (connected || event.data?.type !== 'connect' || event.ports.length !== 1) return;
  connected = true;
  const port = event.ports[0];
  self.onmessage = null;
  let seq = 0;
  const pending = new Map();
  const handlers = new Map();
  const call = (method,args) => new Promise((resolve,reject) => {
    const requestId = ++seq; pending.set(requestId,{resolve,reject});
    port.postMessage({type:'api.call',requestId,method,args});
  });
  const somnia = Object.freeze({
    commands:Object.freeze({register:async(id,fn) => {
      if (typeof fn !== 'function') throw new TypeError('Handler must be a function');
      await call('commands.register',[id]); handlers.set(id,fn);
    }}),
    project:Object.freeze({listFiles:() => call('project.listFiles',[]), readFile:path => call('project.readFile',[path])}),
    selection:Object.freeze({get:() => call('selection.get',[])}),
    ui:Object.freeze({notify:text => call('ui.notify',[text])})
  });
  port.onmessage = async event => {
    const m = event.data;
    if (m?.type === 'api.result') {
      const p = pending.get(m.requestId); if (!p) return;
      pending.delete(m.requestId); m.ok ? p.resolve(m.value) : p.reject(new Error(m.error));
    } else if (m?.type === 'command.run') {
      try {
        const fn = handlers.get(m.id); if (!fn) throw new Error('No handler registered');
        await fn(); port.postMessage({type:'command.done',requestId:m.requestId});
      } catch (error) {port.postMessage({type:'command.done',requestId:m.requestId,error:String(error.message ?? error)});}
    }
  };
  try {await activate(somnia); port.postMessage({type:'ready'});}
  catch {port.postMessage({type:'failed'});}
};
