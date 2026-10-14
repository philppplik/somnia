const keys=['collection','noCollection','modePreview'];
const labels={en:['Collection','No collection','Mode preview'],de:['Sammlung','Keine Sammlung','Modus-Vorschau'],es:['Colección','Sin colección','Vista previa del modo'],fr:['Collection','Sans collection','Aperçu du mode'],'pt-BR':['Coleção','Sem coleção','Prévia do modo']};
export const INTERFACE_P29_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
