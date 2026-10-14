import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {Field} from './field';
import {NativeInput,NativeSelect,Textarea} from './native-controls';
import {NumberField} from './number-field';
import {RangeField} from './range-field';
import {PanelBody,PanelSection,PropertyList} from './panel';
import {Notice} from './notice';
const render=renderToStaticMarkup;
test('Field wires a stable caller id and messages without replacing hooks',()=>{
 const html=render(<Field label="Width" controlId="width" hint="Units" error="Invalid">{control=><NativeInput {...control} className="legacy-field" data-testid="legacy-id"/>}</Field>);
 for(const part of ['for="width"','id="width"','aria-describedby="width-hint width-error"','aria-invalid="true"','class="legacy-field"','data-testid="legacy-id"','role="alert"'])assert.ok(html.includes(part),part);
});
test('native wrappers retain native states, classes and refs through props',()=>{
 assert.match(render(<NativeInput disabled readOnly aria-invalid className="legacy"/>),/disabled=""/);
 assert.match(render(<NativeSelect multiple defaultValue={['a']}><option value="a">A</option></NativeSelect>),/multiple=""/);
 assert.match(render(<Textarea rows={3} defaultValue="source"/>),/source<\/textarea>/);
});
test('number field leaves mixed empty and never commits in rendering',()=>{
 let commits=0;
 const html=render(<NumberField label="Value" unit="px" value={null} mixed mixedLabel="Mixed" parse={()=>({ok:false,error:'Invalid'})} constraintError="Out of bounds" onCommit={()=>commits++} data-testid="number"/>);
 assert.match(html,/value=""/);assert.match(html,/placeholder="Mixed"/);assert.match(html,/inputMode="decimal"/);assert.equal(commits,0);
});
test('range rendering preserves min/max/step, names and unit readout without starting gesture',()=>{
 let calls=0;const html=render(<RangeField label="Volume" min={0} max={1} step={0.1} value={0.5} readout="50" unit="%" onPreview={()=>calls++} onCommit={()=>calls++} onCancel={()=>calls++}/>);
 assert.match(html,/type="range"/);assert.match(html,/aria-valuetext="50 %"/);assert.match(html,/step="0.1"/);assert.equal(calls,0);
});
test('panel chrome keeps collapse controlled; property values remain selectable content',()=>{
 const html=render(<PanelSection title="Section" id="section-body" open={false} onOpenChange={()=>{}}><PanelBody>COLLAPSED_CONTENT</PanelBody></PanelSection>);
 assert.match(html,/aria-expanded="false"/);assert.ok(!html.includes('COLLAPSED_CONTENT'));
 const props=render(<PropertyList rows={[{id:'one',label:'Size',value:<code>10 px</code>}]}/>);assert.match(props,/<dt>Size<\/dt>/);assert.match(props,/<code>10 px<\/code>/);
});
test('Notice is silent by default; only callers opt in to urgency',()=>{
 assert.ok(!render(<Notice tone="danger">Error</Notice>).includes('role='));
 assert.match(render(<Notice live="polite">Saved</Notice>),/role="status"/);
 assert.match(render(<Notice live="assertive">Error</Notice>),/role="alert"/);
});
