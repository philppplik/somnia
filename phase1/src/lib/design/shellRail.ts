import {registerRailIcons} from '../shell/railIcons';
import {DESIGN_RAIL_ICON_MAP} from './railIcons';
let done=false;
/** Registers the Design rail glyphs once (first-wins registry). Imported by the manifest consumers, not by the manifest. */
export function registerDesignRailIcons(){if(done)return;done=true;registerRailIcons(DESIGN_RAIL_ICON_MAP);}
registerDesignRailIcons();
