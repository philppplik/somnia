import type {PhotoSettings} from './studioSettings';
export interface WbPreset{id:string;/** i18n key */labelKey:string;temp:number;tint:number;}
/** Named white-balance settings (Kelvin/tint pairs); 6500 K / 0 is neutral for JPEG/PNG sources. */
export const WB_PRESETS:readonly WbPreset[]=[
 {id:'tungsten',labelKey:'photos.wb.tungsten',temp:2850,tint:0},
 {id:'fluorescent',labelKey:'photos.wb.fluorescent',temp:4000,tint:10},
 {id:'daylight',labelKey:'photos.wb.daylight',temp:5500,tint:10},
 {id:'cloudy',labelKey:'photos.wb.cloudy',temp:7000,tint:20},
 {id:'shade',labelKey:'photos.wb.shade',temp:7500,tint:20},
 {id:'flash',labelKey:'photos.wb.flash',temp:6000,tint:0},
];
export function findWbPreset(id:string):WbPreset|undefined{return WB_PRESETS.find(p=>p.id===id);}
/** True when the settings currently sit exactly on a preset's pair. */
export function isWbPresetActive(s:Pick<PhotoSettings,'temp'|'tint'>,p:WbPreset):boolean{return s.temp===p.temp&&s.tint===p.tint;}
