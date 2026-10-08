import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync, unzipSync, strFromU8, strToU8} from 'fflate';
import {sniffOffice, isZip} from './zipProbe';
import {readXlsx, writeXlsx, sheetToCsv} from './xlsx';
import {docxToView, sanitizeDocxHtml, docxSrcdoc} from './docx';
import {markdownToDocx} from '../convert/docConvert';

test('sniffOffice decides by package parts and rejects other ZIPs', async () => {
  const docx = await markdownToDocx('# Hi');
  assert.equal(sniffOffice(docx), 'docx');
  assert.equal(sniffOffice(writeXlsx([{name: 'A', rows: [['x']]}])), 'xlsx');
  const pptx = zipSync({'[Content_Types].xml': strToU8('<x/>'), 'ppt/presentation.xml': strToU8('<x/>')});
  assert.equal(sniffOffice(pptx), 'pptx');
  assert.equal(sniffOffice(zipSync({'a.txt': strToU8('hi')})), null);
  assert.equal(sniffOffice(strToU8('not a zip')), null);
  assert.equal(isZip(strToU8('PK')), false);
});
test('xlsx write then read round-trips values, unicode, XML characters and sheet names', () => {
  const rows = [['Name', 'Qty', 'OK'], ['Äpfel & <Birnen>', 3.5, true], ['=1+1', -2, null], ['', 'ü"q', 'line\nbreak']];
  const out = writeXlsx([{name: 'Daten: 1/2', rows}, {name: 'Daten: 1/2', rows: [[1]]}]);
  const {sheets, warnings} = readXlsx(out);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].name, 'Daten  1 2');
  assert.notEqual(sheets[1].name, sheets[0].name);
  assert.deepEqual(sheets[0].rows[1], ['Äpfel & <Birnen>', 3.5, true]);
  assert.equal(sheets[0].rows[2][0], '=1+1');
  assert.equal(sheets[0].rows[3][2], 'line\nbreak');
  assert.ok(warnings[0].startsWith('Values only'));
});
test('written formulas-looking strings are stored as text, never as formulas', () => {
  const out = writeXlsx([{name: 'S', rows: [['=HYPERLINK("http://x","y")']]}]);
  const xml = strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml']);
  assert.ok(!xml.includes('<f>'));
});
test('reads shared strings, inline strings and sparse cells', () => {
  const ct = '<Types/>';
  const z = zipSync({
    '[Content_Types].xml': strToU8(ct),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S1" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Hallo</t></si><si><r><t>Rich</t></r><r><t> text</t></r></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="2"><c r="B2" t="s"><v>1</v></c><c r="D2"><v>7</v></c></row><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>'),
  });
  const {sheets} = readXlsx(z);
  assert.deepEqual(sheets[0].rows[0], ['Hallo']);
  assert.deepEqual(sheets[0].rows[1], [null, 'Rich text', null, 7]);
});
test('xlsx row limit truncates and warns', () => {
  const rows = Array.from({length: 5100}, (_, i) => [i]);
  const {sheets, warnings} = readXlsx(writeXlsx([{name: 'Big', rows}]));
  assert.equal(sheets[0].rows.length, 5000);
  assert.ok(sheets[0].truncated && warnings.some(w => w.includes('cut to')));
});
test('corrupt or non-office input is rejected with a readable error', () => {
  assert.throws(() => readXlsx(strToU8('PK\x03\x04garbage')), /Not a valid XLSX/);
  assert.throws(() => readXlsx(zipSync({'a.txt': strToU8('x')})), /Not a valid XLSX/);
});
test('csv quotes commas, quotes and newlines', () => {
  assert.equal(sheetToCsv([['a,b', 'c"d', 'e\nf', null, 1]]), '"a,b","c""d","e\nf",,1\r\n');
});
test('docx view renders semantic HTML and warns about the read-only scope', async () => {
  const md = '# Titel\n\nText mit **fett** und Umlaut ä.\n\n- eins\n- zwei\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const view = await docxToView(await markdownToDocx(md));
  assert.match(view.html, /<h1>Titel<\/h1>/);
  assert.match(view.html, /<strong>fett<\/strong>/);
  assert.match(view.html, /<li>eins<\/li>/);
  assert.match(view.html, /<table>.*<p>1<\/p>/);
  assert.match(view.warnings[0], /Read-only view/);
});
test('docx view rejects non-docx and sanitizer removes active content', async () => {
  await assert.rejects(docxToView(writeXlsx([{name: 'A', rows: [[1]]}])), /Not a valid DOCX/);
  const dirty = '<p onclick="x()">a</p><script>alert(1)</script><a href="javascript:alert(1)">l</a><a href="#ok">k</a><img src="https://evil/x.png"><img src="data:image/png;base64,AAA="><iframe src="x"></iframe>';
  const clean = sanitizeDocxHtml(dirty);
  assert.ok(!/script|onclick|javascript|evil|iframe/i.test(clean), clean);
  assert.ok(clean.includes('href="#ok"') && clean.includes('data:image/png'));
  assert.match(docxSrcdoc(clean), /Content-Security-Policy/);
});
