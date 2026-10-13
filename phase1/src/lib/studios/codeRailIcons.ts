import {makeVadivamIcon,type LucideIcon} from '../icons';
/**
 * Rail icons the Code studio adds to the shared rail icon registry (lib/shell/railIcons.ts).
 * Every other Code rail icon comes from the shared set (components/shell/railIconSet.ts):
 * Layers, Files, Search, Boxes, Paintbrush, VersionsIcon, Hash, SlidersHorizontal.
 * Same function keeps the same glyph in every studio (concept 3.6): the outline panel uses the
 * `Hash` glyph the Documents outline already uses instead of inventing a second "outline" icon.
 */
/** Monitor with a phone: the responsive/breakpoint panel. */
export const MonitorSmartphoneIcon=makeVadivamIcon('monitor-smartphone','<rect x="2" y="4" width="13" height="10" rx="2"/><path d="M7 18h5M9.5 14v4"/><rect x="15" y="10" width="7" height="10" rx="1.5"/><path d="M17.5 17h2"/>');
export const CODE_RAIL_ICON_MAP:Record<string,LucideIcon>={
 MonitorSmartphone:MonitorSmartphoneIcon,
};
