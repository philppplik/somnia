import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const requiredArtifacts=['craft/pkg/somnia_craft.js','craft/pkg/somnia_craft_bg.wasm','documents/pkg/wordcraft_somnia_worker.js','documents/pkg/wordcraft_somnia_worker_bg.wasm','sheets-craft/pkg/somnia_sheets_craft.js','sheets-craft/pkg/somnia_sheets_craft_bg.wasm','photos-engine/pkg/somnia_photos_spike.js','photos-engine/pkg/somnia_photos_spike_bg.wasm','sound/pkg/somnia_sound.js','sound/pkg/somnia_sound_bg.wasm','packages/raster-codec/pkg/somnia_raster_codec.js','packages/raster-codec/pkg/somnia_raster_codec_bg.wasm'];
export function requireArtifacts(root=fileURLToPath(new URL('../../../',import.meta.url))) {
 const missing=requiredArtifacts.filter(p=>!existsSync(`${root}/${p}`));
 if(missing.length)throw Error(`Real engine artifacts missing (no fake engines or automatic cargo build):\n${missing.join('\n')}`);
}
if(process.argv[1]===fileURLToPath(import.meta.url))requireArtifacts();
