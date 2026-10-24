import type {PreviewAssetLoader} from './previewAssets';
/** The live preview reads binary project files through one injected loader.
 * The project resource resolver (read_project_resource) registers itself here; until then nothing binary loads and the preview behaves as before. */
let loader:PreviewAssetLoader|null=null;
export const setPreviewAssetLoader=(next:PreviewAssetLoader|null)=>{loader=next;};
export const getPreviewAssetLoader=():PreviewAssetLoader|null=>loader;
