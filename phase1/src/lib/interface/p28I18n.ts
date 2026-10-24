const keys=['showHotspots','transitionPresets'];
const labels={en:['Highlight hotspots','Transition presets'],de:['Hotspots hervorheben','Übergangs-Presets'],es:['Resaltar hotspots','Presets de transición'],fr:['Surligner les hotspots','Préréglages de transition'],'pt-BR':['Destacar hotspots','Predefinições de transição']};
export const INTERFACE_P28_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
