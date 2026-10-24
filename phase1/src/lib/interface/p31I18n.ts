const keys=['padding'];
const labels={en:['Padding'],de:['Innenabstand'],es:['Relleno'],fr:['Marge intérieure'],'pt-BR':['Preenchimento']};
export const INTERFACE_P31_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
