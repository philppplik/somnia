#!/usr/bin/env node
// Explicit packaging build, never run by application startup. No models bundled.
import {spawnSync} from 'node:child_process';import {mkdirSync,readFileSync,copyFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
// Packaging must first audit the actual target's transitive/static/dynamic libraries.
// This is an explicit release review, not proof derived from an upstream MIT label.
const auditPath=process.env.SOMNIA_VOICE_LICENSE_AUDIT;
if(!auditPath)throw Error('Set SOMNIA_VOICE_LICENSE_AUDIT to a reviewed per-target dependency-license inventory; nothing is built/downloaded without it');
const audit=JSON.parse(readFileSync(resolve(auditPath),'utf8'));
const targetOS={win32:'windows',darwin:'macos',linux:'linux'}[process.platform],targetArch={x64:'x86_64',arm64:'aarch64'}[process.arch];
const approved=new Set(['MIT','BSD-2-Clause','BSD-3-Clause','Apache-2.0','ISC','Zlib','BSL-1.0','CC0-1.0']);
if(audit.schemaVersion!==1||audit.reviewed!==true||audit.targetOS!==targetOS||audit.targetArch!==targetArch||audit.engineRevision!=='a8d002cfd879315632a579e73f0148d06959de36'||!Array.isArray(audit.components)||!audit.components.length||audit.components.some(c=>!c.name||!approved.has(c.license)||typeof c.notice!=='string'||!c.notice.trim()))throw Error('Unreviewed, incompatible or non-allowlisted voice dependency license');
const notices=audit.components.map(c=>c.name+' ('+c.license+')\n'+c.notice).join('\n\n');
const revision='a8d002cfd879315632a579e73f0148d06959de36',phase=resolve(import.meta.dirname,'../..'),source=resolve(phase,'.voice-build/source'),build=resolve(phase,'.voice-build/build'),output=resolve(phase,'src-tauri/resources/voice');
const run=(command,args,cwd)=>{const r=spawnSync(command,args,{cwd,stdio:'inherit'});if(r.status!==0)throw Error(command+' failed');};
mkdirSync(resolve(phase,'.voice-build'),{recursive:true});if(!existsSync(source))run('git',['clone','--no-checkout','https://github.com/ggml-org/whisper.cpp.git',source]);run('git',['fetch','origin',revision],source);run('git',['checkout','--detach',revision],source);
const license=readFileSync(resolve(source,'LICENSE'),'utf8');if(!license.includes('MIT License'))throw Error('Engine license differs');
run('cmake',['-S',source,'-B',build,'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DGGML_CUDA=OFF','-DGGML_METAL=OFF','-DGGML_VULKAN=OFF','-DGGML_BLAS=OFF','-DGGML_ACCELERATE=OFF','-DGGML_OPENMP=OFF','-DGGML_NATIVE=OFF','-DWHISPER_FFMPEG=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_BUILD_EXAMPLES=ON']);run('cmake',['--build',build,'--config','Release','--target','whisper-cli','-j','2']);
const exe=process.platform==='win32'?'whisper-cli.exe':'whisper-cli';let binary=resolve(build,'bin',exe);if(!existsSync(binary))binary=resolve(build,'bin/Release',exe);run(binary,['--help']);const bytes=readFileSync(binary);rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});copyFileSync(binary,resolve(output,exe));writeFileSync(resolve(output,'LICENSE.whisper.cpp'),license);writeFileSync(resolve(output,'THIRD-PARTY-NOTICES.txt'),notices);writeFileSync(resolve(output,'manifest.json'),JSON.stringify({schema_version:2,dependencies_reviewed:true,notices_sha256:createHash('sha256').update(notices).digest('hex'),engine_revision:revision,sha256:createHash('sha256').update(bytes).digest('hex'),target_os:{win32:'windows',darwin:'macos',linux:'linux'}[process.platform],target_arch:{x64:'x86_64',arm64:'aarch64'}[process.arch],license:'MIT'},null,2));
console.log('Built pinned CPU-only helper. Review linked-library/SBOM and device gates before release. No weights downloaded.');
