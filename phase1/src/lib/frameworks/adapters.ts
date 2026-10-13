/**
 * Framework adapters: read-only classification of an existing project folder into a build and run plan.
 *
 * Pure data in, plain data out. Nothing here spawns a process, touches the disk or reads a secret value.
 * A plan is a proposal. Install, build and start stay `execute` level commands that the user confirms.
 * Messages are catalogue codes (`frameworks.plan.*`), never free text from the project.
 */
import type {DetectedFramework} from './detect';

export type AdapterId='static-html'|'vite-spa'|'astro-static'|'astro-node'|'next-export'|'next-standalone'|'sveltekit-static'|'sveltekit-node'|'nuxt-generate'|'nuxt-node'|'node-server';
export type ProjectFamily='html'|DetectedFramework|'preact'|'vanilla'|'node';
export type PlanLanguage='ts'|'js';
export type ProjectFiles=Readonly<Record<string,string>>;

export interface StartPlan{
 /** Fixed argument vector, no shell. First item is always `node`. */
 argv:readonly string[];
 /** Directory the process starts in, relative to the project root. */
 cwd:string;
 /** Variables Somnia sets itself. A project variable of the same name is ignored. */
 env:Readonly<Record<string,string>>;
 /** Variables the framework needs from the deploy domain (filled by the deploy step, never by the project). */
 derivedEnv:readonly string[];
 nodeRange:string|null;
 healthPath:string;
}
export interface PostBuildCopy{from:string;to:string}
export interface ProjectPlan{
 adapter:AdapterId;
 family:ProjectFamily;
 language:PlanLanguage;
 /** True when `somnia.template.json` matches the detected framework, so the scripts are Somnia's own. */
 managed:boolean;
 output:'static'|'node';
 install:{needed:boolean;argv:readonly string[];lockfile:string|null;ignoreScripts:true};
 build:{needed:boolean;argv:readonly string[];env:Readonly<Record<string,string>>;
  /** False when the build script is not one of the known framework commands. The UI must ask once more. */
  scriptReviewed:boolean};
 dev:{available:boolean;argv:readonly string[];/** Appended after the script, with the loopback port filled in. */portArgs:(port:number)=>readonly string[]};
 artifact:{path:string;/** Static output: file that must exist. */index:string|null;/** Node output: file that must exist. */entry:string|null;
  spaFallback:boolean;copies:readonly PostBuildCopy[]};
 start:StartPlan|null;
 env:{publicPrefix:string|null;declared:readonly string[];clientExposed:readonly string[]};
 blockers:readonly string[];
 warnings:readonly string[];
}

const PREFIX='frameworks.plan.';
const code=(name:string)=>PREFIX+name;
const MAX_JSON=256*1024;
const MAX_CONFIG=128*1024;
const SECRET_WORD=/(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|ACCESS_?KEY)/i;
const ENV_NAME=/^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

interface Pkg{name?:string;main?:string;type?:string;scripts:Record<string,string>;deps:Record<string,string>;engines:string|null}
function readPkg(raw:string|undefined):Pkg|null{
 if(!raw||raw.length>MAX_JSON)return null;
 try{
  const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))return null;
  const strMap=(x:unknown)=>{const out:Record<string,string>={};if(x&&typeof x==='object')for(const [k,val] of Object.entries(x as Record<string,unknown>))if(typeof val==='string')out[k]=val;return out;};
  const engines=(v.engines&&typeof v.engines==='object'&&typeof v.engines.node==='string')?String(v.engines.node).slice(0,64):null;
  return {name:typeof v.name==='string'?v.name:undefined,main:typeof v.main==='string'?v.main:undefined,type:typeof v.type==='string'?v.type:undefined,
   scripts:strMap(v.scripts),deps:{...strMap(v.dependencies),...strMap(v.devDependencies)},engines};
 }catch{return null;}
}
const pick=(files:ProjectFiles,re:RegExp)=>{const hit=Object.keys(files).find(p=>re.test(p));return hit?(files[hit]??'').slice(0,MAX_CONFIG):'';};

