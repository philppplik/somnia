import type {LucideIcon} from '../icons';
import {PanelLeft} from '../icons';
/**
 * Rail icon registry. Manifests store icon *names*; this is the only place that maps a name to a glyph, so a studio
 * can register its own icons without touching IconRail. Resolution never throws: an unknown name yields the fallback.
 * Registration is first-wins per name (the same function keeps the same glyph in every studio), `replace` is for tests.
 */
const icons=new Map<string,LucideIcon>();
export const RAIL_FALLBACK_ICON:LucideIcon=PanelLeft;
export function registerRailIcons(map:Record<string,LucideIcon>,replace=false){for(const [k,v] of Object.entries(map))if(replace||!icons.has(k))icons.set(k,v);}
export const hasRailIcon=(name:string)=>icons.has(name);
export const resolveRailIcon=(name:string|undefined):LucideIcon=>(name?icons.get(name):undefined)??RAIL_FALLBACK_ICON;
export const listRailIcons=()=>[...icons.keys()].sort();
