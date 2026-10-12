/**
 * Hand-maintained catalog of Dreamweaver-relevant capabilities (engine-hardening plan, step 7.2).
 *
 * Each feature names what must exist in Somnia for it to count as present:
 *   commands  - UI command ids that must be in docs/ui-commands.json (the generated registry inventory)
 *   runtime   - command ids registered at runtime (fileAdapter, collab) and so not in the inventory;
 *               checked against the source file that registers them
 *   studios   - studio ids that must be registered in src/lib/studios
 *   evidence  - repo-relative paths (from the repo root) that must exist, for features that are
 *               panels or editor behaviour rather than commands
 * `status` is a ceiling for features the registry cannot fully prove ("partial"), and the only
 * source for features with no requirements at all ("missing" for things Somnia does not do).
 * Status is computed by model.ts. Do not write statuses into docs/dreamweaver-parity.md by hand.
 */
export type Status = 'have' | 'partial' | 'missing';

export interface Feature {
  id: string;
  area: string;
  name: string;
  /** What Dreamweaver offers, in a few words. */
  dreamweaver: string;
  commands?: readonly string[];
  runtime?: readonly { id: string; source: string }[];
  studios?: readonly string[];
  evidence?: readonly string[];
  status?: Status;
  note?: string;
}

export const FEATURES: readonly Feature[] = [
  // Views
  { id: 'views.code-design', area: 'Views', name: 'Code, Design and Split views', dreamweaver: 'Switch between code, visual design and both at once', commands: ['view.code', 'view.design', 'view.split', 'view.toggleCodeDesign'] },
  { id: 'views.split-layout', area: 'Views', name: 'Split left/right and top/bottom', dreamweaver: 'View > Split with a draggable divider', commands: ['split.horizontal', 'split.vertical', 'split.swap'], evidence: ['phase1/src/components/ResizeHandle.tsx'] },
  { id: 'views.live', area: 'Views', name: 'Live preview', dreamweaver: 'Live View of the page', commands: ['view.livePreview'], evidence: ['phase1/src/components/LivePreview.tsx'], note: 'Scripts are stripped in the preview, so script-driven pages show their end state.' },
  { id: 'views.responsive', area: 'Views', name: 'Responsive viewport sizes', dreamweaver: 'Device presets and custom viewport width', evidence: ['phase1/src/components/ViewportControls.tsx', 'phase1/src/components/ResponsivePanel.tsx'] },
  { id: 'views.panels', area: 'Views', name: 'Hide and show all panels', dreamweaver: 'F4 toggles every panel', commands: ['panels.hideAll', 'sidebar.toggle', 'inspector.toggle'] },
  { id: 'views.zoom', area: 'Views', name: 'Zoom', dreamweaver: 'Zoom in, out, reset on the design surface', commands: ['zoom.in', 'zoom.out', 'zoom.reset'] },
  // Editing
  { id: 'edit.undo', area: 'Editing', name: 'Undo and redo', dreamweaver: 'Multi-step undo across code and design', commands: ['edit.undo', 'edit.redo'] },
  { id: 'edit.duplicate-delete', area: 'Editing', name: 'Duplicate and delete element', dreamweaver: 'Ctrl+D style duplicate, delete in the DOM', commands: ['edit.duplicate', 'edit.delete'] },
  { id: 'edit.wrap', area: 'Editing', name: 'Wrap and unwrap tag', dreamweaver: 'Wrap tag, Remove tag', commands: ['edit.wrap', 'edit.unwrap'] },
  { id: 'edit.entities', area: 'Editing', name: 'Encode and decode special characters', dreamweaver: 'Convert characters to and from entities', commands: ['edit.encodeEntities', 'edit.decodeEntities'] },
  { id: 'edit.format', area: 'Editing', name: 'Apply source formatting', dreamweaver: 'Apply Source Formatting', commands: ['edit.format'], evidence: ['phase1/src/lib/format.ts'] },
  { id: 'edit.insert', area: 'Editing', name: 'Insert elements', dreamweaver: 'Insert panel with many element types', commands: ['insert.element.0', 'insert.element.1', 'insert.element.2', 'insert.element.3', 'insert.element.4', 'insert.element.5', 'insert.element.6', 'insert.element.7', 'insert.element.8', 'insert.element.9'], status: 'partial', note: 'Ten built-in inserts plus the Components panel; no full Insert panel catalog.' },
  { id: 'edit.tables', area: 'Editing', name: 'Table editing', dreamweaver: 'Insert tables, merge cells, add and remove rows and columns', commands: ['table.insert', 'table.merge', 'table.header', 'table.row.above', 'table.row.below', 'table.row.delete', 'table.col.left', 'table.col.right', 'table.col.delete'] },
  { id: 'edit.find', area: 'Editing', name: 'Find in project', dreamweaver: 'Find and Replace across a site', commands: ['search.project'], evidence: ['phase1/src/components/SearchPanel.tsx'], status: 'partial', note: 'Project search exists; replace and scope options are not tracked here.' },
  { id: 'edit.autocomplete', area: 'Editing', name: 'Code editor with hints', dreamweaver: 'Code hints and syntax coloring', evidence: ['phase1/src/components/SourceEditor.tsx'], status: 'partial', note: 'CodeMirror 6 with autocomplete and code themes; tag-specific hint depth is not tracked here.' },
  // Inspection
  { id: 'inspect.dom', area: 'Inspection', name: 'DOM breadcrumbs', dreamweaver: 'Tag selector in the status bar', evidence: ['phase1/src/components/Breadcrumbs.tsx'] },
  { id: 'inspect.properties', area: 'Inspection', name: 'Inspector with sizes and box model', dreamweaver: 'Properties panel, box model', evidence: ['phase1/src/components/Inspector.tsx', 'phase1/src/components/ElementMetrics.tsx'] },
  { id: 'inspect.layers', area: 'Inspection', name: 'Layers / DOM tree', dreamweaver: 'DOM panel', evidence: ['phase1/src/components/LayersPanel.tsx'] },
  { id: 'inspect.css', area: 'Inspection', name: 'CSS panel', dreamweaver: 'CSS Designer', commands: ['css.open'], evidence: ['phase1/src/components/CssPanel.tsx'], status: 'partial', note: 'Panel exists; not tracked as full CSS Designer parity.' },
  { id: 'inspect.problems', area: 'Inspection', name: 'Problems and validation', dreamweaver: 'Linting, validation, accessibility checks', commands: ['problems.toggle'], evidence: ['phase1/src/components/ProblemsPanel.tsx'] },
  // Project and files
  { id: 'files.panel', area: 'Project', name: 'Files panel', dreamweaver: 'Site files panel with create, rename, delete', evidence: ['phase1/src/components/FilesPanel.tsx'] },
  { id: 'files.project', area: 'Project', name: 'Open, save and export', dreamweaver: 'Open, Save All, export site', commands: ['project.open', 'project.openFile', 'project.save', 'project.saveAll', 'project.closeAll', 'project.export'] },
  { id: 'files.tabs', area: 'Project', name: 'Document tabs', dreamweaver: 'Tabbed documents', commands: ['tab.next', 'tab.prev', 'tab.close'], evidence: ['phase1/src/components/FileTabs.tsx'] },
  { id: 'files.compare', area: 'Project', name: 'Compare with disk and diff', dreamweaver: 'Compare files', commands: ['tools.diff'], runtime: [{ id: 'project.compare', source: 'phase1/src/lib/fileAdapter.ts' }], evidence: ['phase1/src/components/DiffSplit.tsx'] },
  { id: 'files.recovery', area: 'Project', name: 'Crash recovery', dreamweaver: 'Recover unsaved changes', runtime: [{ id: 'recovery.restore', source: 'phase1/src/lib/fileAdapter.ts' }, { id: 'recovery.discard', source: 'phase1/src/lib/fileAdapter.ts' }] },
  { id: 'files.ftp', area: 'Project', name: 'FTP and remote site sync', dreamweaver: 'Put and get files on a remote server', status: 'missing', note: 'Not built. Dreamweaver users cite it as a reason they stay.' },
  { id: 'files.templates', area: 'Project', name: 'Dreamweaver templates and library items', dreamweaver: '.dwt templates, library items, nested templates', evidence: ['phase1/src/components/ComponentsPanel.tsx'], status: 'partial', note: 'Components panel and saved custom blocks cover reuse; .dwt/.lbi files are not supported.' },
  { id: 'files.version', area: 'Project', name: 'Version control', dreamweaver: 'Git panel', commands: ['tools.diff'], evidence: ['phase1/src/components/versions/ChangesTab.tsx', 'phase1/src/components/versions/ConflictResolver.tsx'] },
  // Beyond web pages
  { id: 'beyond.markdown', area: 'Formats', name: 'Markdown and LaTeX preview', dreamweaver: 'Not a Dreamweaver strength', commands: ['md.h1', 'md.bold', 'md.table', 'md.sync'], evidence: ['phase1/src/components/MarkdownPreview.tsx'] },
  { id: 'beyond.images', area: 'Formats', name: 'Image editing and conversion', dreamweaver: 'Photoshop round trip', commands: ['tools.editImage', 'tools.convert'] },
  { id: 'beyond.studios', area: 'Formats', name: 'Other studios', dreamweaver: 'Not in Dreamweaver', studios: ['design', 'vector', 'photos', 'documents', 'sheets', 'slides', 'sound', 'video', 'vibespace'] },
  // Extensibility and collaboration
  { id: 'ext.extensions', area: 'Extensibility', name: 'Extensions', dreamweaver: 'Extension Manager', commands: ['extensions.open'], evidence: ['phase1/src/components/ExtensionCatalog.tsx'] },
  { id: 'ext.collab', area: 'Extensibility', name: 'Live collaboration', dreamweaver: 'Not offered', commands: ['collab.share', 'collab.join'] },
  { id: 'ext.agent', area: 'Extensibility', name: 'AI agent panel', dreamweaver: 'Generative tools', commands: ['agent.toggle'] },
  { id: 'ext.palette', area: 'Extensibility', name: 'Command palette and shortcuts', dreamweaver: 'Keyboard shortcut editor', commands: ['palette.open', 'help.shortcuts'] },
];
