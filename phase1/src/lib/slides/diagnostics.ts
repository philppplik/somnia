import {unzipSync,strFromU8} from 'fflate';
import {listZip} from '../office/zipProbe';
import {readRuns} from './editCopy';
export interface SlidesDiagnostics {editable:boolean;warnings:string[];expandedBytes:number;entryCount:number;producer:string}
/** Structural limits are reported, never disguised as full rendering fidelity. */
export function diagnosePptx(bytes:Uint8Array):SlidesDiagnostics {const entries=listZip(bytes);const expandedBytes=entries.reduce((n,e)=>n+e.size,0);if(entries.length>2048||entries.some(e=>e.encrypted||e.size>16*1024*1024)||expandedBytes>64*1024*1024)throw Error('PPTX exceeds diagnostics intake budget');const zip=unzipSync(bytes);const warnings:string[]=[];const names=entries.map(e=>e.name);const xml=names.filter(n=>/^ppt\/slides\/.*\.xml$/.test(n)).map(n=>strFromU8(zip[n])).join('\n');
 if(names.some(n=>n.startsWith('ppt/charts/')))warnings.push('Charts are preview-only; chart data is not editable.');
 if(names.some(n=>n.startsWith('ppt/diagrams/')))warnings.push('SmartArt may use a fallback preview.');
 if(names.some(n=>n.startsWith('ppt/embeddings/')))warnings.push('Embedded OLE objects are never executed and may not render.');
 if(/<(?:p:timing|p:transition)\b/.test(xml))warnings.push('Animations and transitions are not played.');
 if(names.some(n=>n.startsWith('ppt/fonts/')))warnings.push('Embedded fonts are not guaranteed to match the preview.');
 if(names.some(n=>n.startsWith('ppt/notesSlides/')))warnings.push('Speaker notes are retained in copies but not shown.');
 if(names.filter(n=>n.endsWith('.rels')).some(n=>/TargetMode=["']External["']/.test(strFromU8(zip[n]))))warnings.push('External relationships are not fetched.');
 let editable=true;try{const runs=readRuns(bytes);editable=runs.length>0;}catch(error){editable=false;warnings.push('Text editing unavailable: '+String(error));}
 if(!editable&&!warnings.some(w=>w.startsWith('Text editing')))warnings.push('No canonical editable text runs found.');
 warnings.push('A blank preview is not proof of an empty slide; upstream render diagnostics are limited.');
 const app=zip['docProps/app.xml'];const producer=app?/<(?:\w+:)?Application>([^<]*)<\//.exec(strFromU8(app))?.[1]??'Unknown':'Unknown';return {editable,warnings,expandedBytes,entryCount:entries.length,producer};}
