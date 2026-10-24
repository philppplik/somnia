import test from 'node:test';import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {InterfaceShortcutsDialog} from './InterfaceShortcutsDialog';
import {setLocale} from '../../lib/i18n';
test('shortcuts dialog renders localized rows with platform combos',()=>{const html=renderToStaticMarkup(<InterfaceShortcutsDialog onClose={()=>{}}/>);
 assert.ok(html.includes('role="dialog"'));assert.ok(html.includes('aria-modal="true"'));assert.ok(html.includes('Keyboard shortcuts'));assert.ok(html.includes('Move selection'));assert.ok(html.includes('Ctrl+Z'));assert.ok(html.includes('Ctrl+Shift+Z'));assert.ok(html.includes('<kbd'));assert.ok(html.includes('Close'));
 setLocale('de');try{const german=renderToStaticMarkup(<InterfaceShortcutsDialog onClose={()=>{}}/>);assert.ok(german.includes('Tastaturkürzel'));assert.ok(german.includes('Auswahl bewegen'));assert.ok(german.includes('Rückgängig'));assert.ok(german.includes('Schließen'));}finally{setLocale('en');}});
