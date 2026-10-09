/**
 * Design Studio panel contract (tools, layers, inspector).
 *
 * The panels in `components/design/` are PURE: they render the read-only views below and report intent
 * through the callbacks below. They never import the document model, the store or the canvas.
 * `design-studio-core` adapts its model to these shapes (one small adapter file) and applies the callbacks
 * as undoable operations. Coordinates are document units; angles are degrees; opacity is 0..1.
 */
/** `frame` = artboard. Core v1 creates frames, rects and text; the panels render any type listed here. */
export type DesignNodeType = 'frame' | 'rectangle' | 'text' | 'group';
export const DESIGN_NODE_TYPES: readonly DesignNodeType[] = ['frame', 'rectangle', 'text', 'group'];

/** Flat, read-only view of one node. */
export interface DesignNodeView {
  id: string;
  name: string;
  type: DesignNodeType;
  visible: boolean;
  /** Locked by the node itself or by an ancestor. */
  locked: boolean;
  /** Nesting level in the layers outline, 0 = top level. */
  depth: number;
  x: number; y: number; width: number; height: number;
  rotation: number;
  opacity: number;
  /** Corner radius (rect/frame only). */
  radius?: number;
  /** CSS hex colour `#rrggbb`, or null for none. */
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  /** Text nodes only. */
  text?: string;
  fontSize?: number;
}

/** Fields a single inspector edit can change. A patch is applied to every selected node as ONE undo step. */
export interface DesignNodePatch {
  name?: string;
  visible?: boolean;
  locked?: boolean;
  x?: number; y?: number; width?: number; height?: number;
  rotation?: number;
  opacity?: number;
  radius?: number;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  text?: string;
  fontSize?: number;
}

export type AlignKind = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';
export type DesignToolId = 'select' | 'hand' | 'frame' | 'rectangle' | 'text';

export interface DesignToolboxProps {
  active: DesignToolId;
  onSelectTool(tool: DesignToolId): void;
  disabled?: boolean;
}
export interface DesignLayersProps {
  /** Top-most layer first, children directly after their parent. */
  rows: readonly DesignNodeView[];
  selectedIds: readonly string[];
  /** `additive` = Ctrl/Cmd/Shift held. */
  onSelect(id: string, additive: boolean): void;
  onRename(id: string, name: string): void;
  onToggleVisible(id: string, visible: boolean): void;
  onToggleLocked(id: string, locked: boolean): void;
  /** One step forward (+1, towards the top) or backward (-1). */
  onReorder(id: string, direction: 1 | -1): void;
  onDelete(ids: readonly string[]): void;
  onDuplicate(ids: readonly string[]): void;
  disabled?: boolean;
}
export interface DesignInspectorProps {
  selection: readonly DesignNodeView[];
  onChange(patch: DesignNodePatch): void;
  onAlign(kind: AlignKind): void;
  onDistribute(axis: DistributeAxis): void;
  disabled?: boolean;
}
