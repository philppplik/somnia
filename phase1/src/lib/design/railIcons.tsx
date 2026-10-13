import {Frame,Layers,LayoutTemplate,MousePointer2,Palette,SlidersHorizontal,Square,Type,makeVadivamIcon,type LucideIcon} from '../icons';
/** Rail icons for the Design studio. Names are shared across studios where the function is the same. */
export const HandIcon=makeVadivamIcon('hand','<g><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></g>');
export const DESIGN_RAIL_ICON_MAP:Record<string,LucideIcon>={
 DesignSelect:MousePointer2,DesignHand:HandIcon,DesignArtboardTool:Frame,DesignRectangle:Square,DesignText:Type,
 DesignLayers:Layers,DesignArtboards:LayoutTemplate,DesignColors:Palette,DesignInspector:SlidersHorizontal,
};
