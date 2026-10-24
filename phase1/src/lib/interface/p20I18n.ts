const keys=['componentPreview'];
const labels={en:['Live preview'],de:['Live-Vorschau'],es:['Vista previa en vivo'],fr:['Aperçu en direct'],'pt-BR':['Pré-visualização ao vivo']};
export const INTERFACE_P20_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
