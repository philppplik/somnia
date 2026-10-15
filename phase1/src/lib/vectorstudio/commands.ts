/**
 * Vector session operations exposed to the shared dispatcher. UI callbacks stay unchanged.
 * Immediate writes are ui-only: this session has no reviewed proposal queue. Inspection is
 * read-only and returns detached data. History remains owned by session.ts, never editor-core.
 */
import { registerCommandSpec } from '../commandBridge';
import type { CommandSchema, CommandSpec } from '../commandSpec';
import { BLEND_MODES, ARROW_KINDS, FX_LIMITS } from '../vectorio';
import type { Point, Style, VectorDocument, VectorPath } from '../vectorio';
import * as S from './session';
import {vectorShellCommandSpecs} from './shellCommands';

const object = (properties: Record<string, unknown> = {}, required: string[] = []): CommandSchema =>
  ({ type: 'object', properties, required, additionalProperties: false });
const number = { type: 'number' };
const id = { type: 'string', minLength: 1 };
const text = { type: 'string' };
const size = { type: 'integer', minimum: 1, maximum: 16384 };
const point = object({ x: number, y: number }, ['x', 'y']);
const ids = { type: 'array', items: id, uniqueItems: true, maxItems: 200 };
const nodeKind = { type: 'string', enum: ['corner', 'smooth', 'symmetric'] };
const style = object({
  fill: text, stroke: text, strokeWidth: { type: 'number', minimum: 0 },
  fillOpacity: { type: 'number', minimum: 0, maximum: 1 },
  strokeOpacity: { type: 'number', minimum: 0, maximum: 1 },
  opacity: { type: 'number', minimum: 0, maximum: 1 },
  fillRule: { type: 'string', enum: ['nonzero', 'evenodd'] },
  lineCap: { type: 'string', enum: ['butt', 'round', 'square'] },
  lineJoin: { type: 'string', enum: ['miter', 'round', 'bevel'] },
  miterLimit: { type: 'number', minimum: 1 },
  arrowStart: { type: 'string', enum: [...ARROW_KINDS] }, arrowEnd: { type: 'string', enum: [...ARROW_KINDS] },
  blendMode: { type: 'string', enum: [...BLEND_MODES] },
  blur: { type: 'number', minimum: 0, maximum: FX_LIMITS.blurMax },
  shadowDx: { type: 'number', minimum: -FX_LIMITS.offsetMax, maximum: FX_LIMITS.offsetMax }, shadowDy: { type: 'number', minimum: -FX_LIMITS.offsetMax, maximum: FX_LIMITS.offsetMax },
  shadowBlur: { type: 'number', minimum: 0, maximum: FX_LIMITS.shadowBlurMax }, shadowOpacity: { type: 'number', minimum: 0, maximum: 1 },
  shadowColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  dashArray: { type: 'array', items: { type: 'number', minimum: 0 }, maxItems: 200 }, dashOffset: number,
});
const node = object({ id, x: number, y: number, kind: nodeKind, in: point, out: point }, ['id', 'x', 'y', 'kind']);
const path = object({
  id, closed: { type: 'boolean' }, nodes: { type: 'array', items: node, maxItems: 200 },
  style, layer: text, compound: id, group: id, name: text, hidden: { const: true }, locked: { const: true }, clip: { const: true },
}, ['id', 'closed', 'nodes']);
const stop = object({ offset: { type: 'number', minimum: 0, maximum: 1 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, opacity: { type: 'number', minimum: 0, maximum: 1 } }, ['offset', 'color', 'opacity']);
const gradient = object({
  id: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,39}$' }, kind: { type: 'string', enum: ['linear', 'radial'] },
  x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: { type: 'number', minimum: 0 },
  stops: { type: 'array', items: stop, minItems: 1, maxItems: 16 },
}, ['id', 'kind', 'stops']);
const document = object({ width: size, height: size, paths: { type: 'array', items: path, maxItems: 200 }, groupNames: { type: 'object', additionalProperties: { type: 'string', maxLength: 80 } }, gradients: { type: 'array', items: gradient, maxItems: 64 } }, ['width', 'height', 'paths']);
const empty = object();
const target = (pathId: string, nodeId?: string) => {
  const p = S.getVectorSession().doc.paths.find(p => p.id === pathId);
  if (!p || (nodeId !== undefined && !p.nodes.some(n => n.id === nodeId))) {
    throw Object.assign(new Error('Vector path or node is not in the current document.'), { expected: true });
  }
};
const nodeParams = { pathId: id, nodeId: id };

