// Builds somnia-extension.json from panel.html (readable source). Run: node build.mjs
import {readFileSync, writeFileSync} from 'node:fs';
const here = new URL('.', import.meta.url);
const html = readFileSync(new URL('panel.html', here), 'utf8').trim();
const manifest = {
  id: 'somnia.accessibility-audit',
  name: 'Accessibility Audit',
  version: '1.0.0',
  apiVersion: 1,
  permissions: ['project.read'],
  contributes: {panels: [{id: 'audit', title: 'Accessibility Audit', side: 'right', html}]}
};
writeFileSync(new URL('somnia-extension.json', here), JSON.stringify(manifest, null, 2) + '\n');
console.log('panel html chars:', html.length);
