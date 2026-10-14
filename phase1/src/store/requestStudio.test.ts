import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestStudio,getState,patchState} from './appStore';
test('manual Studio visit does not claim a source tab Slides cannot open',()=>{
 patchState({files:{'index.html':'<h1>x</h1>'},openFiles:['index.html'],activeFile:'index.html',studioByTab:{},activeStudio:'code',studioChoice:'automatic'});
 requestStudio('slides','manual');
 assert.equal(getState().activeStudio,'slides');
 assert.equal(getState().studioByTab['index.html'],undefined,'source tab stays owned by Code');
 requestStudio('code','manual');
 assert.equal(getState().activeStudio,'code');
});
