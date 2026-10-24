import {useEffect} from 'react';
import {patchState} from '../../src/store/appStore';
import {patchUi} from '../../src/lib/svgedit/store';
import {SvgOptionsBar} from '../../src/components/svgedit/SvgOptionsBar';
import {SvgSidebar} from '../../src/components/svgedit/SvgSidebar';
import {SvgInspector} from '../../src/components/svgedit/SvgInspector';

/** Real migrated svgedit panels over a fixture document in the app stores. */
export function SvgeditProof(){
 useEffect(()=>{
  patchState({activeFile:'proof.svg',designFile:'proof.svg',files:{'proof.svg':'<svg width="100" height="100"><rect width="20" height="20" fill="#123456" stroke="#654321"/></svg>'},viewMode:'design'});
  patchUi({selection:['1'],inspectorTab:'design'});
 },[]);
 return <main data-testid="svgedit-proof"><h1>Svgedit DS adoption</h1><p>Actual options bar, sidebar and inspector (with embedded snap panel) on a fixture document; every control renders through native control primitives.</p>
  <SvgOptionsBar/>
  <SvgSidebar/>
  <SvgInspector/></main>;
}
