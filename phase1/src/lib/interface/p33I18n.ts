const keys=['variantMatrix'];
const labels={en:['Variants matrix'],de:['Variantenmatrix'],es:['Matriz de variantes'],fr:['Matrice de variantes'],'pt-BR':['Matriz de variantes']};
export const INTERFACE_P33_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
