import type {ReactElement} from 'react';
import {Button} from '../ui/button';
import {useT} from '../../lib/useT';
import {DESIGN_TOOLS} from '../../lib/design/tools';
import type {DesignToolboxProps, DesignToolId} from '../../lib/design/panelContract';
const svg = (d: string) => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const ICONS: Record<DesignToolId, ReactElement> = {
  select: svg('M5 3l14 7-6 2-2 6z'),
  hand: svg('M8 13V5a1.5 1.5 0 013 0v6m0-1V3.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-1a6 6 0 01-5-3l-2-4a1.5 1.5 0 012.5-1.5L8 14'),
  frame: svg('M7 3v18M17 3v18M3 7h18M3 17h18'),
  rectangle: svg('M4 6h16v12H4z'),
  text: svg('M5 6V4h14v2M12 4v16M9 20h6'),
};
/** Vertical toolbox rail. Labels and shortcuts appear on hover (title) and to screen readers (aria-label). */
export function DesignToolbox({active, onSelectTool, disabled}: DesignToolboxProps) {
  const {t} = useT();
  return <div role="toolbar" aria-orientation="vertical" aria-label={t('design.toolbox')} data-testid="design-toolbox" className="flex flex-col items-center gap-1 p-1">
    {DESIGN_TOOLS.map(tool => {
      const label = t(tool.labelKey);
      return <Button key={tool.id} size="icon" variant="ghost" disabled={disabled} aria-pressed={active === tool.id}
        aria-label={`${label} (${tool.shortcut})`} title={`${label} (${tool.shortcut}): ${t(tool.hintKey)}`}
        data-testid={`design-tool-${tool.id}`} data-tool={tool.id} onClick={() => onSelectTool(tool.id)}>{ICONS[tool.id]}</Button>;
    })}
  </div>;
}