/** The studio owner supplies live enablement without an upward import to the app store. */
export function vectorCommandSpecs(active: () => boolean): CommandSpec<any, unknown>[] {
  const open = () => active() && S.getVectorSession().open;
  const selection = () => open() && S.getVectorSession().selection.length > 0;
  return [
    { id: 'vector.inspect', title: 'Inspect vector document', category: 'Tools', level: 'read', params: empty,
      run: () => { /* History: none; detached inspection only. */ return structuredClone(S.getVectorSession()); } },
    { id: 'vector.toSvg', title: 'Read vector SVG', category: 'Tools', level: 'read', params: empty,
      enabled: () => S.getVectorSession().open,
      run: () => { /* History: none; serializes without marking saved. */ return S.toSvg(); } },
    { id: 'vector.createBlank', title: 'New vector document', category: 'Project', level: 'ui',
      params: object({ width: size, height: size, name: text }), enabled: active,
      run: (p: { width?: number; height?: number; name?: string } = {}) => {
        /* History: session replacement clears vector past/future only after discard confirmation. */
        return S.createBlankVector(p.width, p.height, p.name);
      } },
    { id: 'vector.openSvg', title: 'Open vector SVG source', category: 'Project', level: 'ui',
      params: object({ source: text, name: text, strict: { type: 'boolean' } }, ['source']), enabled: active,
      run: (p: { source: string; name?: string; strict?: boolean }) => {
        /* History: replacement clears vector past/future after import validation and discard confirmation. */
        return S.openSvgSource(p.source, p.name, { strict: p.strict });
      } },
    { id: 'vector.importSvg', title: 'Add SVG to vector page', category: 'Insert', level: 'ui',
      params: object({ source: text, strict: { type: 'boolean' } }, ['source']), enabled: open,
      run: (p: { source: string; strict?: boolean }) => { /* History: one vector commit on successful import. */ return S.importSvgInto(p.source, { strict: p.strict }); } },
    { id: 'vector.undo', title: 'Undo vector edit', category: 'Edit', level: 'ui', params: empty,
      enabled: () => open() && S.getVectorSession().canUndo,
      run: () => { /* History: moves one vector snapshot from past to future. */ S.undo(); } },
    { id: 'vector.redo', title: 'Redo vector edit', category: 'Edit', level: 'ui', params: empty,
      enabled: () => open() && S.getVectorSession().canRedo,
      run: () => { /* History: moves one vector snapshot from future to past. */ S.redo(); } },
    { id: 'vector.setTool', title: 'Set vector tool', category: 'View', level: 'ui',
      params: object({ tool: { type: 'string', enum: ['select', 'node', 'pen', 'rect', 'ellipse', 'line', 'polygon', 'star'] } }, ['tool']), enabled: open,
      run: (p: { tool: S.VectorTool }) => { /* History: none; tool state only. */ S.setTool(p.tool); } },
    { id: 'vector.select', title: 'Select vector paths', category: 'View', level: 'ui', params: object({ ids }, ['ids']), enabled: open,
      run: (p: { ids: string[] }) => { /* History: none; session filters hidden/missing paths. */ S.select(p.ids); } },
    { id: 'vector.setView', title: 'Set vector view', category: 'View', level: 'ui',
      params: object({ zoom: { type: 'number', minimum: 0.05, maximum: 32 }, pan: point }, ['zoom']), enabled: open,
      run: (p: { zoom: number; pan?: Point }) => { /* History: none; viewport only. */ S.setView(p.zoom, p.pan ? { ...p.pan } : undefined); } },
    { id: 'vector.clearError', title: 'Clear vector diagnostics', category: 'View', level: 'ui', params: empty, enabled: active,
      run: () => { /* History: none; diagnostics only. */ S.clearError(); } },
    { id: 'vector.addPath', title: 'Add vector path', category: 'Insert', level: 'ui',
      params: object({ path, select: { type: 'boolean' } }, ['path']), enabled: open,
      run: (p: { path: VectorPath; select?: boolean }) => { /* History: one vector commit. */ S.addPath(structuredClone(p.path), p.select); } },
    { id: 'vector.deleteSelection', title: 'Delete selected vector paths', category: 'Edit', level: 'ui', params: empty, enabled: selection,
      run: () => { /* History: one vector commit. */ S.deleteSelection(); } },
    { id: 'vector.duplicateSelection', title: 'Duplicate selected vector paths', category: 'Edit', level: 'ui',
      params: object({ offset: number }), enabled: selection,
      run: (p: { offset?: number } = {}) => { /* History: one vector commit with remapped path/node identities. */ S.duplicateSelection(p.offset); } },
    { id: 'vector.moveSelection', title: 'Move selected vector paths', category: 'Edit', level: 'ui',
      params: object({ dx: number, dy: number }, ['dx', 'dy']), enabled: selection,
      run: (p: { dx: number; dy: number }) => { /* History: one vector commit unless delta is zero. */ S.moveSelection(p.dx, p.dy); } },
    { id: 'vector.setStyle', title: 'Set vector path style', category: 'Edit', level: 'ui',
      params: object({ patch: style, ids }, ['patch']), enabled: open,
      run: (p: { patch: Partial<Style>; ids?: string[] }) => { /* History: one vector commit for valid selected paths. */ S.setStyle(structuredClone(p.patch), p.ids); } },
    { id: 'vector.renamePath', title: 'Rename vector path', category: 'Edit', level: 'ui',
      params: object({ id, name: text }, ['id', 'name']), enabled: open,
      run: (p: { id: string; name: string }) => { /* History: one vector commit. */ target(p.id); S.renamePath(p.id, p.name); } },
    { id: 'vector.renameGroup', title: 'Rename vector group', category: 'Edit', level: 'ui',
      params: object({ group: id, name: { type: 'string', maxLength: 80 } }, ['group', 'name']), enabled: open,
      run: (p: { group: string; name: string }) => { /* History: one vector commit; unknown group is refused. */ if (!S.getVectorSession().doc.paths.some(q => q.group === p.group)) throw new Error('Unknown group'); S.renameGroup(p.group, p.name); } },
    { id: 'vector.toggleHidden', title: 'Toggle vector path visibility', category: 'Edit', level: 'ui', params: object({ id }, ['id']), enabled: open,
      run: (p: { id: string }) => { /* History: one vector commit, including compound contours. */ target(p.id); S.toggleHidden(p.id); } },
    { id: 'vector.reorder', title: 'Arrange vector paths', category: 'Edit', level: 'ui',
      params: object({ mode: { type: 'string', enum: ['front', 'back', 'forward', 'backward'] }, ids }, ['mode']), enabled: open,
      run: (p: { mode: 'front' | 'back' | 'forward' | 'backward'; ids?: string[] }) => { /* History: one vector commit only when order changes. */ S.reorder(p.mode, p.ids); } },
    { id: 'vector.setSelectionBounds', title: 'Set vector selection bounds', category: 'Edit', level: 'ui',
      params: { ...object({ x: number, y: number, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 } }), minProperties: 1 }, enabled: selection,
      run: (p: { x?: number; y?: number; w?: number; h?: number }) => { /* History: one vector commit if bounds can be fitted. */ S.setSelectionBounds(p); } },
    { id: 'vector.resizePage', title: 'Resize vector page', category: 'Edit', level: 'ui', params: object({ width: size, height: size }, ['width', 'height']), enabled: open,
      run: (p: { width: number; height: number }) => { /* History: one vector commit. */ S.resizePage(p.width, p.height); } },
    { id: 'vector.moveNode', title: 'Move vector node', category: 'Edit', level: 'ui',
      params: object({ ...nodeParams, to: point, part: { type: 'string', enum: ['anchor', 'in', 'out'] } }, ['pathId', 'nodeId', 'to']), enabled: open,
      run: (p: { pathId: string; nodeId: string; to: Point; part?: 'anchor' | 'in' | 'out' }) => { /* History: one vector commit, handles move together. */ target(p.pathId, p.nodeId); S.moveNode(p.pathId, p.nodeId, { ...p.to }, p.part); } },
    { id: 'vector.deleteNode', title: 'Delete vector node', category: 'Edit', level: 'ui', params: object(nodeParams, ['pathId', 'nodeId']), enabled: open,
      run: (p: { pathId: string; nodeId: string }) => { /* History: one vector commit; short paths are deleted. */ target(p.pathId, p.nodeId); S.deleteNode(p.pathId, p.nodeId); } },
    { id: 'vector.setNodeKind', title: 'Set vector node kind', category: 'Edit', level: 'ui', params: object({ ...nodeParams, kind: nodeKind }, ['pathId', 'nodeId', 'kind']), enabled: open,
      run: (p: { pathId: string; nodeId: string; kind: 'corner' | 'smooth' | 'symmetric' }) => { /* History: one vector commit. */ target(p.pathId, p.nodeId); S.setNodeKind(p.pathId, p.nodeId, p.kind); } },
    { id: 'vector.toggleClosed', title: 'Toggle closed vector path', category: 'Edit', level: 'ui', params: object({ pathId: id }, ['pathId']), enabled: open,
      run: (p: { pathId: string }) => { /* History: one vector commit. */ target(p.pathId); S.toggleClosed(p.pathId); } },
    { id: 'vector.addNodeNear', title: 'Add vector node near point', category: 'Insert', level: 'ui',
      params: object({ pathId: id, point, maxDistance: { type: 'number', minimum: 0 } }, ['pathId', 'point']), enabled: open,
      run: (p: { pathId: string; point: Point; maxDistance?: number }) => { /* History: one vector commit only for a nearby outline hit. */ target(p.pathId); return S.addNodeNear(p.pathId, p.point, p.maxDistance); } },
    { id: 'vector.replaceDocument', title: 'Replace vector document', category: 'Edit', level: 'ui', params: object({ document }, ['document']), enabled: open,
      run: (p: { document: VectorDocument }) => { /* History: one vector commit, not a session/history reset. */ S.replaceDocument(structuredClone(p.document)); } },
    { id: 'vector.selectNode', title: 'Select vector node', category: 'View', level: 'ui', params: object({ id: { type: ['string', 'null'], minLength: 1 } }, ['id']), enabled: open,
      run: (p: { id: string | null }) => { /* History: none; node selection only. */ if (p.id !== null) target(S.getVectorSession().nodePath ?? '', p.id); S.selectNode(p.id); } },
  ];
}

let dispose: (() => void) | undefined;
/** Idempotent install; the studio dynamically loads this module to avoid the commands/studios cycle. */
export function registerVectorCommands(active: () => boolean): () => void {
  if (dispose) return dispose;
  const off: (() => void)[] = [];
  try { for (const spec of [...vectorCommandSpecs(active),...vectorShellCommandSpecs(active)]) off.push(registerCommandSpec(spec)); }
  catch (error) { off.reverse().forEach(fn => fn()); throw error; }
  dispose = () => { off.reverse().forEach(fn => fn()); dispose = undefined; };
  return dispose;
}
