import test from 'node:test';import assert from 'node:assert/strict';import {sanitizeWorkflowPrefs,DEFAULT_WORKFLOW_PREFS,escapeTitle} from './workflowPrefs';
test('workflow prefs sanitize startup title and recovery limits',()=>{assert.deepEqual(sanitizeWorkflowPrefs({}),DEFAULT_WORKFLOW_PREFS);const p=sanitizeWorkflowPrefs({startup:'invalid',documentTitle:'',draftSeconds:1000,draftAutosave:false});assert.equal(p.startup,'last');assert.equal(p.documentTitle,'Untitled');assert.equal(p.draftSeconds,300);assert.equal(p.draftAutosave,false);});
test('document titles cannot introduce HTML markup',()=>assert.equal(escapeTitle('<script> & "'), '&lt;script&gt; &amp; &quot;'));
import {starterFor} from './fileOps';
test('HTML and HTM starter lookup both return a document',()=>{assert.ok(starterFor('index.html').includes('<title>'));assert.equal(starterFor('index.htm'),starterFor('index.html'));});
test('image save mode defaults to overwrite and only accepts copy as the alternative',()=>{
 assert.equal(sanitizeWorkflowPrefs({}).imageSaveMode,'overwrite');assert.equal(sanitizeWorkflowPrefs({imageSaveMode:'copy'}).imageSaveMode,'copy');assert.equal(sanitizeWorkflowPrefs({imageSaveMode:'bogus'}).imageSaveMode,'overwrite');
});

test('units pref defaults to auto and rejects junk', () => {
  assert.equal(sanitizeWorkflowPrefs({}).units, 'auto');
  assert.equal(sanitizeWorkflowPrefs({ units: 'imperial' }).units, 'imperial');
  assert.equal(sanitizeWorkflowPrefs({ units: 'furlong' }).units, 'auto');
});
