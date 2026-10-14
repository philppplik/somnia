/** Structural evidence comparison. Pixels require actual review, never auto-approved. */
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const [before,after]=process.argv.slice(2);if(!before||!after)throw Error('Usage: node scripts/compare-settings-captures.mjs BEFORE_DIR AFTER_DIR');
const reports=[];
for(const mode of ['light','dark','high']){
 const a=JSON.parse(readFileSync(resolve(before,`${mode}-manifest.json`),'utf8')),b=JSON.parse(readFileSync(resolve(after,`${mode}-manifest.json`),'utf8'));
 const strip=entry=>({section:entry.section,status:entry.status,controls:entry.controls?.map(({slot,...control})=>control)});
 if(JSON.stringify(a.results.map(strip))!==JSON.stringify(b.results.map(strip)))reports.push(`${mode}: control/section contract differs; review required`);
 const shotsA=readdirSync(before).filter(p=>p.startsWith(`${mode}-`)&&p.endsWith('.png')).sort(),shotsB=readdirSync(after).filter(p=>p.startsWith(`${mode}-`)&&p.endsWith('.png')).sort();
 if(JSON.stringify(shotsA)!==JSON.stringify(shotsB))reports.push(`${mode}: screenshot inventory differs; cannot compare complete evidence`);
}
if(reports.length){console.error(reports.join('\n'));process.exitCode=1;}else console.log('Section/control contract and screenshot inventory match. Inspect before/after PNG pixels separately; this does not approve visual parity.');
