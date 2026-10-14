import {AdjustPanel} from '../../src/components/imageedit/AdjustPanel';
import {FilterPanel} from '../../src/components/imageedit/FilterPanel';
import {ImageHistory} from '../../src/components/imageedit/ImageHistory';
import {DEFAULT_ADJUST_PARAMS} from '../../src/lib/imageedit/adjust';
import {newFilterOperation} from '../../src/lib/imageedit/filters';

const NOOP=()=>{};
const blur={id:'op1',type:'blur',enabled:true};
const past=[{stack:[],adjust:null,filter:null}];
const now={stack:[blur],adjust:null,filter:blur};
const future=[{stack:[blur,{id:'op2',type:'sharpen',enabled:true}],adjust:null,filter:blur}];

/** Real migrated imageedit panels with plain props: adjustments, filter strength and the history timeline. */
export function ImageeditProof(){
 return <main data-testid="imageedit-proof"><h1>Imageedit DS adoption</h1><p>Actual imageedit panels (adjustments, filter presets, history); every control renders through native control primitives.</p>
  <h2>Adjustments</h2><AdjustPanel params={{...DEFAULT_ADJUST_PARAMS,exposure:0.4,saturation:0.2}} onChange={NOOP}/>
  <h2>Filter preset</h2><FilterPanel operation={newFilterOperation('blur','blur',{strength:0.42})} onChange={NOOP}/>
  <h2>History</h2><ImageHistory past={past} now={now} future={future} onJump={NOOP} onToggle={NOOP} onRemove={NOOP}/></main>;
}
