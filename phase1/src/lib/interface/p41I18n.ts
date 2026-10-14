const keys=['baseline'];
const labels={en:['Baseline'],de:['Grundlinie'],es:['Línea base'],fr:['Ligne de base'],'pt-BR':['Linha de base']};
export const INTERFACE_P41_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
