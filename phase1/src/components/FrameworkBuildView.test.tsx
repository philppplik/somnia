import {test} from 'node:test';import assert from 'node:assert/strict';import {renderToStaticMarkup} from 'react-dom/server';
import {FrameworkBuildView,formatBytes} from './FrameworkBuildView';
import {CATALOGUES} from '../lib/i18n';
import type {StaticBuildState} from '../lib/frameworks/staticBuild';
const t=(k:string,p?:Record<string,string|number>)=>k+(p?JSON.stringify(p):'');
const base:StaticBuildState={phase:'idle',projectId:'p',logs:[]};
const done:StaticBuildState={...base,phase:'done',summary:{framework:'react',dist:'dist',fileCount:2,totalBytes:2048,spaRules:{nginx:'try_files $uri /index.html;',apache:'RewriteRule ^ /index.html [L]'},manifest:{kind:'static',buildId:'abcdef0123456789abcdef0123456789',files:[{path:'index.html',sha256:'a'.repeat(64),size:1024,mode:0o644},{path:'assets/app.js',sha256:'b'.repeat(64),size:1024,mode:0o644}]}}};
test('idle shows hint and a build button; busy shows cancel',()=>{
 const idle=renderToStaticMarkup(<FrameworkBuildView state={base} busy={false} onBuild={()=>{}} onCancel={()=>{}} t={t}/>);
 assert.match(idle,/frameworks\.build\.hint/);assert.match(idle,/frameworks\.build\.start/);assert.doesNotMatch(idle,/frameworks\.build\.cancel/);
 const busy=renderToStaticMarkup(<FrameworkBuildView state={{...base,phase:'building'}} busy onBuild={()=>{}} onCancel={()=>{}} t={t}/>);
 assert.match(busy,/frameworks\.build\.cancel/);assert.match(busy,/phase\.building/);
});
test('result lists files, short build id and SPA rules',()=>{
 const html=renderToStaticMarkup(<FrameworkBuildView state={done} busy={false} onBuild={()=>{}} onCancel={()=>{}} t={t}/>);
 assert.match(html,/index\.html/);assert.match(html,/abcdef012345/);assert.doesNotMatch(html,/abcdef0123456789abcdef/);assert.match(html,/try_files/);assert.match(html,/frameworks\.build\.again/);
});
test('failure shows the mapped message and a safe path',()=>{
 const html=renderToStaticMarkup(<FrameworkBuildView state={{...base,phase:'failed',errorKey:'frameworks.artifact.forbidden',errorPath:'.env.production'}} busy={false} onBuild={()=>{}} onCancel={()=>{}} t={t}/>);
 assert.match(html,/role="alert"/);assert.match(html,/\.env\.production/);
});
test('formatBytes',()=>{assert.equal(formatBytes(12),'12 B');assert.equal(formatBytes(2048),'2.0 KB');assert.equal(formatBytes(5*1048576),'5.0 MB');});
test('build and artifact keys exist in all five languages',()=>{
 const keys=Object.keys(CATALOGUES.en).filter(k=>/^frameworks\.(build|artifact)\./.test(k));assert.ok(keys.length>=25);
 for(const [loc,cat] of Object.entries(CATALOGUES))for(const k of keys)assert.ok(cat[k],`${loc}: ${k}`);
});
