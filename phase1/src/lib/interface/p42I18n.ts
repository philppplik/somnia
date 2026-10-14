const keys=['letterSpacing'];
const labels={en:['Letter spacing'],de:['Zeichenabstand'],es:['Espaciado de letras'],fr:['Espacement des lettres'],'pt-BR':['Espaçamento de letras']};
export const INTERFACE_P42_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