/** Relative, forward slash, no traversal, no drive letters, no shell metacharacters. */
export function safeRelativePath(p:string):boolean{
 return typeof p==='string'&&p.length>0&&p.length<=200&&!/^[\\/]|^[A-Za-z]:|\.\.|[\\\0]|\/\/|[\s;&|<>$`"'*?()]/.test(p)&&!p.endsWith('/');
}
/** Output directory out of a config text. Only a plain string literal is trusted. */
function outDirOf(config:string,key:RegExp,fallback:string):{dir:string;unsafe:boolean}{
 const m=key.exec(config);if(!m)return {dir:fallback,unsafe:false};
 const dir=m[1].replace(/^\.\//,'').replace(/\/$/,'');
 return safeRelativePath(dir)?{dir,unsafe:false}:{dir:fallback,unsafe:true};
}

/** Build scripts that only run the framework's own build. Anything else is a custom script. */
const CANONICAL_BUILD=[
 /^(tsc( -b)?( --noEmit)? && )?vite build$/,
 /^vue-tsc( -b)?( --noEmit)? && vite build$/,
 /^svelte-kit sync && vite build$/,
 /^(astro check && )?astro build$/,
 /^next build( --turbo(pack)?)?$/,
 /^nuxt (build|generate)$/,
 /^(vite|svelte-kit|nuxt|astro|next) build$/,
 /^tsc( -p [\w./-]+)?$/
];
export const isCanonicalBuildScript=(script:string|undefined):boolean=>typeof script==='string'&&CANONICAL_BUILD.some(re=>re.test(script.trim()));

/** Simple `node file.js [--flag]` only. A shell pipeline, `&&`, env prefix or package runner is not accepted. */
export function parseNodeStart(script:string|undefined):string[]|null{
 if(typeof script!=='string')return null;
 const parts=script.trim().split(/ +/);
 if(parts[0]!=='node'||parts.length<2||parts.length>8)return null;
 const rest=parts.slice(1);
 if(rest.some(a=>/^--(env-file|require|import|loader|eval|inspect|experimental-loader)/.test(a)||a==='-e'||a==='-r'||a==='-p'))return null;
 const file=rest.find(a=>!a.startsWith('-'));
 if(!file||!safeRelativePath(file)||!/\.(c|m)?js$/.test(file))return null;
 if(rest.some(a=>!/^[\w./=:@-]+$/.test(a)))return null;
 return ['node',...rest];
}

const PUBLIC_PREFIX:Partial<Record<ProjectFamily,string>>={react:'VITE_',vue:'VITE_',svelte:'VITE_',solid:'VITE_',preact:'VITE_',vanilla:'VITE_',next:'NEXT_PUBLIC_',astro:'PUBLIC_',sveltekit:'PUBLIC_',nuxt:'NUXT_PUBLIC_'};

/** Names (never values) out of an example env file. */
export function declaredEnvNames(files:ProjectFiles):string[]{
 const raw=files['.env.example']??files['.env.sample']??files['.env.template']??'';
 const names=new Set<string>();
 for(const line of raw.slice(0,MAX_CONFIG).split(/\r?\n/)){
  const m=/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
  if(m&&ENV_NAME.test(m[1]))names.add(m[1]);
  if(names.size>=200)break;
 }
 return [...names];
}

const NODE_ENV_BASE={NODE_ENV:'production',HOST:'127.0.0.1'} as const;
const VITE_PORT=(p:number)=>['--host','127.0.0.1','--port',String(p),'--strictPort'] as const;

function viteFamily(deps:Record<string,string>):ProjectFamily{
 const has=(n:string)=>n in deps;
 return has('react')?'react':has('vue')?'vue':has('svelte')?'svelte':has('solid-js')?'solid':has('preact')?'preact':'vanilla';
}
const NODE_SERVER_DEPS=['express','fastify','koa','hono','@hono/node-server','@nestjs/core','restify','polka','@hapi/hapi'];

/**
 * Classify a project. Returns null when the folder is none of the supported shapes (open as plain code).
 * `files` maps relative paths to text. Contents are only needed for package.json, framework configs,
 * the example env file, `somnia.template.json` and the server entry; other files may map to ''.
 */
export function planProject(files:ProjectFiles):ProjectPlan|null{
 const names=Object.keys(files);
 const pkg=readPkg(files['package.json']);
 const lockfile=names.find(p=>p==='package-lock.json')??null;
 const language:PlanLanguage=names.some(p=>/\.(ts|tsx|mts|cts)$/.test(p)&&!p.endsWith('.d.ts')&&!p.startsWith('node_modules/'))?'ts':'js';
 const blockers:string[]=[];const warnings:string[]=[];
 const hasIndex=names.includes('index.html');
 const has=(n:string)=>!!pkg&&n in pkg.deps;
 if(!pkg){
  if(!hasIndex)return null;
  return finish({adapter:'static-html',family:'html',language,managed:false,output:'static',needsInstall:false,needsBuild:false,buildArgv:[],canonical:true,
   artifact:{path:'.',index:'index.html',entry:null,spaFallback:false,copies:[]},start:null,dev:null,blockers,warnings,files,lockfile:null,pkg:null});
 }
 let manifest:Record<string,unknown>={};
 try{manifest=JSON.parse((files['somnia.template.json']??'{}').slice(0,MAX_JSON));}catch{/* unknown projects are inert */}
 const buildScript=pkg.scripts.build;
 const canonical=isCanonicalBuildScript(buildScript);
 const npmBuild=['npm','run','build'] as const;

 // Meta-frameworks first: they also depend on react, vue or svelte.
 if(has('next'))return next();
 if(has('astro'))return astro();
 if(has('@sveltejs/kit'))return sveltekit();
 if(has('nuxt'))return nuxt();
 if(has('vite')&&!NODE_SERVER_DEPS.some(has)){
  const family=viteFamily(pkg.deps);
  const cfg=pick(files,/^vite\.config\.(m?[jt]s|cjs)$/);
  const out=outDirOf(cfg,/outDir\s*:\s*['"]([^'"]+)['"]/,'dist');
  if(out.unsafe)blockers.push(code('unsafeOutDir'));
  if(/\bbase\s*:\s*['"](?!\/['"])[^'"]+['"]/.test(cfg))warnings.push(code('viteBase'));
  if(/\bssr\s*:\s*(true|\{)/.test(cfg)||/build\s*:\s*\{[^}]*\bssr\b/.test(cfg))blockers.push(code('viteSsr'));
  return finish({adapter:'vite-spa',family,language,managed:manifest.framework===family&&typeof manifest.id==='string',output:'static',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:out.dir,index:`${out.dir}/index.html`,entry:null,spaFallback:true,copies:[]},start:null,
   dev:{available:typeof pkg.scripts.dev==='string',argv:['npm','run','dev','--'],portArgs:VITE_PORT},blockers,warnings,files,lockfile,pkg});
 }
 const isServer=NODE_SERVER_DEPS.some(has)||(typeof pkg.scripts.start==='string'&&!has('vite'))||(!!pkg.main&&!hasIndex);
 if(isServer)return nodeServer();
 if(hasIndex)return finish({adapter:'static-html',family:'html',language,managed:false,output:'static',needsInstall:false,needsBuild:false,buildArgv:[],canonical:true,
  artifact:{path:'.',index:'index.html',entry:null,spaFallback:false,copies:[]},start:null,dev:null,blockers,warnings:[...warnings,code('packageIgnored')],files,lockfile:null,pkg});
 return null;

 function next():ProjectPlan{
  const cfg=pick(files,/^next\.config\.(m?js|cjs|ts)$/);
  const mode=/output\s*:\s*['"]export['"]/.test(cfg)?'export':/output\s*:\s*['"]standalone['"]/.test(cfg)?'standalone':'none';
  if(/images\s*:\s*\{[^}]*loader\s*:/.test(cfg)===false&&mode==='export'&&!/unoptimized\s*:\s*true/.test(cfg))warnings.push(code('nextImageOptimizer'));
  if(mode==='export'){
   if(/\b(rewrites|redirects|headers)\s*\(/.test(cfg))warnings.push(code('nextExportNoRouting'));
   const out=outDirOf(cfg,/distDir\s*:\s*['"]([^'"]+)['"]/,'out');
   return finish({adapter:'next-export',family:'next',language,managed:manifestMatches('next'),output:'static',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
    artifact:{path:'out',index:'out/index.html',entry:null,spaFallback:false,copies:[]},start:null,dev:nextDev(),blockers:out.unsafe?[...blockers,code('unsafeOutDir')]:blockers,warnings,files,lockfile,pkg});
  }
  if(mode==='none')blockers.push(code('nextNeedsOutput'));
  if(/distDir\s*:/.test(cfg))warnings.push(code('nextDistDir'));
  return finish({adapter:'next-standalone',family:'next',language,managed:manifestMatches('next'),output:'node',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:'.next/standalone',index:null,entry:'.next/standalone/server.js',spaFallback:false,
    copies:[{from:'.next/static',to:'.next/standalone/.next/static'},{from:'public',to:'.next/standalone/public'}]},
   start:{argv:['node','server.js'],cwd:'.next/standalone',env:{...NODE_ENV_BASE,HOSTNAME:'127.0.0.1'},derivedEnv:['PORT'],nodeRange:pkg!.engines,healthPath:'/'},
   dev:nextDev(),blockers,warnings,files,lockfile,pkg});
 }
 function nextDev(){return {available:typeof pkg!.scripts.dev==='string',argv:['npm','run','dev','--'] as readonly string[],portArgs:(p:number)=>['-H','127.0.0.1','-p',String(p)] as readonly string[]};}

 function astro():ProjectPlan{
  const cfg=pick(files,/^astro\.config\.(m?[jt]s|cjs)$/);
  const nodeAdapter=has('@astrojs/node');
  const otherAdapter=['@astrojs/vercel','@astrojs/netlify','@astrojs/cloudflare','@astrojs/deno'].some(has);
  const serverMode=/output\s*:\s*['"]server['"]/.test(cfg)||nodeAdapter;
  const dev={available:typeof pkg!.scripts.dev==='string',argv:['npm','run','dev','--'] as readonly string[],portArgs:(p:number)=>['--host','127.0.0.1','--port',String(p)] as readonly string[]};
  if(!serverMode){
   if(otherAdapter)blockers.push(code('adapterNotNode'));
   const out=outDirOf(cfg,/outDir\s*:\s*['"]([^'"]+)['"]/,'dist');
   if(out.unsafe)blockers.push(code('unsafeOutDir'));
   return finish({adapter:'astro-static',family:'astro',language,managed:manifestMatches('astro'),output:'static',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
    artifact:{path:out.dir,index:`${out.dir}/index.html`,entry:null,spaFallback:false,copies:[]},start:null,dev,blockers,warnings,files,lockfile,pkg});
  }
  if(!nodeAdapter)blockers.push(code(otherAdapter?'adapterNotNode':'astroNoAdapter'));
  if(/mode\s*:\s*['"]middleware['"]/.test(cfg))blockers.push(code('astroMiddlewareMode'));
  const out=outDirOf(cfg,/outDir\s*:\s*['"]([^'"]+)['"]/,'dist');
  if(out.unsafe)blockers.push(code('unsafeOutDir'));
  return finish({adapter:'astro-node',family:'astro',language,managed:manifestMatches('astro'),output:'node',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:out.dir,index:null,entry:`${out.dir}/server/entry.mjs`,spaFallback:false,copies:[]},
   start:{argv:['node',`${out.dir}/server/entry.mjs`],cwd:'.',env:{...NODE_ENV_BASE},derivedEnv:['PORT'],nodeRange:pkg!.engines,healthPath:'/'},dev,blockers,warnings,files,lockfile,pkg});
 }

 function sveltekit():ProjectPlan{
  const cfg=pick(files,/^svelte\.config\.(m?js|ts)$/);
  const staticAdapter=has('@sveltejs/adapter-static');const nodeAdapter=has('@sveltejs/adapter-node');
  const auto=has('@sveltejs/adapter-auto')&&!staticAdapter&&!nodeAdapter;
  const dev={available:typeof pkg!.scripts.dev==='string',argv:['npm','run','dev','--'] as readonly string[],portArgs:VITE_PORT as (p:number)=>readonly string[]};
  if(auto||(!staticAdapter&&!nodeAdapter))blockers.push(code('svelteAdapterAuto'));
  const useStatic=staticAdapter&&!nodeAdapter;
  const out=outDirOf(cfg,/(?:pages|out)\s*:\s*['"]([^'"]+)['"]/,'build');
  if(out.unsafe)blockers.push(code('unsafeOutDir'));
  if(useStatic){
   if(!/fallback\s*:/.test(cfg)&&!/prerender\s*=\s*true/.test(pick(files,/^src\/routes\/\+layout\.(js|ts)$/)))warnings.push(code('svelteStaticPrerender'));
   return finish({adapter:'sveltekit-static',family:'sveltekit',language,managed:manifestMatches('sveltekit'),output:'static',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
    artifact:{path:out.dir,index:`${out.dir}/index.html`,entry:null,spaFallback:/fallback\s*:/.test(cfg),copies:[]},start:null,dev,blockers,warnings,files,lockfile,pkg});
  }
  return finish({adapter:'sveltekit-node',family:'sveltekit',language,managed:manifestMatches('sveltekit'),output:'node',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:'build',index:null,entry:'build/index.js',spaFallback:false,copies:[]},
   start:{argv:['node','build/index.js'],cwd:'.',env:{...NODE_ENV_BASE},derivedEnv:['PORT','ORIGIN'],nodeRange:pkg!.engines,healthPath:'/'},dev,blockers,warnings,files,lockfile,pkg});
 }

 function nuxt():ProjectPlan{
  const cfg=pick(files,/^nuxt\.config\.(m?[jt]s)$/);
  const generate=/\bnuxt generate\b/.test(buildScript??'')||/preset\s*:\s*['"]static['"]/.test(cfg)||/\bssr\s*:\s*false/.test(cfg);
  const dev={available:typeof pkg!.scripts.dev==='string',argv:['npm','run','dev','--'] as readonly string[],portArgs:(p:number)=>['--host','127.0.0.1','--port',String(p)] as readonly string[]};
  if(generate)return finish({adapter:'nuxt-generate',family:'nuxt',language,managed:manifestMatches('nuxt'),output:'static',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:'.output/public',index:'.output/public/index.html',entry:null,spaFallback:/\bssr\s*:\s*false/.test(cfg),copies:[]},start:null,dev,blockers,warnings,files,lockfile,pkg});
  const preset=/preset\s*:\s*['"]([\w-]+)['"]/.exec(cfg)?.[1];
  if(preset&&preset!=='node-server'&&preset!=='node')blockers.push(code('nuxtPreset'));
  return finish({adapter:'nuxt-node',family:'nuxt',language,managed:manifestMatches('nuxt'),output:'node',needsInstall:true,needsBuild:true,buildArgv:npmBuild,canonical,
   artifact:{path:'.output',index:null,entry:'.output/server/index.mjs',spaFallback:false,copies:[]},
   start:{argv:['node','.output/server/index.mjs'],cwd:'.',env:{...NODE_ENV_BASE,NITRO_HOST:'127.0.0.1'},derivedEnv:['PORT'],nodeRange:pkg!.engines,healthPath:'/'},dev,blockers,warnings,files,lockfile,pkg});
 }

 function nodeServer():ProjectPlan{
  const fromScript=parseNodeStart(pkg!.scripts.start);
  let argv=fromScript;
  if(!argv&&pkg!.main&&safeRelativePath(pkg!.main)&&/\.(c|m)?js$/.test(pkg!.main))argv=['node',pkg!.main];
  if(!argv){blockers.push(code(pkg!.scripts.start?'startNotPlain':'noStart'));}
  const entry=argv?argv.slice(1).find(a=>!a.startsWith('-'))??null:null;
  if(!lockfile)blockers.push(code('lockMissing'));
  const entrySource=entry?(files[entry]??''):'';
  if(entrySource&&/\.listen\(\s*\d{2,5}\b/.test(entrySource)&&!/process\.env\.PORT/.test(entrySource))warnings.push(code('hardcodedPort'));
  if(entrySource&&/\.listen\([^)]*['"]0\.0\.0\.0['"]/.test(entrySource))warnings.push(code('listensOnAllInterfaces'));
  const hasBuild=typeof pkg!.scripts.build==='string';
  const tsEntry=entry!==null&&/^(src|server|app)\//.test(entry)&&language==='ts';
  if(tsEntry)warnings.push(code('entryIsSource'));
  return finish({adapter:'node-server',family:'node',language,managed:false,output:'node',needsInstall:true,needsBuild:hasBuild,buildArgv:hasBuild?npmBuild:[],canonical:hasBuild?canonical:true,
   artifact:{path:'.',index:null,entry,spaFallback:false,copies:[]},
   start:argv?{argv,cwd:'.',env:{...NODE_ENV_BASE},derivedEnv:['PORT'],nodeRange:pkg!.engines,healthPath:'/'}:null,
   dev:{available:false,argv:[],portArgs:()=>[]},blockers,warnings,files,lockfile,pkg});
 }
 function manifestMatches(fw:string){return manifest.framework===fw&&typeof manifest.id==='string';}
}

interface Draft{
 adapter:AdapterId;family:ProjectFamily;language:PlanLanguage;managed:boolean;output:'static'|'node';needsInstall:boolean;needsBuild:boolean;buildArgv:readonly string[];canonical:boolean;
 artifact:ProjectPlan['artifact'];start:StartPlan|null;dev:ProjectPlan['dev']|null;blockers:string[];warnings:string[];files:ProjectFiles;lockfile:string|null;pkg:Pkg|null;
}
function finish(d:Draft):ProjectPlan{
 const prefix=PUBLIC_PREFIX[d.family]??null;
 const declared=declaredEnvNames(d.files);
 const clientExposed=prefix?declared.filter(n=>n.startsWith(prefix)):[];
 const warnings=[...d.warnings];const blockers=[...d.blockers];
 if(clientExposed.some(n=>SECRET_WORD.test(n.slice(prefix!.length))))warnings.push(code('secretInPublicEnv'));
 if(d.needsInstall&&d.pkg&&!d.lockfile&&!blockers.includes(code('lockMissing')))warnings.push(code('noLockfile'));
 if(d.needsBuild&&!d.canonical)warnings.push(code('customBuildScript'));
 if(d.needsBuild&&d.pkg&&typeof d.pkg.scripts.build!=='string')blockers.push(code('noBuildScript'));
 if(d.output==='node'&&d.start&&d.start.nodeRange===null)warnings.push(code('noNodeRange'));
 const empty=['npm','run','dev','--'] as readonly string[];
 return {
  adapter:d.adapter,family:d.family,language:d.language,managed:d.managed,output:d.output,
  install:{needed:d.needsInstall,argv:d.needsInstall?(d.lockfile?['npm','ci','--ignore-scripts']:['npm','install','--ignore-scripts']):[],lockfile:d.lockfile,ignoreScripts:true},
  build:{needed:d.needsBuild,argv:d.buildArgv,env:buildBaseEnv(d.family),scriptReviewed:d.managed||d.canonical},
  dev:d.dev??{available:false,argv:empty,portArgs:()=>[]},
  artifact:d.artifact,start:d.start,
  env:{publicPrefix:prefix,declared,clientExposed},
  blockers,warnings
 };
}
const buildBaseEnv=(family:ProjectFamily):Record<string,string>=>({NODE_ENV:'production',CI:'1',...(family==='next'?{NEXT_TELEMETRY_DISABLED:'1'}:{}),...(family==='nuxt'?{NUXT_TELEMETRY_DISABLED:'1'}:{}),...(family==='astro'?{ASTRO_TELEMETRY_DISABLED:'1'}:{})});

// ---------------------------------------------------------------- environment handling

/** Names Somnia owns. A project value for any of these is dropped. */
const RESERVED_ENV=/^(PATH|HOME|USERPROFILE|NODE_ENV|NODE_OPTIONS|NODE_PATH|NODE_EXTRA_CA_CERTS|PORT|HOST|HOSTNAME|NITRO_PORT|NITRO_HOST|ORIGIN|CI|LD_PRELOAD|LD_LIBRARY_PATH|DYLD_.*|SOMNIA_.*|SSH_.*|NPM_CONFIG_.*|npm_config_.*|(HTTPS?|ALL|NO)_PROXY|(https?|all|no)_proxy|GIT_.*|GITHUB_.*|GH_.*|AWS_.*|APPDATA|LOCALAPPDATA|TEMP|TMP)$/;
export interface EnvSplit{accepted:Readonly<Record<string,string>>;rejected:readonly {name:string;reason:'invalidName'|'reserved'|'notPublic'|'tooLong'}[]}

/**
 * Variables for the build step. Only names with the framework's public prefix are accepted because the
 * bundler writes them into the output anyway. Server secrets never enter a build. Values are not logged.
 */
export function buildEnvFor(plan:ProjectPlan,vars:Readonly<Record<string,string>>):{env:Readonly<Record<string,string>>;rejected:EnvSplit['rejected']}{
 const out:Record<string,string>={...plan.build.env};const rejected:{name:string;reason:EnvSplit['rejected'][number]['reason']}[]=[];
 for(const [name,value] of Object.entries(vars)){
  if(!ENV_NAME.test(name)){rejected.push({name:name.slice(0,64),reason:'invalidName'});continue;}
  if(RESERVED_ENV.test(name)){rejected.push({name,reason:'reserved'});continue;}
  if(!plan.env.publicPrefix||!name.startsWith(plan.env.publicPrefix)){rejected.push({name,reason:'notPublic'});continue;}
  if(typeof value!=='string'||value.length>4096){rejected.push({name,reason:'tooLong'});continue;}
  out[name]=value;
 }
 return {env:out,rejected};
}
/**
 * Variables for the running server on the host. Any valid, non-reserved name is allowed here because they
 * come from the user's keychain item for this project. Somnia's own values always win.
 */
export function runtimeEnvFor(plan:ProjectPlan,vars:Readonly<Record<string,string>>,derived:Readonly<Record<string,string>>):{env:Readonly<Record<string,string>>;missing:readonly string[];rejected:EnvSplit['rejected']}{
 if(!plan.start)return {env:{},missing:[],rejected:[]};
 const env:Record<string,string>={};const rejected:{name:string;reason:EnvSplit['rejected'][number]['reason']}[]=[];
 for(const [name,value] of Object.entries(vars)){
  if(!ENV_NAME.test(name)){rejected.push({name:name.slice(0,64),reason:'invalidName'});continue;}
  if(RESERVED_ENV.test(name)){rejected.push({name,reason:'reserved'});continue;}
  if(typeof value!=='string'||value.length>4096){rejected.push({name,reason:'tooLong'});continue;}
  env[name]=value;
 }
 Object.assign(env,plan.start.env);
 const missing:string[]=[];
 for(const name of plan.start.derivedEnv){const v=derived[name];if(typeof v==='string'&&v.length>0)env[name]=v;else missing.push(name);}
 return {env,missing,rejected};
}

/** Files that never go into an upload, whatever the build output contains. */
export function isUploadExcluded(path:string):boolean{
 const parts=path.split('/');const base=parts[parts.length-1];
 if(parts.some(p=>p==='.git'||p==='.svn'||p==='.hg'||p==='.ssh'||p==='.somnia'))return true;
 if(/^\.env(\..+)?$/.test(base)&&!/^\.env\.(example|sample|template)$/.test(base))return true;
 if(/^(id_(rsa|ed25519|ecdsa|dsa)|.*\.(pem|key|p12|pfx|ppk)|\.npmrc|\.netrc|\.htpasswd)$/i.test(base))return true;
 if(base==='somnia.template.json'||base==='.DS_Store'||base==='Thumbs.db')return true;
 return false;
}

export interface ArtifactCheck{ok:boolean;errors:readonly string[];warnings:readonly string[];files:readonly string[]}
/**
 * Check a build output listing (project relative paths) against the plan. The list is pre filtered:
 * excluded files are removed from `files` and reported as a warning so the dialog can show them.
 */
export function verifyArtifactListing(plan:ProjectPlan,listing:readonly string[]):ArtifactCheck{
 const errors:string[]=[];const warnings:string[]=[];
 const root=plan.artifact.path==='.'?'':plan.artifact.path+'/';
 const inside=listing.filter(p=>safeRelativePath(p)&&(root===''||p.startsWith(root))&&!p.startsWith('node_modules/'));
 const bad=listing.filter(p=>!safeRelativePath(p));
 if(bad.length)errors.push(code('unsafePath'));
 const kept=inside.filter(p=>!isUploadExcluded(p));
 if(kept.length<inside.length)warnings.push(code('excludedFiles'));
 const set=new Set(kept);
 if(plan.artifact.index&&!set.has(plan.artifact.index))errors.push(code(kept.length?'noIndex':'distMissing'));
 if(plan.artifact.entry&&!set.has(plan.artifact.entry))errors.push(code(kept.length?'noEntry':'distMissing'));
 for(const c of plan.artifact.copies){
  if(!set.has(c.to)&&!kept.some(p=>p.startsWith(c.to+'/'))&&listing.some(p=>p.startsWith(c.from+'/')||p===c.from))warnings.push(code('copyPending'));
 }
 if(plan.output==='node'&&plan.start&&!listing.includes('package.json')&&plan.adapter==='node-server')errors.push(code('noPackage'));
 if(kept.some(p=>/\.map$/.test(p)))warnings.push(code('sourceMaps'));
 if(plan.output==='static'&&kept.some(p=>/(^|\/)(server|api)\//.test(p)&&/\.(c|m)?js$/.test(p)))warnings.push(code('serverCodeInStatic'));
 return {ok:errors.length===0,errors,warnings:[...new Set(warnings)],files:kept};
}

/** True when the plan has no blockers. A warning never blocks, a blocker always does. */
export const planIsRunnable=(plan:ProjectPlan)=>plan.blockers.length===0;
