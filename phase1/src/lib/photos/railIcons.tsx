import {Info,Palette,Sparkles,Eye,Frame,makeVadivamIcon,type LucideIcon} from '../icons';
/**
 * Rail icons for the Photos studio (Vadivam set, same grid and stroke as lib/icons).
 * Names are registered in the shell rail icon registry (lib/shell/railIcons.ts) by `registerPhotosRailIcons`.
 * `History` and `Info` are generic names: any studio that shows the same function uses the same glyph.
 * The develop sections carry a `Develop` prefix because their glyph only means something inside Photos.
 */
export const HistoryIcon=makeVadivamIcon('clock','<g><path d="M12 6.75v6l4 2"/><path d="M4.929 4.929A10 10 0 0 0 2 12a10.1 10.1 0 0 0 2.929 7.071A10.1 10.1 0 0 0 12 22c2.626 0 5.214-1.072 7.071-2.929A10.1 10.1 0 0 0 22 12A10 10 0 0 0 4.929 4.929"/></g>');
export const LightIcon=makeVadivamIcon('sun','<path d="M12 2.002v2.222m0 15.556v2.222M4.224 12H2.002m19.996 0h-2.222m0-7.776l-2.222 2.221M4.224 4.224l2.222 2.221m0 11.11l-2.222 2.22m15.552 0l-2.222-2.22M16.444 12a4.443 4.443 0 1 1-8.887 0a4.443 4.443 0 0 1 8.886 0"/>');
export const PHOTOS_RAIL_ICON_MAP:Record<string,LucideIcon>={
 History:HistoryIcon,Info,
 DevelopLight:LightIcon,DevelopColor:Palette,DevelopEffects:Sparkles,DevelopDetail:Eye,DevelopTransform:Frame,
};
