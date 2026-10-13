/** Vite-only asset collection. Load lazily when creating a project, never during adapter registration. */
const bundled=import.meta.glob('./templates/*-*/**/*',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
// Vite glob omits dotfiles unless requested explicitly.
const hidden=import.meta.glob(['./templates/*-*/.gitignore'],{query:'?raw',import:'default',eager:true}) as Record<string,string>;
// Framework tsconfig files extend packages that only exist after install ($app/tsconfig, astro/tsconfigs, .nuxt/*).
// Vite resolves a tsconfig for every TS file it sees, so those are stored under a neutral name and restored here.
const restore=(files:Record<string,string>)=>Object.fromEntries(Object.entries(files).map(([p,t])=>[p.endsWith('/tsconfig.json.somnia-tpl')?p.slice(0,-'.somnia-tpl'.length):p,t]));
export const templateFiles:Readonly<Record<string,string>>=restore({...bundled,...hidden});
