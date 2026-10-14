const keys=['marquee'];
const labels={en:['Selection rectangle'],de:['Auswahlrechteck'],es:['Rectángulo de selección'],fr:['Rectangle de sélection'],'pt-BR':['Retângulo de seleção']};
export const INTERFACE_P55_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
