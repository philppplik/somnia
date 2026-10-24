import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChromeMenu} from './ui/menu';
import {Menu as Primitive} from '@base-ui/react/menu';
import {NativeInput,NativeSelect} from './ui/native-controls';
test('shared legacy menu facade preserves all primitive part identity',()=>{for(const key of ['Root','Trigger','Portal','Positioner','Popup','Item','CheckboxItem','RadioGroup','RadioItem','SubmenuRoot','SubmenuTrigger','Separator'] as const)assert.equal(ChromeMenu[key],Primitive[key]);});
test('save/router native wrappers preserve disabled/value/class contracts without new geometry',()=>{const checkbox=renderToStaticMarkup(<NativeInput type="checkbox" aria-label="New subfolder" checked disabled onChange={()=>{}}/>);assert.match(checkbox,/type="checkbox"/);assert.match(checkbox,/checked/);assert.match(checkbox,/disabled/);assert.ok(!checkbox.includes('class='));const select=renderToStaticMarkup(<NativeSelect aria-label="Studio" className="rounded-lg border border-subtle bg-panel p-2 text-ink" value="code" onChange={()=>{}}><option value="code">Code</option></NativeSelect>);assert.match(select,/selected/);assert.match(select,/rounded-lg border border-subtle bg-panel p-2 text-ink/);});
