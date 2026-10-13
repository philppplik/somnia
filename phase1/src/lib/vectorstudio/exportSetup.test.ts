import test from 'node:test';
import assert from 'node:assert/strict';
import {vectorShellCommandSpecs} from './shellCommands';
import {createBlankVector,getVectorSession} from './session';
import {getVectorExportRequest} from './exportSetup';
import {pngDimensions} from './exportFiles';
test('setup focuses only, active studio gate prevents stale actions, drawing and dirty state unchanged',()=>{
 createBlankVector(4096,3000);const before=getVectorSession(),request=getVectorExportRequest();
 const spec=vectorShellCommandSpecs(()=>true).find(s=>s.id==='vector.export.open')!;
 assert.equal(spec.enabled?.({origin:'ui'}),true);spec.run(undefined,{origin:'ui'});
 assert.equal(getVectorExportRequest(),request+1);assert.equal(getVectorSession(),before);
 assert.equal(vectorShellCommandSpecs(()=>false).find(s=>s.id===spec.id)?.enabled?.({origin:'ui'}),false);
 assert.deepEqual(pngDimensions(4096,3000,4),{width:8192,height:8192});assert.deepEqual(pngDimensions(400,300,2),{width:800,height:600});
});
