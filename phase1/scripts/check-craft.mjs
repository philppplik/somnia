import {existsSync} from 'node:fs';
for(const file of ['craft/pkg/somnia_craft.js','craft/pkg/somnia_craft_bg.wasm'])if(!existsSync(file)){console.error('Build the isolated PhotoCraft bridge first: cd craft && ./build.sh ('+file+' is missing). See craft/README.md.');process.exit(1);}
