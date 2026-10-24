const keys=['layerBlur','blurRadius'];
const labels={en:['Layer blur','Blur radius'],de:['Ebenenunschärfe','Unschärferadius'],es:['Desenfoque de capa','Radio de desenfoque'],fr:['Flou de calque','Rayon de flou'],'pt-BR':['Desfoque de camada','Raio de desfoque']};
export const INTERFACE_P51_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
