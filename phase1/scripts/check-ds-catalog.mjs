import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const phase=resolve(dirname(fileURLToPath(import.meta.url)),'..'),repo=resolve(phase,'..');
const catalog=JSON.parse(readFileSync(resolve(repo,'docs/design/native-ui/state-catalog.json'),'utf8'));
// Explicit required set: missing entries must fail, not silently disappear from discovery.
const required=['field','native-controls','number','range','boolean-choice','panel','notice','menu','tooltip','popover','icon-button'];
const seen=new Set(),errors=[];
for(const entry of catalog.components){
 if(seen.has(entry.id))errors.push(`Duplicate id: ${entry.id}`);seen.add(entry.id);
 if(!entry.exports?.length||!entry.states?.length)errors.push(`Incomplete contract: ${entry.id}`);
 if(new Set(entry.states).size!==entry.states.length)errors.push(`Duplicate state: ${entry.id}`);
 for(const path of entry.tests??[])if(!existsSync(resolve(phase,path)))errors.push(`Missing test: ${path}`);
 if(!entry.tests?.length&&!entry.caveat)errors.push(`Untested contract needs caveat: ${entry.id}`);
}
for(const id of required)if(!seen.has(id))errors.push(`Missing required contract: ${id}`);
for(const id of seen)if(!required.includes(id))errors.push(`Unknown contract: ${id}`);
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`State catalog passed: ${required.length} required primitive contracts. This is existence coverage, not skipped-test or runtime coverage proof.`);
