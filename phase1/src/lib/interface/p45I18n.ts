const keys=['rotation'];
const labels={en:['Rotation'],de:['Drehung'],es:['Rotación'],fr:['Rotation'],'pt-BR':['Rotação']};
export const INTERFACE_P45_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
