import { useMemo } from 'react';
import type { Viewport } from '../../lib/image-editor/types';
import { selectionOutline, type SelectionMask } from '../../lib/imgedit/select';
export function SelectionOverlay({ selection, viewport }: { selection: SelectionMask | null; viewport: Viewport }) {
  const path = useMemo(() => selection ? selectionOutline(selection) : '', [selection]);
  if (!path) return null;
  return <svg aria-hidden="true" data-testid="selection-overlay" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
    <style>{`@keyframes somnia-selection-ants { to { stroke-dashoffset: -8; } }
      .somnia-selection-ants { animation: somnia-selection-ants .8s linear infinite; }
      @media (prefers-reduced-motion: reduce) { .somnia-selection-ants { animation: none; } }`}</style>
    <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`} fill="none" strokeWidth="1" strokeLinecap="butt">
      <path d={path} stroke="white" vectorEffect="non-scaling-stroke" />
      <path className="somnia-selection-ants" d={path} stroke="black" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
    </g>
  </svg>;
}
