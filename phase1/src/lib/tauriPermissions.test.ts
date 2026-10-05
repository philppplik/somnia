import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Every #[tauri::command] must be listed in build.rs and allowed in capabilities/editor.json, otherwise the call fails at runtime in the desktop app (CI cannot see that).
test('every desktop command is allow-listed in build.rs and the editor capability',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8');
 const commands=[...rs.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)].map(m=>m[1]);
 assert.ok(commands.length>5,'command scan found nothing');
 const build=readFileSync('src-tauri/build.rs','utf8');const cap=readFileSync('src-tauri/capabilities/editor.json','utf8');
 for(const c of commands){assert.ok(build.includes(`"${c}"`),`${c} missing in build.rs`);assert.ok(cap.includes(`"allow-${c.replaceAll('_','-')}"`),`${c} missing in capabilities/editor.json`);}
});
