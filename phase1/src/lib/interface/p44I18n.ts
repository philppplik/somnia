const keys=['opacity'];
const labels={en:['Opacity'],de:['Deckkraft'],es:['Opacidad'],fr:['Opacité'],'pt-BR':['Opacidade']};
export const INTERFACE_P44_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
