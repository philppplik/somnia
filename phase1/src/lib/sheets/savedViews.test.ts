import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseSavedViewCommand,parseSavedViews,parseShownView,viewNameProblem} from './savedViews';
test('saved view commands accept only closed shapes',()=>{
 assert.deepEqual(parseSavedViewCommand({kind:'save',name:' Totals '}),{kind:'save',name:'Totals'});
 assert.deepEqual(parseSavedViewCommand({kind:'show',name:'A'}),{kind:'show',name:'A'});
 for(const bad of [null,[],{},{kind:'save'},{kind:'save',name:''},{kind:'save',name:'a\nb'},{kind:'save',name:'x'.repeat(65)},{kind:'rename',name:'x'},{kind:'save',name:'x',extra:1},{kind:'save',name:5}])assert.throws(()=>parseSavedViewCommand(bad),JSON.stringify(bad));
 assert.equal(viewNameProblem('ok'),null);assert.equal(viewNameProblem(' '),'name');
});
test('bridge replies are parsed defensively',()=>{
 assert.deepEqual(parseSavedViews({views:[{name:'A',sheet:1,selection:'B2',zoom:150},{name:'B',sheet:'x'},{name:'',sheet:0},{name:'C',sheet:0,selection:'<x>',zoom:9999},null]}),[{name:'A',sheet:1,selection:'B2',zoom:150},{name:'C',sheet:0,selection:'A1',zoom:100}]);
 assert.deepEqual(parseSavedViews(null),[]);assert.deepEqual(parseShownView({sheet:2,selection:'D13'}),{sheet:2,selection:'D13'});assert.equal(parseShownView({sheet:2,selection:'x'}),null);assert.equal(parseShownView({sheet:-1,selection:'A1'}),null);
});
