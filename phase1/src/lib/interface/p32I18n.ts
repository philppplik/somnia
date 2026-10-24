const keys=['trigger.press'];
const labels={en:['Press to frame'],de:['Drücken zum Rahmen'],es:['Pulsar a marco'],fr:['Pression vers cadre'],'pt-BR':['Pressionar para quadro']};
export const INTERFACE_P32_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,values])=>[locale,Object.fromEntries(keys.map((key,i)=>[`interface.${key}`,values[i]]))]));
