// Imported in a fresh process by bench.ts. Process wall time is measured by the parent.
import assert from 'node:assert/strict';
import {EditorProject} from '../../packages/editor-core/src/index';
const project = new EditorProject({'index.html': '<!doctype html><html><head><title>Bench</title></head><body><p>Ready</p></body></html>'});
assert.equal(project.tree('index.html')[0].tag, 'html');
