const keys=['justify','spaceBetween','crossGap'];
const labels={en:['Distribution','Space between','Cross gap'],de:['Verteilung','Zwischenraum füllen','Zeilenabstand'],es:['Distribución','Espacio entre','Espacio cruzado'],fr:['Répartition','Espace entre','Espacement transversal'],'pt-BR':['Distribuição','Espaço entre','Espaço cruzado']};
export const INTERFACE_P13_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
