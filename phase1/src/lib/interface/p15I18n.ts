const keys=['tokensCss','tokensJson','copyCss','cssCopied'];
const labels={en:['Tokens (CSS)','Tokens (JSON)','Copy CSS','CSS copied'],de:['Tokens (CSS)','Tokens (JSON)','CSS kopieren','CSS kopiert'],es:['Tokens (CSS)','Tokens (JSON)','Copiar CSS','CSS copiado'],fr:['Tokens (CSS)','Tokens (JSON)','Copier le CSS','CSS copié'],'pt-BR':['Tokens (CSS)','Tokens (JSON)','Copiar CSS','CSS copiado']};
export const INTERFACE_P15_CATALOGUES=Object.fromEntries(Object.entries(labels).map(([locale,v])=>[locale,Object.fromEntries(keys.map((k,i)=>[`interface.${k}`,v[i]]))]));
