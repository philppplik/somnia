import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Every #[tauri::command] must be listed in build.rs and allowed in capabilities/editor.json, otherwise the call fails at runtime in the desktop app (CI cannot see that).
test('every desktop command is allow-listed in build.rs and the editor capability',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8');
 const commands=[...rs.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)].map(m=>m[1]);
 assert.ok(commands.length>5,'command scan found nothing');
 const build=readFileSync('src-tauri/build.rs','utf8');const cap=readFileSync('src-tauri/capabilities/editor.json','utf8');
 const selftestCap=readFileSync('src-tauri/capabilities/ext-selftest.json','utf8');
 for(const c of commands){const perm=`"allow-${c.replaceAll('_','-')}"`;assert.ok(build.includes(`"${c}"`),`${c} missing in build.rs`);
  // CI-only selftest commands live in their own capability and must never be granted by the default editor capability.
  if(c.startsWith('selftest_')){assert.ok(selftestCap.includes(perm),`${c} missing in capabilities/ext-selftest.json`);assert.ok(!cap.includes(perm),`${c} must not be granted by capabilities/editor.json`);}
  else assert.ok(cap.includes(perm),`${c} missing in capabilities/editor.json`);}
});
