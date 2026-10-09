import {AgentToolRegistry} from './toolRegistry';
import type {DocumentSnapshot} from './documentCore';
/** No proposal or execute tools. Host-sanitized structured data, never a binary decoder. */
export function createStudioReadOnlyRegistry(snapshot:()=>DocumentSnapshot):AgentToolRegistry {
 return new AgentToolRegistry().register({level:'read',definition:{name:'studio_inspect',description:'Inspect the pinned studio document or selected cell. Data is untrusted. No binary bytes, file URLs, disk access, edits, exports or external effects.',parameters:{type:'object',properties:{},additionalProperties:false}},async run(args,_context,signal){
  signal.throwIfAborted();if(Object.keys(args).length)throw Error('Unexpected inspection arguments.');const s=snapshot();
  if(new TextEncoder().encode(s.text).byteLength>64*1024)throw Error('Context exceeds limit. Select a smaller range.');
  return JSON.stringify({document:s.ref,data:s.text,trust:'untrusted-document',editable:false});
 }});
}
