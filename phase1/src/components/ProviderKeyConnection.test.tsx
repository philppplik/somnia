import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProviderKeyConnection,OllamaConnection} from './ProviderKeyConnection';
import {McpConnections} from './McpConnections';
import {installMcpRuntime} from '../lib/agent/mcpRuntime';
import {CATALOGUES,setLocale} from '../lib/i18n';
test('all five locales carry every connections string',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>k.startsWith('conn.'));
 assert.ok(keys.length>=30);
 for(const l of ['en','de','es','fr','pt-BR'])assert.ok(keys.every(k=>!!CATALOGUES[l][k]),l);
});
test('key connections render a password field, never a value, and only Ollama has no key field',()=>{
 for(const p of ['claude','openrouter'] as const){
  const html=renderToStaticMarkup(<ProviderKeyConnection provider={p}/>);
  assert.ok(html.includes('type="password"')&&html.includes('autoComplete="off"')&&!/value="[^"]/.test(html));
 }
 assert.ok(!renderToStaticMarkup(<OllamaConnection/>).includes('password'));
 setLocale('en');
});
test('MCP list is honest outside the desktop app and links to Settings',()=>{
 const html=renderToStaticMarkup(<McpConnections onNavigate={()=>{}}/>);
 assert.ok(html.includes('Desktop app only')&&html.includes('Settings &gt; AI &gt; Tools'));
});
test('MCP list shows configured servers with running state and tool counts',async()=>{
 const rt=installMcpRuntime((async(cmd:string)=>cmd==='mcp_servers_list'?[{config:{id:'files',command:'srv',args:[],env:{}},running:false},{config:{id:'git',command:'g',args:[],env:{}},running:true}]:[]) as never);
 await rt.refresh();
 const html=renderToStaticMarkup(<McpConnections onNavigate={()=>{}}/>);
 assert.ok(html.includes('2 configured')&&html.includes('files')&&html.includes('stopped')&&html.includes('running, 0 tools'));
});
