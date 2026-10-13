// Bundles sidecar/engine.ts into sidecar/engine.mjs (one self-contained file; node >= 20). Output is git-ignored.
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, 'engine.ts')], outfile: path.join(here, 'engine.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node20',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.log('built', path.join(here, 'engine.mjs'));
