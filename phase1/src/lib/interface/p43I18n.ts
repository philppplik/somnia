const keys=['cornerRadius'];
const labels={en:['Corner radius'],de:['Eckenradius'],es:['Radio de esquina'],fr:['Rayon d\'angle'],'pt-BR':['Raio de canto']};
export const INTERFACE_P43_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
