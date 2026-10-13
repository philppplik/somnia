import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AgentBoard} from './AgentBoard';
import {createBoardFixture} from '../../lib/agentBoard/fixtures';
test('board renders all states with checkpoint separate from approved version',()=>{const f=createBoardFixture(),s=renderToStaticMarkup(<AgentBoard port={f.port} onCombine={f.combine}/>);for(const str of ['Queue','Running','Review','Done','Failed','Approved version','Local auto-commit enabled','Verification failed'])assert.match(s,new RegExp(str));assert.doesNotMatch(s,/secret transcript/);});
test('stale approved card visibly revokes combine',()=>{const f=createBoardFixture();f.stale('task-done');const s=renderToStaticMarkup(<AgentBoard port={f.port} onCombine={f.combine}/>);assert.match(s,/Evidence is out of date/);assert.doesNotMatch(s,/Approved version/);});
