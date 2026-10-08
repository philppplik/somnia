import type {ReactNode} from 'react';
/** Shared, spatially stable main-container shell. App owns the sidebar grid slots. */
export interface EditorShellProps{tabs:ReactNode;toolbar:ReactNode;canvas:ReactNode;footer:ReactNode;kind:'raster'|'vector'|'document'}
export function EditorShell({tabs,toolbar,canvas,footer,kind}:EditorShellProps){return <main className="center editor-shell" data-editor-kind={kind} aria-label="Editor workspace"><div className="editor-shell-tabs">{tabs}</div><div className="editor-shell-options" role="toolbar" aria-label="Image options">{toolbar}</div><div className="editor-shell-canvas">{canvas}</div><footer className="editor-shell-footer">{footer}</footer></main>;}
