const keys=['blendMode','blendMode.normal'];
const labels={en:['Blend mode','Normal'],de:['Mischmodus','Normal'],es:['Modo de fusión','Normal'],fr:['Mode de fusion','Normal'],'pt-BR':['Modo de mesclagem','Normal']};
export const INTERFACE_P46_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
