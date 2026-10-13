import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {claimVibeShell} from '../../lib/vibespace/shellSession';
import {fixtureSnapshot} from '../../lib/vibespace/fixture';
import {SpacesPanel,RunsPanel,AttentionPanel,RunSection,UsageSection,MemoryShellPanel,SkillsShellPanel} from './VibeSpacePanels';
const context={studio:'vibespace',selection:{kind:'none' as const,count:0},busy:false,services:{}};
const props={panelId:'runs',context};
test('panels show loaded spaces and runs; attention excludes ordinary running work',()=>{
 const b=claimVibeShell();b.report({view:{snapshot:fixtureSnapshot(),loading:false,pending:false,error:null},spaceId:'space-demo',runId:'run-copy',native:false,canCreateSpace:true,canCreateStudio:true});
 try{
  const spaces=renderToStaticMarkup(<SpacesPanel {...props}/>);assert.match(spaces,/Website relaunch/);assert.match(spaces,/aria-current="page"/);
  const runs=renderToStaticMarkup(<RunsPanel {...props}/>);assert.match(runs,/Improve image descriptions/);assert.match(runs,/Filter runs/);
  const attention=renderToStaticMarkup(<AttentionPanel {...props}/>);assert.match(attention,/Check external links/);assert.match(attention,/Check document headings/);assert.ok(!attention.includes('Improve image descriptions'));
  const detail=renderToStaticMarkup(<RunSection sectionId="run" context={context}/>);assert.match(detail,/0:42/);assert.match(detail,/Open run and review/);assert.ok(!detail.includes('Confirm Apply'));
  const usage=renderToStaticMarkup(<UsageSection sectionId="usage" context={context}/>);assert.match(usage,/USD 0.04/);assert.match(usage,/provider_reported/);
 }finally{b.release();}
});
test('unmounted browser/empty state offers no fake snapshot or enabled write actions',()=>{
 const b=claimVibeShell();try{const html=renderToStaticMarkup(<SpacesPanel {...props}/>);assert.match(html,/Open the desktop app/);assert.match(html,/disabled=""/);assert.ok(!html.includes('Website relaunch'));}finally{b.release();}
});

test('memory and skills hosts never mount native transport for fixture space data',()=>{
 const b=claimVibeShell();b.report({view:{snapshot:fixtureSnapshot(),loading:false,pending:false,error:null},spaceId:'space-demo',runId:null,native:false,canCreateSpace:true,canCreateStudio:true});
 try{for(const Host of [MemoryShellPanel,SkillsShellPanel]){const html=renderToStaticMarkup(<Host {...props}/>);assert.match(html,/Open the desktop app/);assert.ok(!html.includes('textarea'));}}finally{b.release();}
});
