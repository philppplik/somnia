import {TransformPanel} from '../../src/components/imgedit/TransformPanel';
import {SelectionEditor} from '../../src/components/imgedit/SelectionEditor';
import {createImage} from '../../src/lib/image/buffer';
import {rectSelection} from '../../src/lib/imgedit/select';
import {initialCropRect} from '../../src/lib/imgedit/handlers';

const NOOP=()=>{};
const raster=createImage(64,48);
const selection=rectSelection(64,48,{x:8,y:6},{x:40,y:30});

/** Real migrated imgedit panels with plain props: crop/straighten transform controls and the selection editor. */
export function ImgeditProof(){
 return <main data-testid="imgedit-proof"><h1>Imgedit DS adoption</h1><p>Actual imgedit panels (crop/straighten/transform, selection); every control renders through native control primitives.</p>
  <h2>Crop and transform</h2><TransformPanel width={64} height={48} cropRect={initialCropRect(64,48,'16:9')} aspect="16:9" onAspectChange={NOOP} onCropRectChange={NOOP} onCommit={NOOP}/>
  <h2>Selection</h2><SelectionEditor image={null} raster={raster} selection={selection} onSelectionChange={NOOP} onCommit={NOOP}/></main>;
}
