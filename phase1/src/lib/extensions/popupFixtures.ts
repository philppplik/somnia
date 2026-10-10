import type {PopupExtension} from './popupModel';
import type {ActivityEvent} from './securityActivity';
import type {ExtensionsPopupHost} from './popupHost';

/** Test and screenshot fixtures only. Never imported by production code: names, hosts and digests are illustrative. */
const today=new Date();today.setHours(13,2,14,0);
const at=(h:number,m:number,s:number)=>{const d=new Date(today);d.setHours(h,m,s,0);return d.toISOString();};
const HASH='a41d7e0c3b9f58d2c6e1a7b4093f5d8e2c1b6a97d4e80f3a5c2b1d9e7f6a90bc';
export const FIXTURE_EXTENSIONS:PopupExtension[]=[
 {id:'example.word-count',name:'Word count',version:'1.2.0',description:'Live word count and reading time.',publisher:'example-dev',badge:null,enabled:true,status:'running',grants:[],contributions:['panels'],lastActivity:null,source:{provider:'GitHub release',repository:'example-dev/word-count',release:'1.2.0',verification:'no-signed-match'},update:{kind:'current'}},
 {id:'example.tidy-html',name:'Tidy HTML',version:'0.9.1',description:'Reformat the open HTML file with one command.',publisher:'example-dev',badge:{criterion:'Publisher identity confirmed by the signed index'},enabled:true,status:'running',
  grants:[{id:'project.read',key:'project.read',control:'toggle',granted:true},{id:'project.write',key:'project.write',control:'toggle',granted:true}],contributions:['commands'],lastActivity:{ts:at(13,2,14),target:'index.html',api:'project.write'},
  about:'<main>\n  <h1>Hello, Somnia</h1>\n</main>',source:{provider:'GitHub release',repository:'example-dev/tidy-html',release:'0.9.1',sha256:HASH,verification:'signed-match'},update:{kind:'consent',version:'0.10.0',added:['network.api.example.com'],keepsRunning:true}},
 {id:'example.coffee-shop-plus',name:'Coffee Shop+',version:'2.0.0',description:'Two extra warm code themes.',publisher:'example-dev',badge:null,enabled:true,status:'running',grants:[],contributions:['themes'],lastActivity:null,source:{provider:'GitHub release',repository:'example-dev/coffee-shop-plus',release:'2.0.0',verification:'no-signed-match'},update:{kind:'current'}},
 {id:'example.snippet-pack',name:'Snippet Pack',version:'1.0.0',description:'40 HTML and CSS snippets.',publisher:'example-dev',badge:null,enabled:false,status:'disabled',grants:[{id:'project.read',key:'project.read',control:'toggle',granted:true}],contributions:['snippets'],lastActivity:{ts:new Date(Date.now()-86400000).toISOString(),target:null,api:'project.read'},source:{provider:'GitHub release',repository:'example-dev/snippet-pack',release:'1.0.0',verification:'no-signed-match'},update:{kind:'current'}},
];
const ev=(id:string,ts:string,name:string,api:string,target:string|null,decision:ActivityEvent['decision'],kind:ActivityEvent['kind'],extId='example.tidy-html'):ActivityEvent=>({id,ts,extensionId:extId,extensionName:name,api,target,decision,kind,latencyMs:4,scope:'current project'});
export const FIXTURE_EVENTS:ActivityEvent[]=[
 ev('e6',at(13,2,14),'Tidy HTML','project.write','index.html','allowed','permission'),
 ev('e5',at(13,2,13),'Tidy HTML','project.read','index.html','allowed','permission'),
 ev('e4',at(12,58,4),'GitHub releases','network.request','api.github.com /repos/…','allowed','network','example.github-releases'),
 ev('e3',at(12,57,41),'GitHub releases','network.request','unlisted.example.com','denied','network','example.github-releases'),
 ev('e2',at(12,51,9),'SVG Optimizer','folder.access','~/Sites/client-x','prompted','permission','example.svg-optimizer'),
 ev('e1',at(12,40,0),'Tidy HTML','lifecycle.enable','Extension lifecycle','changed','lifecycle'),
];
export function fixtureHost(over:Partial<ExtensionsPopupHost>={}):ExtensionsPopupHost{
 let list=structuredClone(FIXTURE_EXTENSIONS);
 return {
  list:async()=>structuredClone(list),
  setEnabled:async(id,on)=>{list=list.map(e=>e.id===id?{...e,enabled:on,status:on?'running':'disabled'}:e);},
  disableAll:async()=>{list=list.map(e=>({...e,enabled:false,status:'disabled'}));},
  setGrant:async(id,row,on)=>{list=list.map(e=>e.id===id?{...e,grants:e.grants.map(g=>g.id===row?{...g,granted:on}:g)}:e);},
  remove:async id=>{list=list.filter(e=>e.id!==id);},
  checkUpdate:async()=>{},reviewUpdate:async()=>({version:'0.10.0',added:['network.api.example.com'],blocked:false}),acceptUpdate:async()=>{},keepCurrent:async()=>{},
  queryActivity:async f=>{const events=FIXTURE_EVENTS.filter(e=>(!f.extensionId||e.extensionId===f.extensionId)&&(!f.decision||e.decision===f.decision)&&(!f.kind||e.kind===f.kind));return {events,nextOffset:null,total:events.length};},
  exportActivity:async()=>'/tmp/log.json',copyText:async()=>{},openExternal:async()=>{},
  inspect:async({manifestText})=>manifestText.trim()?({kind:'manifestOnly',id:'example.new',name:'New extension',version:'0.1.0'}):({kind:'empty'}),
  install:async()=>{},
  browse:async()=>({status:'ready',offline:false,fetchedAt:new Date().toISOString(),entries:[
   {id:'example.svg-optimizer',name:'SVG Optimizer',description:'Smaller SVG files, same artwork.',publisher:'example-dev',badge:{criterion:'Publisher identity confirmed by the signed index'},permissionLabels:['project.read','project.write'],state:'available',verified:true},
   {id:'example.coffee-shop-plus',name:'Coffee Shop+',description:'Two extra warm code themes.',publisher:'example-dev',badge:null,permissionLabels:[],state:'installed',verified:true},
   {id:'example.github-releases',name:'GitHub releases',description:'See releases from your project panel.',publisher:'example-dev',badge:null,permissionLabels:['project.read'],state:'available',verified:true},
   {id:'example.word-count',name:'Word count',description:'Live word count and reading time.',publisher:'example-dev',badge:null,permissionLabels:[],state:'installed',verified:true},
  ]}),
  reviewInstall:async()=>({kind:'error',code:'failed'}),developerMode:()=>false,
  ...over,
 };
}
