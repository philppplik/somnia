const keys=['dropShadow','shadowBlur','shadowColor'];
const labels={en:['Drop shadow','Shadow blur','Shadow color'],de:['Schlagschatten','Weichzeichner','Schattenfarbe'],es:['Sombra','Desenfoque','Color de sombra'],fr:['Ombre portée','Flou',"Couleur de l'ombre"],'pt-BR':['Sombra','Desfoque','Cor da sombra']};
export const INTERFACE_P50_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
