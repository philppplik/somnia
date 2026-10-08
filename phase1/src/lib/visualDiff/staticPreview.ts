import {parse, serialize} from 'parse5';
import type {DefaultTreeAdapterMap} from 'parse5';
import {MAX_FILES, MAX_PREVIEW_BYTES, safePath} from './model';
import type {VisualSnapshot} from './model';

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
const tags = new Set('html head body title style main section article header footer nav aside div span p h1 h2 h3 h4 h5 h6 ul ol li dl dt dd table thead tbody tfoot tr td th caption colgroup col br hr pre code blockquote strong em b i u s small sub sup figure figcaption a img input button select option textarea label fieldset legend details summary'.split(' '));
const attrs = new Set('class id style title lang dir role aria-label aria-hidden width height colspan rowspan alt type value checked selected disabled placeholder open'.split(' '));
const CSP = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
export interface StaticPreview {html: string; warnings: string[]; available: boolean}
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const shell = (body: string) => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta charset="utf-8"></head><body>${body}</body></html>`;
const byteLength = (s: string) => new TextEncoder().encode(s).length;
const hasFile = (files: VisualSnapshot['files'], path: string) => Object.hasOwn(files, path);
function resolve(path: string, href: string): string | undefined {
  if (!href || /[?#]|^[\/\\]|^[a-z][a-z\d+.-]*:/i.test(href)) return;
  const parts = path.split('/').slice(0, -1);
  for (const p of href.split('/')) {
    if (p === '..') {if (!parts.length) return; parts.pop();}
    else if (p && p !== '.') parts.push(p);
  }
  const result = parts.join('/');
  return safePath(result) ? result : undefined;
}
/** CSP is the enforcement boundary for CSS URLs/imports (including escaped CSS).
 * No project script is injected, and the consumer MUST keep sandbox="" on the iframe.
 * Only HTML and CSS text are supported. Never loads any resources or writes snapshots.
 */
export function staticPreview(snapshot: VisualSnapshot, path: string): StaticPreview {
  const warnings = new Set<string>();
  const unavailable = (reason: string): StaticPreview => ({html: shell(`<p>${escape(reason)}</p>`), warnings: [reason], available: false});
  if (!safePath(path)) return unavailable('Invalid project-relative path.');
  if (!hasFile(snapshot.files, path)) return unavailable('File is missing in this version.');
  if (!/\.html?$/i.test(path)) return unavailable('Visual preview supports HTML files only. Use Only changes for other text files.');
  const source = snapshot.files[path];
  if (snapshot.incomplete) return unavailable('Incomplete snapshot. Visual preview is unavailable until full contents are loaded.');
  if (Object.keys(snapshot.files).length > MAX_FILES || byteLength(source) > MAX_PREVIEW_BYTES) return unavailable('Preview size limit reached.');
  let totalBytes = byteLength(source);
  const doc = parse(source);
  function clean(parent: Node) {
    if (!('childNodes' in parent)) return;
    const kept: DefaultTreeAdapterMap['childNode'][] = [];
    for (const child of parent.childNodes) {
      if (!('tagName' in child)) {if (child.nodeName !== '#comment' && child.nodeName !== '#documentType') kept.push(child); continue;}
      const el = child as Element;
      if (el.tagName === 'link') {
        const rel = el.attrs.find(a => a.name === 'rel')?.value;
        const href = el.attrs.find(a => a.name === 'href')?.value ?? '';
        const cssPath = rel?.toLowerCase() === 'stylesheet' ? resolve(path, href) : undefined;
        if (cssPath && /\.css$/i.test(cssPath) && hasFile(snapshot.files, cssPath)) {
          const css = snapshot.files[cssPath];
          totalBytes += byteLength(css);
          if (totalBytes <= MAX_PREVIEW_BYTES) {
            // parse5 serializes raw style text; escape the closing delimiter.
            el.tagName = 'style'; el.nodeName = 'style'; el.attrs = [];
            el.childNodes = [{nodeName: '#text', value: css.replaceAll('<', '\\3c '), parentNode: el}];
            warnings.add('Local CSS is inlined. CSS imports, URLs and fonts are blocked.');
            kept.push(el);
          } else warnings.add('Incomplete preview: local CSS exceeds the size limit.');
        } else warnings.add('Incomplete preview: a linked resource is unavailable or blocked.');
        continue;
      }
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !tags.has(el.tagName)) {
        warnings.add('Active or unsupported markup was omitted.'); continue;
      }
      el.attrs = el.attrs.filter(a => !a.namespace && attrs.has(a.name));
      if (['a', 'input', 'button', 'select', 'textarea', 'summary'].includes(el.tagName)) {
        el.attrs.push({name: 'tabindex', value: '-1'});
        if (el.tagName !== 'a' && el.tagName !== 'summary') el.attrs.push({name: 'disabled', value: ''});
      }
      if (el.tagName === 'img') warnings.add('Incomplete preview: images are omitted.');
      clean(el); kept.push(el);
    }
    parent.childNodes = kept;
  }
  clean(doc);
  const html = serialize(doc);
  // Insert policy before all author CSS. The whole document is inside an opaque sandbox.
  return {html: '<!doctype html>' + html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta charset="utf-8"><style>*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}</style>`), warnings: [...warnings], available: true};
}
