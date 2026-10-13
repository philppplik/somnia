import test from 'node:test';
import assert from 'node:assert/strict';
import {cellHasContent,formulaTargetProblem} from './formulaTarget';

test('an empty target is never guessed: the user must choose a cell',()=>{
 assert.equal(formulaTargetProblem('A1:A10',''),'empty');
 assert.equal(formulaTargetProblem('A1:A10','   '),'empty');
});
test('invalid addresses are rejected',()=>{
 assert.equal(formulaTargetProblem('A1:A10','nope'),'invalid');
 assert.equal(formulaTargetProblem('A1:A10','B0'),'invalid');
 assert.equal(formulaTargetProblem('A1:A10','1B'),'invalid');
});
test('a target inside the source range is circular, case-insensitively',()=>{
 assert.equal(formulaTargetProblem('A1:A10','A5'),'circular');
 assert.equal(formulaTargetProblem('B2:C9','c3'),'circular');
});
test('a target outside the source range passes',()=>{
 assert.equal(formulaTargetProblem('A1:A10','B3'),null);
 assert.equal(formulaTargetProblem('A1:A10','A11'),null);
 assert.equal(formulaTargetProblem('B2:C9','b1'),null);
});
test('an invalid or oversized source reports no target problem (the source field owns that error)',()=>{
 assert.equal(formulaTargetProblem('nope','B3'),null);
 assert.equal(formulaTargetProblem('A1:P100000','B3'),null);
});
test('cellHasContent: formulas and values count, empty cells do not',()=>{
 assert.equal(cellHasContent(undefined),false);
 assert.equal(cellHasContent({value:{t:'Empty'}}),false);
 assert.equal(cellHasContent({value:{t:'Empty'},formula:'SUM(A1:A2)'}),true);
 assert.equal(cellHasContent({value:{t:'Number',v:0}}),true);
 assert.equal(cellHasContent({value:{t:'Text',v:''}}),true);
});
