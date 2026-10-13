import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Every #[tauri::command] must be listed in build.rs and allowed in capabilities/editor.json, otherwise the call fails at runtime in the desktop app (CI cannot see that).
test('every desktop command is allow-listed in build.rs and the editor capability',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8')+readFileSync('src-tauri/src/deploy_commands.rs','utf8');
 const commands=[...rs.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)].map(m=>m[1]);
 assert.ok(commands.length>5,'command scan found nothing');
 const build=readFileSync('src-tauri/build.rs','utf8');const cap=readFileSync('src-tauri/capabilities/editor.json','utf8');
 const selftestCap=readFileSync('src-tauri/capabilities/ext-selftest.json','utf8');
 for(const c of commands){const perm=`"allow-${c.replaceAll('_','-')}"`;assert.ok(build.includes(`"${c}"`),`${c} missing in build.rs`);
  // CI-only selftest commands live in their own capability and must never be granted by the default editor capability.
  if(c.startsWith('selftest_')){assert.ok(selftestCap.includes(perm),`${c} missing in capabilities/ext-selftest.json`);assert.ok(!cap.includes(perm),`${c} must not be granted by capabilities/editor.json`);}
  else assert.ok(cap.includes(perm),`${c} missing in capabilities/editor.json`);}
});

test('framework commands have manifest, main-window gate, and close cleanup',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8');
 const manifest=JSON.parse(readFileSync('../docs/errors/commands.json','utf8'));
 for(const name of ['runtime_status','runtime_install','runtime_remove','project_run','project_stop','project_status','project_logs','project_stop_all','deploy_artifact_collect','preview_open','preview_close']) {
  assert.ok(rs.includes(name), name);
  assert.ok(JSON.stringify(manifest).includes(name),`${name} missing generated manifest`);
 }
 assert.ok(rs.includes('close_runner.stop_root(&root)'));
 assert.ok(rs.includes('window.state::<crate::proc_runner::ProcessRunner>().stop_all()'));
 assert.ok(rs.includes('project(&mut backend, &project_id)'));
});

test('deploy_artifact_collect is gated, reads only a finished build run and returns no file bytes',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8');const glue=readFileSync('src-tauri/src/deploy_artifact.rs','utf8');
 const body=rs.slice(rs.indexOf('async fn deploy_artifact_collect'),rs.indexOf('async fn deploy_artifact_collect')+500);
 assert.ok(body.includes('gate(&window)'));assert.ok(body.includes('runner.root(&run_id)'));
 assert.ok(glue.includes('buildNotFinished')&&glue.includes('RunKind::Build'));
 assert.ok(!/Vec<u8>/.test(glue));
});

test('native preview has no editor capability, popup or download path',()=>{
 const cap=JSON.parse(readFileSync('src-tauri/capabilities/editor.json','utf8'));
 assert.deepEqual(cap.windows,['main']);assert.equal(cap.local,true);assert.equal(cap.remote,undefined);
 const rs=readFileSync('src-tauri/src/framework_preview.rs','utf8');
 assert.ok(rs.includes('NewWindowResponse::Deny'));assert.ok(rs.includes('.on_download(|_, _| false)'));
 assert.ok(rs.includes('Some("127.0.0.1")'));assert.ok(rs.includes('Some(port)'));
});

// Deploy commands are registered through crate:: paths: the handler list in desktop.rs must carry every one of them.
test('every deploy command is registered in the invoke_handler and listed by the manifest',()=>{
 const rs=readFileSync('src-tauri/src/desktop.rs','utf8');
 const own=readFileSync('src-tauri/src/deploy_commands.rs','utf8');
 const commands=[...own.matchAll(/#\[tauri::command\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g)].map(m=>m[1]);
 assert.equal(commands.length,14);
 for(const c of commands){assert.ok(rs.includes(`crate::deploy_commands::${c},`),`${c} missing in invoke_handler`);assert.ok(own.includes(`pub async fn ${c}(window: tauri::WebviewWindow`),`${c} must gate on the trusted editor window`);}
});
